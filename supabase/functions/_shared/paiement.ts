// Orci — l'encaissement, derrière une seule porte.
//
// DEUX FOURNISSEURS, UNE INTERFACE.
//   · « simulation » : le mode test. Aucun argent ne bouge ; la page d'attente
//     propose « Paiement réussi » ou « Paiement refusé ». Les commandes sont
//     marquées `test` et s'effacent d'un geste avant le lancement.
//   · « nexuspay » : l'agrégateur réel, à brancher. Tant qu'il ne l'est pas,
//     rien ne peut basculer en production : `modePaiement()` refuse de rendre
//     un mode dont le fournisseur n'est pas prêt.
//
// Le mode se lit dans `prive.reglages` (clé `paiement_mode`), pas dans le code :
// passer en réel ne demandera aucun redéploiement.

import { reglage } from "./base.ts";

export type Statut = "en_cours" | "paye" | "echec" | "annule" | "expire" | "rembourse";
export type Mode = "simulation" | "nexuspay";

export interface DemandePaiement {
  readonly reference: string;
  readonly montant: number;
  readonly devise: string;
  readonly description: string;
  readonly telephone: string;
  readonly operateur: string;
  readonly nom: string;
  readonly email?: string | null;
  /** Où renvoyer l'acheteur après le paiement. */
  readonly retourUrl: string;
  /** Où le fournisseur annonce le résultat. */
  readonly notificationUrl: string;
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
  const m = (await reglage("paiement_mode")) ?? "simulation";
  if (m === "nexuspay" && nexusPayPret()) return "nexuspay";
  return "simulation";
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function creerSimulation(d: DemandePaiement): ReponsePaiement {
  return {
    fournisseurReference: `SIM-${d.reference}`,
    url: null,
    statut: "en_cours",
    brut: { simulation: true, operateur: d.operateur },
  };
}

// ---------------------------------------------------------------------------
// Nexus Pay — à brancher avec ses clés et sa documentation.
// ---------------------------------------------------------------------------

function nexusPayPret(): boolean {
  return Boolean(Deno.env.get("NEXUSPAY_API_KEY"));
}

function creerNexusPay(_d: DemandePaiement): Promise<ReponsePaiement> {
  // L'appel réel s'écrira ici : création de la transaction, référence Orci dans
  // les métadonnées, notificationUrl vers la fonction `paiement`.
  return Promise.reject(new Error("Nexus Pay n'est pas encore branché."));
}

// ---------------------------------------------------------------------------

export async function creerPaiement(mode: Mode, d: DemandePaiement): Promise<ReponsePaiement> {
  if (mode === "nexuspay") return await creerNexusPay(d);
  return creerSimulation(d);
}
