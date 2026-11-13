// Orci — l'encaissement, derrière une seule porte.
//
// DEUX FOURNISSEURS, UNE INTERFACE.
//   · « simulation » : le mode test sans fournisseur. Aucun argent ne bouge ; la
//     page d'attente propose « Paiement réussi » ou « Paiement refusé ».
//   · « nelsius » : NelsiusPay, l'agrégateur réel (MTN MoMo, Orange Money).
//     Avec une clé sk_test_, c'est son bac à sable : toujours un test.
//
// LE MODE SE CHOISIT SANS REDÉPLOYER. NelsiusPay prend la main dès que sa clé
// secrète est posée dans les secrets des fonctions (NELSIUS_API_KEY) ; la retirer
// ramène à la simulation. Le réglage `paiement_mode` = 'simulation' (dans
// `prive.reglages`) force la simulation même avec une clé posée.
//
// Une commande de test (simulation ou bac à sable) est marquée `test`, réservée
// au propriétaire connecté, et s'efface d'un geste avant le lancement.

import { reglage } from "./base.ts";
import { creerSessionNelsius, nelsiusPret, nelsiusReel } from "./nelsius.ts";

export type Statut = "en_cours" | "paye" | "echec" | "annule" | "expire" | "rembourse";
export type Mode = "simulation" | "nelsius";

export interface DemandePaiement {
  readonly reference: string;
  readonly montant: number;
  readonly devise: string;
  readonly description: string;
  readonly telephone: string;
  /** Le pays choisi par l'acheteur (code ISO à deux lettres), s'il l'a donné. */
  readonly pays?: string | null;
  readonly operateur: string;
  readonly nom: string;
  readonly email?: string | null;
  /** Où renvoyer l'acheteur après le paiement. */
  readonly retourUrl: string;
  /** Où le renvoyer s'il abandonne sur la page du fournisseur. */
  readonly annulationUrl: string;
}

export interface ReponsePaiement {
  readonly fournisseurReference: string | null;
  /** Page du fournisseur à ouvrir, ou null si la demande part sur le téléphone. */
  readonly url: string | null;
  readonly statut: Statut;
  readonly brut: unknown;
}

/**
 * Où en est un paiement, en un chiffre. Les notifications n'arrivent pas dans
 * l'ordre : un « en cours » en retard ne doit jamais effacer un « payé ».
 *   0 en_cours · 1 echec/annule/expire · 2 paye · 3 rembourse
 */
export function rangStatut(s: string): number {
  switch (s) {
    case "rembourse": return 3;
    case "paye": return 2;
    case "echec":
    case "annule":
    case "expire": return 1;
    default: return 0;
  }
}

export async function modePaiement(): Promise<Mode> {
  const force = await reglage("paiement_mode");
  if (force === "simulation") return "simulation";
  return nelsiusPret() ? "nelsius" : "simulation";
}

/** Aucun argent ne bouge : simulation, ou NelsiusPay avec une clé de bac à sable. */
export function paiementDeTest(mode: Mode): boolean {
  return mode === "simulation" || !nelsiusReel();
}

// ---------------------------------------------------------------------------

export async function creerPaiement(mode: Mode, d: DemandePaiement): Promise<ReponsePaiement> {
  if (mode === "nelsius") {
    const s = await creerSessionNelsius(d);
    return { fournisseurReference: s.transactionCode, url: s.url, statut: "en_cours", brut: s.brut };
  }
  return {
    fournisseurReference: `SIM-${d.reference}`,
    url: null,
    statut: "en_cours",
    brut: { simulation: true, operateur: d.operateur },
  };
}
