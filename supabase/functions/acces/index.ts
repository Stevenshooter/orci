// acces — la page « Mes accès » de l'acheteur.
//
// L'acheteur n'a pas de compte : le jeton secret de son lien EST son accès
// (48 caractères hexadécimaux, impossible à deviner). verify_jwt = false.
//
// Actions :
//   voir     { jeton }          → l'offre, l'état de l'accès et de chaque outil
//   telegram { jeton }          → un lien d'entrée personnel, valable 24 h, une seule personne
//   email    { jeton, email }   → l'adresse Google pour Drive et les lives Meet

import { admin, emailValide, erreur, json, lireCorps, preflight, texte } from "../_shared/base.ts";
import * as google from "../_shared/google.ts";
import { livrer } from "../_shared/livraison.ts";
import * as telegram from "../_shared/telegram.ts";

// deno-lint-ignore no-explicit-any
type Ligne = any;

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;
  if (req.method !== "POST") return erreur("Méthode non permise", 405);

  const corps = await lireCorps(req);
  const jeton = texte(corps.jeton, 64).toLowerCase();
  if (!/^[0-9a-f]{48}$/.test(jeton)) return erreur("Lien d'accès invalide.", 404);

  try {
    const acces = await chargerAcces(jeton);
    if (!acces) return erreur("Lien d'accès invalide.", 404);

    switch (corps.action) {
      case "voir":
        return json(await vue(acces));
      case "telegram":
        return await rejoindreTelegram(acces);
      case "email":
        return await enregistrerEmail(acces, texte(corps.email, 254));
      default:
        return erreur("Action inconnue");
    }
  } catch (e) {
    console.error("[acces]", e);
    return erreur(e instanceof Error ? e.message : "Erreur interne", 500);
  }
});

async function chargerAcces(jeton: string): Promise<Ligne | null> {
  const { data, error } = await admin()
    .from("acces")
    .select(
      "id, statut, debut, fin, offre_id, " +
        "offres(id, titre, slug, image_url, formateur_id, formateurs(nom, whatsapp)), " +
        "acheteurs(id, nom, email, telephone)",
    )
    .eq("jeton", jeton)
    .maybeSingle();
  if (error) throw new Error(`Accès illisible : ${error.message}`);
  return data;
}

/**
 * Un outil ajouté APRÈS l'achat doit aussi profiter aux acheteurs déjà là :
 * on crée ici les livraisons qui manquent, au moment où la page est ouverte.
 */
async function livraisons(acces: Ligne): Promise<Ligne[]> {
  const { data: outils } = await admin()
    .from("outils")
    .select("id, type, titre, config, actif, ordre")
    .eq("offre_id", acces.offre_id)
    .eq("actif", true)
    .order("ordre");

  const { data: ls } = await admin().from("livraisons").select("id, outil_id, statut, details, erreur").eq("acces_id", acces.id);
  const parOutil = new Map((ls ?? []).map((l: Ligne) => [l.outil_id, l]));

  if (acces.statut === "actif") {
    const manquants = (outils ?? []).filter((o: Ligne) => !parOutil.has(o.id));
    if (manquants.length) {
      const { data: crees } = await admin()
        .from("livraisons")
        .upsert(
          manquants.map((o: Ligne) => ({ acces_id: acces.id, outil_id: o.id, statut: o.type === "lien" ? "fait" : "a_faire" })),
          { onConflict: "acces_id,outil_id", ignoreDuplicates: true },
        )
        .select("id, outil_id, statut, details, erreur");
      for (const l of crees ?? []) parOutil.set(l.outil_id, l);
    }
  }

  return (outils ?? []).map((o: Ligne) => ({ outil: o, livraison: parOutil.get(o.id) ?? null }));
}

async function vue(acces: Ligne): Promise<Record<string, unknown>> {
  const actif = acces.statut === "actif";
  const email = acces.acheteurs?.email ?? null;
  const items = await livraisons(acces);

  const { data: lives } = await admin()
    .from("lives")
    .select("id, titre, debut, duree_minutes, meet_url")
    .eq("offre_id", acces.offre_id)
    .gte("debut", new Date(Date.now() - 3 * 3600_000).toISOString())
    .order("debut");

  const outils = items.map(({ outil, livraison }) => {
    const cfg = outil.config ?? {};
    const st = livraison?.statut ?? "a_faire";
    const base = { type: outil.type, titre: outil.titre };
    if (!actif) return { ...base, etat: "fini" };

    switch (outil.type) {
      case "telegram":
        if (!cfg.chat_id) return { ...base, etat: "bientot" };
        return { ...base, etat: st === "fait" ? "dedans" : "rejoindre" };
      case "whatsapp":
        if (!cfg.lien) return { ...base, etat: "bientot" };
        return { ...base, etat: st === "fait" ? "valide" : "en_attente", lien: cfg.lien };
      case "drive":
        if (!cfg.dossier_id) return { ...base, etat: "bientot" };
        if (!email) return { ...base, etat: "email" };
        if (st === "fait") return { ...base, etat: "partage", url: cfg.dossier_url ?? null, email };
        if (st === "erreur") return { ...base, etat: "erreur" };
        return { ...base, etat: "en_cours", email };
      case "meet":
        if (!email) return { ...base, etat: "email", lives: (lives ?? []).map(({ meet_url: _m, ...l }: Ligne) => l) };
        return { ...base, etat: "invite", email, lives: lives ?? [] };
      case "lien":
        return cfg.url ? { ...base, etat: "pret", url: cfg.url } : { ...base, etat: "bientot" };
      default:
        return { ...base, etat: "bientot" };
    }
  });

  return {
    acheteur: { prenom: String(acces.acheteurs?.nom ?? "").split(" ")[0], email },
    offre: {
      titre: acces.offres?.titre,
      slug: acces.offres?.slug,
      image_url: acces.offres?.image_url,
      formateur: acces.offres?.formateurs ?? null,
    },
    acces: { statut: acces.statut, debut: acces.debut, fin: acces.fin },
    outils,
  };
}

async function rejoindreTelegram(acces: Ligne): Promise<Response> {
  if (acces.statut !== "actif") return erreur("Ton accès est terminé.", 403);

  const items = await livraisons(acces);
  const t = items.find((i) => i.outil.type === "telegram");
  if (!t?.livraison || !t.outil.config?.chat_id) return erreur("Le groupe Telegram n'est pas encore prêt.", 409);
  if (t.livraison.statut === "fait") return json({ deja: true });

  const d = t.livraison.details ?? {};
  // Un lien déjà créé et encore valable est rendu tel quel : cliquer deux fois
  // ne doit pas fabriquer deux portes.
  if (d.invite_link && Number(d.invite_expire ?? 0) * 1000 > Date.now() + 5 * 60_000) {
    return json({ lien: d.invite_link });
  }

  const lien = await telegram.creerLienUnique(t.outil.config.chat_id, `Orci ${acces.acheteurs?.nom ?? ""}`.trim());
  await admin()
    .from("livraisons")
    .update({ details: { ...d, invite_link: lien.invite_link, invite_expire: lien.expire_date ?? null }, erreur: null })
    .eq("id", t.livraison.id);
  return json({ lien: lien.invite_link });
}

async function enregistrerEmail(acces: Ligne, brut: string): Promise<Response> {
  if (acces.statut !== "actif") return erreur("Ton accès est terminé.", 403);
  const email = emailValide(brut);
  if (!email) return erreur("Cette adresse ne semble pas valide.");

  const ancien = acces.acheteurs?.email ?? null;
  if (ancien !== email) {
    // Changer d'adresse : l'ancienne perd le dossier et les invitations.
    const items = await livraisons(acces);
    for (const { outil, livraison } of items) {
      if (!livraison || livraison.statut !== "fait" || !ancien) continue;
      try {
        if (outil.type === "drive" && outil.config?.dossier_id && livraison.details?.permission_id) {
          await google.retirerPartage(acces.offres.formateur_id, outil.config.dossier_id, livraison.details.permission_id);
        }
        if (outil.type === "meet") {
          const { data: lives } = await admin()
            .from("lives")
            .select("google_event_id")
            .eq("offre_id", acces.offre_id)
            .gte("debut", new Date().toISOString());
          for (const l of lives ?? []) {
            if (l.google_event_id) await google.modifierInvites(acces.offres.formateur_id, l.google_event_id, [], [ancien]);
          }
        }
      } catch (e) {
        console.error("[acces] ancienne adresse non retirée :", e instanceof Error ? e.message : e);
      }
      if (outil.type === "drive" || outil.type === "meet") {
        await admin().from("livraisons").update({ statut: "a_faire", details: {} }).eq("id", livraison.id);
      }
    }

    const { error } = await admin().from("acheteurs").update({ email }).eq("id", acces.acheteurs.id);
    if (error) throw new Error(`Adresse non enregistrée : ${error.message}`);
  }

  await livrer(acces.id);
  const frais = await chargerAcces(await jetonDe(acces.id));
  return json(await vue(frais));
}

async function jetonDe(accesId: string): Promise<string> {
  const { data } = await admin().from("acces").select("jeton").eq("id", accesId).single();
  return data?.jeton as string;
}
