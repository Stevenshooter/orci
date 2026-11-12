// Orci — le seul chemin par lequel une commande change de statut.
//
// Webhook du fournisseur, vérification au retour, simulation : tous passent ici.
// Un seul endroit décide donc qu'un paiement est acquis, ouvre l'accès et lance
// les livraisons. Le dupliquer, c'est garantir qu'un des chemins soit oublié le
// jour d'une correction.

import { admin } from "./base.ts";
import { livrer, retirer } from "./livraison.ts";
import { type EtatNelsius, lireStatutNelsius } from "./nelsius.ts";
import { rangStatut, type Statut } from "./paiement.ts";

export interface Resultat {
  readonly statut: Statut;
  readonly accesId: string | null;
  readonly jeton: string | null;
}

/** Ce qu'il faut d'une commande pour la confronter au fournisseur. */
export interface CommandeSuivie {
  readonly id: string;
  readonly reference: string;
  readonly fournisseur: string;
  readonly fournisseur_reference: string | null;
  readonly statut: string;
  readonly montant: number;
  readonly devise: string;
}

export const CHAMPS_SUIVI = "id, reference, fournisseur, fournisseur_reference, statut, montant, devise";

/**
 * Relire chez NelsiusPay le statut d'une commande, et l'appliquer.
 *
 * C'est la seule porte d'un vrai paiement : le retour du navigateur, une
 * notification et la passe horaire passent tous par ici. `repli` est l'état
 * porté par une notification à la signature vérifiée : il ne sert que si
 * NelsiusPay ne répond pas à cet instant.
 *
 * Rend null quand rien n'a changé.
 */
export async function verifierChezFournisseur(c: CommandeSuivie, repli?: EtatNelsius): Promise<Resultat | null> {
  if (c.fournisseur !== "nelsius") return null;

  let etat: EtatNelsius | null;
  try {
    etat = await lireStatutNelsius(c.fournisseur_reference || c.reference);
  } catch (e) {
    if (!repli) throw e;
    console.error(`[commande] ${c.reference} : NelsiusPay muet, notification signée retenue :`, e instanceof Error ? e.message : e);
    etat = repli;
  }
  if (!etat || !etat.statut || etat.statut === "en_cours") return null;

  // La réponse doit bien parler de cette commande.
  const autreReference = etat.reference && etat.reference !== c.reference;
  const autreCode = etat.transactionCode && c.fournisseur_reference && etat.transactionCode !== c.fournisseur_reference;
  if (autreReference && (autreCode || !c.fournisseur_reference)) {
    console.error(`[commande] ${c.reference} : NelsiusPay répond pour ${etat.reference}, ignoré.`);
    return null;
  }

  // Un paiement inférieur au prix n'ouvre rien : il se règle à la main.
  if (etat.statut === "paye" && etat.montant !== null && (etat.devise ?? c.devise) === c.devise && etat.montant < c.montant) {
    console.error(`[commande] ${c.reference} : ${etat.montant} ${c.devise} reçus pour ${c.montant} attendus.`);
    const { data: m } = await admin().from("commandes").select("meta").eq("id", c.id).single();
    await admin()
      .from("commandes")
      .update({ meta: { ...(m?.meta ?? {}), alerte: { montant_recu: etat.montant, le: new Date().toISOString() } } })
      .eq("id", c.id);
    return null;
  }

  return await appliquerStatut(c.id, etat.statut, {
    nelsius: {
      statut: etat.statutBrut,
      transaction: etat.transactionCode ?? c.fournisseur_reference,
      montant: etat.montant,
      verifie_le: new Date().toISOString(),
    },
  });
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
