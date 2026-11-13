// Orci — NelsiusPay, l'agrégateur Mobile Money (MTN MoMo, Orange Money).
//
// LE PARCOURS : CHECKOUT HÉBERGÉ. Orci crée la session, l'acheteur valide sur
// la page sécurisée NelsiusPay (demande sur son téléphone, code secret), puis
// revient sur Orci. C'est le seul parcours ouvert aux comptes de particuliers :
// en production, le débit direct (DirectPay) est réservé aux entreprises
// vérifiées (RCCM / NIF).
//
// RIEN N'EST CRU SUR PAROLE. Ni le retour du navigateur ni le contenu d'une
// notification n'ouvrent un accès : le statut se relit chez NelsiusPay, avec la
// clé secrète (`lireStatutNelsius`). La notification signée ne sert de repli que
// si NelsiusPay ne répond pas au moment où elle arrive.
//
// Secrets (Supabase → Edge Functions → Secrets), jamais dans le code :
//   NELSIUS_API_KEY         sk_test_… (bac à sable) ou sk_live_… (réel)
//   NELSIUS_WEBHOOK_SECRET  la clé de signature des webhooks (tableau de bord NelsiusPay)
//
// Documentation : https://nelsiuspay.com/fr/api-doc

import { egal } from "./base.ts";
import type { Statut } from "./paiement.ts";

const BASE = "https://api.nelsiuspay.com/api/v1";
const DELAI = 20_000;

function cle(): string {
  return (Deno.env.get("NELSIUS_API_KEY") ?? "").trim();
}

/** Une clé secrète est posée (sk_test_ ou sk_live_). Une clé publique pk_ ne sert à rien côté serveur. */
export function nelsiusPret(): boolean {
  return cle().startsWith("sk_");
}

/**
 * Seule une clé sk_live_ fait bouger de l'argent. Toute autre clé est traitée
 * comme un bac à sable : ses commandes sont des tests, réservés au propriétaire.
 * Sinon un visiteur s'offrirait la formation avec un numéro de test « …000 ».
 */
export function nelsiusReel(): boolean {
  return cle().startsWith("sk_live_");
}

export function nelsiusSignatureConfiguree(): boolean {
  return Boolean((Deno.env.get("NELSIUS_WEBHOOK_SECRET") ?? "").trim());
}

// ---------------------------------------------------------------------------
// Appels
// ---------------------------------------------------------------------------

interface Reponse {
  readonly ok: boolean;
  readonly code: number;
  // deno-lint-ignore no-explicit-any
  readonly corps: any;
}

async function appel(chemin: string, methode: "GET" | "POST", corps?: unknown): Promise<Reponse> {
  const k = cle();
  if (!k) throw new Error("Clé NelsiusPay absente (secret NELSIUS_API_KEY).");
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: {
      "X-Api-Key": k,
      "Accept": "application/json",
      ...(corps === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    signal: AbortSignal.timeout(DELAI),
  });
  const brut = await r.text();
  let lu: unknown = null;
  try {
    lu = brut ? JSON.parse(brut) : null;
  } catch {
    lu = { brut: brut.slice(0, 500) };
  }
  return { ok: r.ok, code: r.status, corps: lu };
}

/** Le message d'erreur lisible d'une réponse NelsiusPay, quelle que soit sa forme. */
// deno-lint-ignore no-explicit-any
function messageDe(corps: any): string {
  if (!corps || typeof corps !== "object") return "réponse vide";
  if (corps.errors && typeof corps.errors === "object") {
    const premiers = Object.values(corps.errors).flat().filter((x) => typeof x === "string");
    if (premiers.length) return premiers.slice(0, 3).join(" ");
  }
  for (const k of ["message", "error", "erreur", "brut"]) {
    if (typeof corps[k] === "string" && corps[k]) return corps[k].slice(0, 300);
  }
  return JSON.stringify(corps).slice(0, 300);
}

function chaine(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function nombre(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Créer la session de paiement
// ---------------------------------------------------------------------------

export interface DemandeNelsius {
  readonly reference: string;
  readonly montant: number;
  readonly devise: string;
  readonly description: string;
  /** En chiffres, indicatif compris : 2376XXXXXXXX. */
  readonly telephone: string;
  /** Le pays choisi sur Orci : la page NelsiusPay s'ouvre sur ses moyens de paiement. */
  readonly pays?: string | null;
  readonly nom: string;
  readonly email?: string | null;
  readonly retourUrl: string;
  readonly annulationUrl: string;
}

export interface SessionNelsius {
  readonly transactionCode: string | null;
  readonly url: string;
  readonly brut: unknown;
}

export async function creerSessionNelsius(d: DemandeNelsius): Promise<SessionNelsius> {
  const { ok, code, corps } = await appel("/checkout/initiate", "POST", {
    amount: d.montant,
    currency: d.devise,
    reference: d.reference,
    description: d.description.slice(0, 120),
    customer_name: d.nom,
    customer_phone: `+${d.telephone}`,
    ...(d.email ? { customer_email: d.email } : {}),
    ...(d.pays ? { default_country: d.pays } : d.telephone.startsWith("237") ? { default_country: "CM" } : {}),
    return_url: d.retourUrl,
    cancel_url: d.annulationUrl,
    metadata: { orci_reference: d.reference },
  });
  if (!ok) throw new Error(`NelsiusPay a refusé la demande (${code}) : ${messageDe(corps)}`);

  const data = corps?.data && typeof corps.data === "object" ? corps.data : corps ?? {};
  const url = chaine(data.checkout_url) ?? chaine(data.payment_url) ?? chaine(data.url);
  if (!url || !url.startsWith("https://")) {
    throw new Error("NelsiusPay n'a pas renvoyé de page de paiement.");
  }
  return {
    transactionCode: chaine(data.transaction_code) ?? chaine(data.session_id),
    url,
    brut: corps,
  };
}

// ---------------------------------------------------------------------------
// Lire le statut
// ---------------------------------------------------------------------------

/**
 * Le statut NelsiusPay traduit en statut Orci. null : inconnu, on ne touche à rien.
 * Documentés : pending, completed, failed.
 */
export function traduireStatut(s: unknown): Statut | null {
  switch (String(s ?? "").trim().toLowerCase()) {
    case "completed":
    case "complete":
    case "success":
    case "successful":
    case "succeeded":
    case "paid":
      return "paye";
    case "failed":
    case "failure":
    case "declined":
    case "rejected":
    case "error":
      return "echec";
    case "cancelled":
    case "canceled":
      return "annule";
    case "expired":
      return "expire";
    case "refunded":
      return "rembourse";
    case "pending":
    case "processing":
    case "initiated":
    case "created":
      return "en_cours";
    default:
      return null;
  }
}

export interface EtatNelsius {
  /** Traduit pour Orci ; null si NelsiusPay a répondu un statut inconnu. */
  readonly statut: Statut | null;
  /** Tel que NelsiusPay l'a écrit, pour l'historique de la commande. */
  readonly statutBrut: string | null;
  readonly montant: number | null;
  readonly devise: string | null;
  readonly reference: string | null;
  readonly transactionCode: string | null;
}

/** Les champs utiles du bloc `data` d'une réponse ou d'une notification. */
// deno-lint-ignore no-explicit-any
export function lireEtat(data: any): EtatNelsius {
  const d = data && typeof data === "object" ? data : {};
  return {
    statut: traduireStatut(d.status),
    statutBrut: chaine(d.status),
    montant: nombre(d.amount),
    devise: chaine(d.currency)?.toUpperCase() ?? null,
    reference: chaine(d.reference),
    transactionCode: chaine(d.transaction_code),
  };
}

/**
 * Le statut certifié d'un paiement, par code de transaction NelsiusPay ou par
 * référence Orci. null si NelsiusPay ne le connaît pas.
 */
export async function lireStatutNelsius(id: string): Promise<EtatNelsius | null> {
  const { ok, code, corps } = await appel(`/payments/${encodeURIComponent(id)}`, "GET");
  if (code === 404) return null;
  if (!ok) throw new Error(`NelsiusPay ne donne pas le statut (${code}) : ${messageDe(corps)}`);
  // Seul le bloc `data` décrit le paiement ; le `status` de l'enveloppe dit
  // seulement que l'appel a réussi et ne doit jamais passer pour un paiement.
  return lireEtat(corps?.data);
}

/** Bac à sable seulement : forcer l'issue d'un paiement resté en attente. */
export async function simulerNelsius(id: string, issue: "paye" | "echec"): Promise<void> {
  if (nelsiusReel()) throw new Error("Simulation impossible avec une clé réelle.");
  const { ok, code, corps } = await appel("/sandbox/simulate", "POST", {
    reference: id,
    action: issue === "paye" ? "success" : "failed",
  });
  if (!ok) throw new Error(`Le bac à sable NelsiusPay a refusé (${code}) : ${messageDe(corps)}`);
}

// ---------------------------------------------------------------------------
// Notifications (webhooks)
// ---------------------------------------------------------------------------

function hex(octets: ArrayBuffer): string {
  return Array.from(new Uint8Array(octets), (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * L'en-tête X-Nelsius-Signature : HMAC-SHA256 du corps brut, en hexadécimal,
 * signé avec le secret de webhook.
 *   true  : signature juste
 *   false : signature absente ou fausse, alors qu'un secret est configuré
 *   null  : aucun secret configuré, la notification n'est qu'un signal
 */
export async function signatureNelsius(corpsBrut: string, signature: string | null): Promise<boolean | null> {
  const secret = (Deno.env.get("NELSIUS_WEBHOOK_SECRET") ?? "").trim();
  if (!secret) return null;
  const recue = (signature ?? "").trim().toLowerCase().replace(/^sha256=/, "");
  if (!recue) return false;
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const attendue = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(corpsBrut)));
  return egal(attendue, recue);
}
