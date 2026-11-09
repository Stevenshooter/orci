// google — relier le compte Google du formateur, créer le dossier Drive de la
// formation, et programmer les lives Meet.
//
// GET ?code=…&state=… : le retour de Google après autorisation (aucun jeton de
// session possible ici : c'est le navigateur qui revient de chez Google). Le
// `state` est signé par la base, il prouve que la demande venait d'Orci.
//
// POST, propriétaire connecté :
//   etat                                     → identifiants posés ? compte relié ?
//   identifiants { client_id, client_secret } → enregistre l'application OAuth
//   connecter                                → l'adresse d'autorisation Google
//   oublier                                  → délie le compte
//   dossier      { outil_id }                → crée le dossier « Orci — <formation> »
//   live         { offre_id, titre, debut, duree } → crée le live et son lien Meet
//   supprimer_live { live_id }

import {
  admin,
  definirReglage,
  egal,
  erreur,
  json,
  lireCorps,
  preflight,
  proprietaire,
  reglage,
  siteUrl,
  texte,
  urlFonction,
} from "../_shared/base.ts";
import * as google from "../_shared/google.ts";
import { livrer } from "../_shared/livraison.ts";

// deno-lint-ignore no-explicit-any
type Ligne = any;

const REDIRECT = () => urlFonction("google");

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;

  const url = new URL(req.url);
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    return await retour(url);
  }

  const moi = await proprietaire(req);
  if (!moi) return erreur("Connecte-toi d'abord.", 401);

  const corps = await lireCorps(req);
  try {
    switch (corps.action) {
      case "etat":
        return json(await etat(moi.formateurId));
      case "identifiants":
        return await identifiants(texte(corps.client_id, 200), texte(corps.client_secret, 200));
      case "connecter":
        return await connecter(moi.formateurId);
      case "oublier":
        await admin().rpc("google_oublier", { p_formateur: moi.formateurId });
        return json({ ok: true });
      case "dossier":
        return await dossier(moi.formateurId, texte(corps.outil_id, 40));
      case "live":
        return await live(moi.formateurId, corps);
      case "supprimer_live":
        return await supprimerLive(moi.formateurId, texte(corps.live_id, 40));
      default:
        return erreur("Action inconnue");
    }
  } catch (e) {
    console.error("[google]", e);
    return erreur(e instanceof Error ? e.message : "Erreur interne", 500);
  }
});

// ---------------------------------------------------------------------------
// Signature du `state` : formateur.expiration.signature
// ---------------------------------------------------------------------------

async function cleSignature(): Promise<CryptoKey> {
  const secret = await reglage("etat_secret");
  if (!secret) throw new Error("Secret de signature absent de la base.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signer(formateurId: string): Promise<string> {
  const charge = `${formateurId}.${Date.now() + 15 * 60_000}`;
  const sig = await crypto.subtle.sign("HMAC", await cleSignature(), new TextEncoder().encode(charge));
  return `${charge}.${b64(sig)}`;
}

async function verifier(etat: string): Promise<string | null> {
  const [id, exp, sig] = etat.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const attendu = b64(await crypto.subtle.sign("HMAC", await cleSignature(), new TextEncoder().encode(`${id}.${exp}`)));
  return egal(attendu, sig) ? id : null;
}

// ---------------------------------------------------------------------------

async function retour(url: URL): Promise<Response> {
  const site = await siteUrl();
  const aller = (statut: string) => Response.redirect(`${site}/admin/outils?google=${statut}`, 302);

  if (url.searchParams.get("error")) return aller("refus");
  const formateurId = await verifier(url.searchParams.get("state") ?? "");
  if (!formateurId) return aller("expire");

  try {
    const r = await google.echangerCode(url.searchParams.get("code") ?? "", REDIRECT());
    if (!r.refreshToken) return aller("sans-refresh");
    await admin().rpc("google_enregistrer", {
      p_formateur: formateurId,
      p_email: r.email,
      p_refresh: r.refreshToken,
      p_scopes: r.scopes,
    });
    return aller("ok");
  } catch (e) {
    console.error("[google] retour :", e instanceof Error ? e.message : e);
    return aller("erreur");
  }
}

async function etat(formateurId: string): Promise<Record<string, unknown>> {
  const id = await google.identifiants();
  const { data } = await admin().rpc("google_jeton", { p_formateur: formateurId });
  const scopes = String((data as Ligne)?.scopes ?? "");
  return {
    identifiants: Boolean(id),
    connecte: Boolean(data),
    email: (data as Ligne)?.email ?? null,
    drive: scopes.includes("drive.file"),
    agenda: scopes.includes("calendar.events"),
    redirect_uri: REDIRECT(),
  };
}

async function identifiants(clientId: string, clientSecret: string): Promise<Response> {
  if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
    return erreur("L'ID client se termine par .apps.googleusercontent.com.");
  }
  if (clientSecret.length < 10) return erreur("Le code secret du client semble incomplet.");
  await definirReglage("google_client_id", clientId);
  await definirReglage("google_client_secret", clientSecret);
  return json({ ok: true });
}

async function connecter(formateurId: string): Promise<Response> {
  const id = await google.identifiants();
  if (!id) return erreur("Colle d'abord l'ID client et le code secret Google.", 409);
  return json({ url: google.urlConnexion(id.clientId, REDIRECT(), await signer(formateurId)) });
}

async function offreDe(formateurId: string, offreId: string): Promise<Ligne | null> {
  const { data } = await admin()
    .from("offres")
    .select("id, titre, formateur_id")
    .eq("id", offreId)
    .eq("formateur_id", formateurId)
    .maybeSingle();
  return data;
}

async function accesActifs(offreId: string): Promise<Ligne[]> {
  const { data } = await admin()
    .from("acces")
    .select("id, acheteurs(email)")
    .eq("offre_id", offreId)
    .eq("statut", "actif");
  return data ?? [];
}

async function dossier(formateurId: string, outilId: string): Promise<Response> {
  const { data: o } = await admin().from("outils").select("id, type, config, offre_id").eq("id", outilId).maybeSingle();
  if (!o || o.type !== "drive") return erreur("Outil introuvable.", 404);
  const offre = await offreDe(formateurId, o.offre_id);
  if (!offre) return erreur("Outil introuvable.", 404);

  if (o.config?.dossier_id) return json({ dossier_url: o.config.dossier_url });

  const d = await google.creerDossier(formateurId, `Orci — ${offre.titre}`);
  await admin()
    .from("outils")
    .update({ config: { ...(o.config ?? {}), dossier_id: d.id, dossier_url: d.webViewLink } })
    .eq("id", o.id);

  // Les acheteurs déjà là reçoivent le dossier tout de suite.
  for (const a of await accesActifs(offre.id)) await livrer(a.id);
  return json({ dossier_url: d.webViewLink });
}

async function live(formateurId: string, corps: Record<string, unknown>): Promise<Response> {
  const offre = await offreDe(formateurId, texte(corps.offre_id, 40));
  if (!offre) return erreur("Offre introuvable.", 404);

  const titre = texte(corps.titre, 120);
  const debut = new Date(texte(corps.debut, 40));
  const duree = Math.min(Math.max(Number(corps.duree) || 60, 15), 480);
  if (titre.length < 2) return erreur("Donne un titre au live.");
  if (Number.isNaN(debut.getTime()) || debut.getTime() < Date.now() - 3600_000) return erreur("Choisis une date à venir.");

  const actifs = await accesActifs(offre.id);
  const invites = [...new Set(actifs.map((a) => a.acheteurs?.email).filter(Boolean) as string[])];

  const ev = await google.creerEvenement(formateurId, {
    titre: `${titre} — ${offre.titre}`,
    description: `Live de la formation « ${offre.titre} ». Rejoins-le avec le lien Google Meet de cette invitation.`,
    debut,
    fin: new Date(debut.getTime() + duree * 60_000),
    invites,
  });

  const { data: l, error } = await admin()
    .from("lives")
    .insert({ offre_id: offre.id, titre, debut: debut.toISOString(), duree_minutes: duree, meet_url: ev.hangoutLink ?? null, google_event_id: ev.id })
    .select("id, titre, debut, duree_minutes, meet_url")
    .single();
  if (error) throw new Error(`Live non enregistré : ${error.message}`);

  // Ceux qui ont une adresse sont invités : leur livraison Meet est faite.
  for (const a of actifs) if (a.acheteurs?.email) await livrer(a.id);
  return json({ live: l, invites: invites.length });
}

async function supprimerLive(formateurId: string, liveId: string): Promise<Response> {
  const { data: l } = await admin().from("lives").select("id, offre_id, google_event_id").eq("id", liveId).maybeSingle();
  if (!l || !(await offreDe(formateurId, l.offre_id))) return erreur("Live introuvable.", 404);
  if (l.google_event_id) await google.supprimerEvenement(formateurId, l.google_event_id);
  await admin().from("lives").delete().eq("id", l.id);
  return json({ ok: true });
}
