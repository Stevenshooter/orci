// paiement — ouvrir un paiement, suivre son statut, et (en mode test) le simuler.
//
// Appelée par la page de paiement, sans compte : verify_jwt = false. Rien ici ne
// fait confiance au navigateur pour le prix ; il est relu dans `offres`.
//
// Actions :
//   creer   { offre, nom, telephone, operateur, email?, source? } → { reference, mode, url }
//   statut  { reference }                                          → { statut, jeton? }
//   simuler { reference, resultat: "paye" | "echec" }              → { statut, jeton? }  (mode test seulement)
//   mode                                                           → { mode }  (« simulation » ou « nexuspay »)

import {
  admin,
  aleatoire,
  emailValide,
  erreur,
  json,
  lireCorps,
  preflight,
  siteUrl,
  telephoneNormalise,
  texte,
  urlFonction,
} from "../_shared/base.ts";
import { appliquerStatut } from "../_shared/commande.ts";
import { creerPaiement, modePaiement } from "../_shared/paiement.ts";

const OPERATEURS = new Set(["mtn", "orange"]);

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;
  if (req.method !== "POST") return erreur("Méthode non permise", 405);

  const corps = await lireCorps(req);
  try {
    switch (corps.action) {
      case "creer":
        return await creer(req, corps);
      case "statut":
        return await statut(corps);
      case "simuler":
        return await simuler(corps);
      case "mode":
        return json({ mode: await modePaiement() });
      default:
        return erreur("Action inconnue");
    }
  } catch (e) {
    console.error("[paiement]", e);
    return erreur(e instanceof Error ? e.message : "Erreur interne", 500);
  }
});

async function creer(req: Request, corps: Record<string, unknown>): Promise<Response> {
  const slug = texte(corps.offre, 60);
  const nom = texte(corps.nom, 80).replace(/\s+/g, " ");
  const telephone = telephoneNormalise(texte(corps.telephone, 30));
  const operateur = texte(corps.operateur, 20).toLowerCase();
  const emailBrut = texte(corps.email, 254);
  const email = emailBrut ? emailValide(emailBrut) : null;
  const source = texte(corps.source, 60).toLowerCase().replace(/[^a-z0-9_.-]/g, "") || null;

  if (nom.length < 2) return erreur("Écris ton nom complet.");
  if (!telephone) return erreur("Ce numéro ne semble pas valide. Écris-le avec ses 9 chiffres.");
  if (!OPERATEURS.has(operateur)) return erreur("Choisis ton opérateur.");
  if (emailBrut && !email) return erreur("Cette adresse e-mail ne semble pas valide.");

  const { data: offre } = await admin()
    .from("offres")
    .select("id, titre, prix, devise, formateur_id, publiee")
    .eq("slug", slug)
    .maybeSingle();
  if (!offre || !offre.publiee) return erreur("Cette offre n'existe pas ou n'est plus en vente.", 404);

  // Garde-fou : cinq tentatives par numéro et par quart d'heure.
  const { data: connu } = await admin().from("acheteurs").select("id").eq("telephone", telephone).maybeSingle();
  if (connu) {
    const { count } = await admin()
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("acheteur_id", connu.id)
      .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
    if ((count ?? 0) >= 5) return erreur("Trop de tentatives. Réessaie dans quelques minutes.", 429);
  }

  // L'e-mail n'est écrit que s'il est donné : ne pas effacer celui d'un acheteur
  // qui revient sans le retaper.
  const champs: Record<string, unknown> = { telephone, nom };
  if (email) champs.email = email;
  const { data: acheteur, error: eA } = await admin()
    .from("acheteurs")
    .upsert(champs, { onConflict: "telephone" })
    .select("id")
    .single();
  if (eA || !acheteur) throw new Error(`Acheteur non enregistré : ${eA?.message}`);

  const mode = await modePaiement();
  const reference = `ORC-${aleatoire(6).toUpperCase()}`;

  const { data: commande, error: eC } = await admin()
    .from("commandes")
    .insert({
      reference,
      offre_id: offre.id,
      formateur_id: offre.formateur_id,
      acheteur_id: acheteur.id,
      montant: offre.prix,
      devise: offre.devise,
      operateur,
      fournisseur: mode,
      test: mode === "simulation",
      source,
    })
    .select("id")
    .single();
  if (eC || !commande) throw new Error(`Commande non enregistrée : ${eC?.message}`);

  const site = await siteUrl(req);
  try {
    const r = await creerPaiement(mode, {
      reference,
      montant: offre.prix,
      devise: offre.devise,
      description: offre.titre,
      telephone,
      operateur,
      nom,
      email,
      retourUrl: `${site}/paiement/${reference}`,
      notificationUrl: urlFonction("paiement"),
    });
    await admin()
      .from("commandes")
      .update({ fournisseur_reference: r.fournisseurReference, meta: { creation: r.brut } })
      .eq("id", commande.id);
    return json({ reference, mode, url: r.url });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await admin().from("commandes").update({ statut: "echec", meta: { erreur: m } }).eq("id", commande.id);
    return erreur(`Le paiement n'a pas pu démarrer : ${m}`, 502);
  }
}

async function statut(corps: Record<string, unknown>): Promise<Response> {
  const reference = texte(corps.reference, 40);
  const { data: c } = await admin()
    .from("commandes")
    .select("id, statut, fournisseur, montant, devise, operateur, offres(titre, slug)")
    .eq("reference", reference)
    .maybeSingle();
  if (!c) return erreur("Commande introuvable.", 404);

  let resultat: { statut: string; jeton: string | null } = { statut: c.statut, jeton: null };
  if (c.statut === "paye") {
    const r = await appliquerStatut(c.id, "paye");
    resultat = { statut: r.statut, jeton: r.jeton };
  }
  // Nexus Pay : relire ici le statut chez le fournisseur quand la notification tarde.

  return json({
    ...resultat,
    mode: c.fournisseur,
    montant: c.montant,
    devise: c.devise,
    operateur: c.operateur,
    offre: c.offres,
  });
}

async function simuler(corps: Record<string, unknown>): Promise<Response> {
  if ((await modePaiement()) !== "simulation") return erreur("Le mode test est coupé.", 403);

  const reference = texte(corps.reference, 40);
  const voulu = corps.resultat === "paye" ? "paye" : "echec";
  const { data: c } = await admin().from("commandes").select("id, test").eq("reference", reference).maybeSingle();
  if (!c || !c.test) return erreur("Commande introuvable.", 404);

  const r = await appliquerStatut(c.id, voulu, { simulation: voulu });
  return json({ statut: r.statut, jeton: r.jeton });
}
