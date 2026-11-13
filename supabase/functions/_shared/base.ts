// Orci — ce que toutes les fonctions partagent : réponses, client service_role,
// identification du propriétaire, réglages stockés en base.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function erreur(message: string, statut = 400): Response {
  return json({ erreur: message }, statut);
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: CORS }) : null;
}

export async function lireCorps(req: Request): Promise<Record<string, unknown>> {
  try {
    const c = await req.json();
    return c && typeof c === "object" ? c as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function texte(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

let _admin: SupabaseClient | null = null;

/** Client service_role. Ne quitte jamais le serveur. */
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = Deno.env.get("SUPABASE_URL");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !cle) throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant");
  _admin = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export interface Proprietaire {
  readonly userId: string;
  readonly formateurId: string;
}

/**
 * Le propriétaire derrière le jeton de session, ou null.
 *
 * `verify_jwt` NE SUFFIT PAS : la clé anon est elle-même un JWT valide, publiée
 * dans le navigateur. Chaque action d'administration repasse donc par ici.
 */
export async function proprietaire(req: Request): Promise<Proprietaire | null> {
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jeton) return null;
  const { data, error } = await admin().auth.getUser(jeton);
  if (error || !data.user) return null;
  const { data: f } = await admin()
    .from("formateurs")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!f) return null;
  return { userId: data.user.id, formateurId: f.id as string };
}

// ---------------------------------------------------------------------------
// Réglages : secrets générés par la base et clés posées depuis l'espace admin.
// Ils vivent dans le schéma `prive`, qu'aucune API n'expose.
// ---------------------------------------------------------------------------

export async function reglage(cle: string): Promise<string | null> {
  const { data, error } = await admin().rpc("reglage", { p_cle: cle });
  if (error) throw new Error(`Réglage ${cle} illisible : ${error.message}`);
  return (data as string | null) ?? null;
}

export async function definirReglage(cle: string, valeur: string): Promise<void> {
  const { error } = await admin().rpc("definir_reglage", { p_cle: cle, p_valeur: valeur });
  if (error) throw new Error(`Réglage ${cle} non enregistré : ${error.message}`);
}

export async function oublierReglage(cle: string): Promise<void> {
  const { error } = await admin().rpc("oublier_reglage", { p_cle: cle });
  if (error) throw new Error(`Réglage ${cle} non supprimé : ${error.message}`);
}

/** Comparaison à durée constante : un secret ne se devine pas caractère par caractère. */
export function egal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** L'adresse publique du site, pour les retours de paiement et de Google. */
export async function siteUrl(req?: Request): Promise<string> {
  const enregistre = await reglage("site_url");
  if (enregistre) return enregistre.replace(/\/+$/, "");
  const origine = req?.headers.get("Origin");
  return (origine ?? "https://orci.vercel.app").replace(/\/+$/, "");
}

export function urlFonction(nom: string): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/${nom}`;
}

/**
 * Un numéro Mobile Money, en chiffres, indicatif compris.
 * 6XXXXXXXX (9 chiffres) est un numéro camerounais : on ajoute 237.
 */
export function telephoneNormalise(brut: string): string | null {
  let n = String(brut ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (n.length === 9 && n.startsWith("6")) n = `237${n}`;
  return /^[0-9]{8,15}$/.test(n) ? n : null;
}

/**
 * Les pays où NelsiusPay encaisse : leur indicatif, et si le 0 du début fait
 * partie du numéro international (Côte d'Ivoire, Bénin, Congo : +225 07…).
 */
const PAYS: Record<string, { indicatif: string; zero?: true }> = {
  CM: { indicatif: "237" },
  BJ: { indicatif: "229", zero: true },
  CG: { indicatif: "242", zero: true },
  CI: { indicatif: "225", zero: true },
  CD: { indicatif: "243" },
  GH: { indicatif: "233" },
  KE: { indicatif: "254" },
  LR: { indicatif: "231" },
  MW: { indicatif: "265" },
  MZ: { indicatif: "258" },
  NG: { indicatif: "234" },
  RW: { indicatif: "250" },
  SN: { indicatif: "221" },
  SL: { indicatif: "232" },
  TZ: { indicatif: "255" },
  UG: { indicatif: "256" },
  ZM: { indicatif: "260" },
};

export function paysConnu(code: string): string | null {
  const c = code.toUpperCase();
  return PAYS[c] ? c : null;
}

/**
 * Le numéro tapé dans le pays choisi, au format international en chiffres.
 * « +… » ou « 00… » : le numéro est déjà complet. Sinon l'indicatif est ajouté
 * (une seule fois), après avoir ôté le 0 local quand le pays le retire.
 */
export function telephoneDuPays(brut: string, pays: string): string | null {
  const p = PAYS[pays];
  if (!p) return telephoneNormalise(brut);
  const complet = /^\s*(\+|00)/.test(brut);
  let n = String(brut ?? "").replace(/\D/g, "");
  if (complet) n = n.replace(/^00/, "");
  else if (!(n.startsWith(p.indicatif) && n.length >= p.indicatif.length + 8)) {
    if (!p.zero) n = n.replace(/^0+/, "");
    n = `${p.indicatif}${n}`;
  }
  return /^[0-9]{8,15}$/.test(n) ? n : null;
}

export function emailValide(brut: string): string | null {
  const e = String(brut ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254 ? e : null;
}

export function aleatoire(octets = 8): string {
  const b = crypto.getRandomValues(new Uint8Array(octets));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
