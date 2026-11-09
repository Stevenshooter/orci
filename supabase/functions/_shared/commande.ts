// Orci — le seul chemin par lequel une commande change de statut.
//
// Webhook du fournisseur, vérification au retour, simulation : tous passent ici.
// Un seul endroit décide donc qu'un paiement est acquis, ouvre l'accès et lance
// les livraisons. Le dupliquer, c'est garantir qu'un des chemins soit oublié le
// jour d'une correction.

import { admin } from "./base.ts";
import { livrer, retirer } from "./livraison.ts";
import { rangStatut, type Statut } from "./paiement.ts";

export interface Resultat {
  readonly statut: Statut;
  readonly accesId: string | null;
  readonly jeton: string | null;
}

export async function appliquerStatut(
  commandeId: string,
  nouveau: Statut,
  meta: Record<string, unknown> = {},
): Promise<Resultat> {
  const { data: c, error } = await admin()
    .from("commandes")
    .select("id, statut, meta")
    .eq("id", commandeId)
    .single();
  if (error || !c) throw new Error(`Commande introuvable : ${error?.message ?? commandeId}`);

  let statut = c.statut as Statut;

  // Une notification en retard ne fait jamais reculer un paiement.
  if (nouveau !== statut && rangStatut(nouveau) >= rangStatut(statut)) {
    const maj: Record<string, unknown> = { statut: nouveau, meta: { ...(c.meta ?? {}), ...meta } };
    if (nouveau === "paye") maj.payee_le = new Date().toISOString();
    const { error: e2 } = await admin().from("commandes").update(maj).eq("id", commandeId);
    if (e2) throw new Error(`Statut non enregistré : ${e2.message}`);
    statut = nouveau;
  }

  let accesId: string | null = null;

  if (statut === "paye") {
    // Idempotent côté base : rejouer ne prolonge rien deux fois.
    const { data, error: e3 } = await admin().rpc("accorder_acces", { p_commande: commandeId });
    if (e3) throw new Error(`Accès non accordé : ${e3.message}`);
    accesId = (data as string | null) ?? null;
    if (accesId) {
      try {
        await livrer(accesId);
      } catch (e) {
        // L'accès existe : une livraison ratée se rejoue, elle ne doit pas
        // faire croire à l'acheteur que son paiement a échoué.
        console.error("[commande] livraison différée :", e instanceof Error ? e.message : e);
      }
    }
  }

  if (statut === "rembourse") {
    const { data: a } = await admin()
      .from("acces")
      .select("id")
      .eq("derniere_commande_id", commandeId)
      .maybeSingle();
    if (a) {
      accesId = a.id as string;
      await retirer(accesId, "revoque");
    }
  }

  let jeton: string | null = null;
  if (accesId && statut === "paye") {
    const { data: a } = await admin().from("acces").select("jeton").eq("id", accesId).single();
    jeton = (a?.jeton as string | undefined) ?? null;
  }

  return { statut, accesId, jeton };
}
