// expirations — fermer les accès arrivés à leur fin, et rejouer les livraisons
// en échec. Appelée chaque nuit par pg_cron, et par le propriétaire pour
// révoquer un accès à la main (remboursement, abus).
//
// Le cron s'authentifie par l'en-tête x-orci-cron, comparé au secret que la
// base a généré elle-même (`prive.reglages.cron_secret`) : aucun humain ne l'a
// jamais vu, aucun fichier ne le contient.
//
// Actions admin :
//   revoquer { acces_id }  → ferme l'accès et retire l'acheteur de chaque outil
//   rejouer  { acces_id }  → retente les livraisons en attente ou en erreur
//   nettoyer_tests         → sort des outils les acheteurs des achats de test,
//                            avant que l'espace admin n'efface ces achats

import { admin, egal, erreur, json, lireCorps, preflight, proprietaire, reglage, texte } from "../_shared/base.ts";
import { livrer, retirer } from "../_shared/livraison.ts";

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;

  const cron = req.headers.get("x-orci-cron");
  if (cron !== null) {
    const attendu = await reglage("cron_secret");
    if (!attendu || !egal(cron, attendu)) return erreur("Interdit", 401);
    return json(await passeNocturne());
  }

  const moi = await proprietaire(req);
  if (!moi) return erreur("Connecte-toi d'abord.", 401);

  const corps = await lireCorps(req);
  if (corps.action === "nettoyer_tests") {
    try {
      return json(await nettoyerTests(moi.formateurId));
    } catch (e) {
      console.error("[expirations] nettoyage :", e);
      return erreur(e instanceof Error ? e.message : "Erreur interne", 500);
    }
  }

  const accesId = texte(corps.acces_id, 40);
  const { data: a } = await admin()
    .from("acces")
    .select("id, statut, offres(formateur_id)")
    .eq("id", accesId)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  if (!a || (a as any).offres?.formateur_id !== moi.formateurId) return erreur("Accès introuvable.", 404);

  try {
    switch (corps.action) {
      case "revoquer":
        await retirer(a.id, "revoque");
        return json({ ok: true });
      case "rejouer":
        if (a.statut === "actif") await livrer(a.id);
        else await retirer(a.id, a.statut as "expire" | "revoque");
        return json({ ok: true });
      default:
        return erreur("Action inconnue");
    }
  } catch (e) {
    console.error("[expirations]", e);
    return erreur(e instanceof Error ? e.message : "Erreur interne", 500);
  }
});

async function passeNocturne(): Promise<Record<string, number>> {
  const maintenant = new Date().toISOString();

  const { data: finis } = await admin()
    .from("acces")
    .select("id")
    .eq("statut", "actif")
    .lt("fin", maintenant)
    .limit(200);
  for (const a of finis ?? []) {
    try {
      await retirer(a.id, "expire");
    } catch (e) {
      console.error(`[expirations] ${a.id} :`, e instanceof Error ? e.message : e);
    }
  }

  // Les livraisons en erreur se rejouent : un Google momentanément injoignable
  // ne doit pas laisser un acheteur sans son dossier.
  const { data: enErreur } = await admin()
    .from("livraisons")
    .select("acces_id, acces(statut)")
    .eq("statut", "erreur")
    .limit(200);
  const vus = new Set<string>();
  let rejoues = 0;
  for (const l of enErreur ?? []) {
    if (vus.has(l.acces_id)) continue;
    vus.add(l.acces_id);
    // deno-lint-ignore no-explicit-any
    const statut = (l as any).acces?.statut as string | undefined;
    try {
      if (statut === "actif") await livrer(l.acces_id);
      else if (statut === "expire" || statut === "revoque") await retirer(l.acces_id, statut);
      rejoues++;
    } catch (e) {
      console.error(`[expirations] rejeu ${l.acces_id} :`, e instanceof Error ? e.message : e);
    }
  }

  return { expires: finis?.length ?? 0, rejoues };
}

/**
 * Effacer une ligne ne sort personne d'un groupe Telegram ni d'un dossier
 * Drive. Les accès nés d'un achat de test sont donc refermés outil par outil
 * avant que `effacer_donnees_test()` ne les supprime.
 */
async function nettoyerTests(formateurId: string): Promise<Record<string, number>> {
  const { data: cs, error } = await admin()
    .from("commandes")
    .select("id")
    .eq("formateur_id", formateurId)
    .eq("test", true)
    .limit(500);
  if (error) throw new Error(`Achats de test illisibles : ${error.message}`);
  const ids = (cs ?? []).map((c: { id: string }) => c.id);
  if (!ids.length) return { retires: 0 };

  const { data: as } = await admin()
    .from("acces")
    .select("id, offre_id, acheteur_id")
    .in("derniere_commande_id", ids);
  let retires = 0;
  for (const a of as ?? []) {
    // Un accès acheté pour de vrai, puis « renouvelé » par un achat de test,
    // reste ouvert : `effacer_donnees_test()` le rend à sa vraie commande.
    const { count } = await admin()
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("offre_id", a.offre_id)
      .eq("acheteur_id", a.acheteur_id)
      .eq("statut", "paye")
      .eq("test", false);
    if ((count ?? 0) > 0) continue;

    try {
      await retirer(a.id, "revoque");
      retires++;
    } catch (e) {
      console.error(`[expirations] test ${a.id} :`, e instanceof Error ? e.message : e);
    }
  }
  return { retires };
}
