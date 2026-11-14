// Un client Supabase minimal : ce dont Orci se sert, et rien d'autre.
//
// POURQUOI PAS @supabase/supabase-js. Le paquet complet pèse plus lourd que
// toute l'application, et la page de vente doit s'ouvrir vite sur un téléphone
// en 3G. Orci n'appelle que quatre portes : Auth (connexion du propriétaire),
// PostgREST (tables et RPC), Storage (images) et les fonctions Edge.

import { SUPABASE_CLE, SUPABASE_URL } from "../config.js";

const CLE_SESSION = "orci.session";

export class ErreurApi extends Error {
  constructor(message, statut, code) {
    super(message);
    this.statut = statut;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Session du propriétaire
// ---------------------------------------------------------------------------

let session = lireSession();
const abonnes = new Set();

function lireSession() {
  try {
    const s = JSON.parse(localStorage.getItem(CLE_SESSION) || "null");
    return s && s.access_token && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

function ecrireSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(CLE_SESSION, JSON.stringify(s));
    else localStorage.removeItem(CLE_SESSION);
  } catch {
    // Navigation privée : la session vit le temps de l'onglet.
  }
  for (const f of abonnes) f(s);
}

export function sessionActuelle() {
  return session;
}

export function surSession(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

function decoderJwt(jeton) {
  try {
    const charge = jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const octets = Uint8Array.from(atob(charge), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(octets));
  } catch {
    return null;
  }
}

/** Comment la session a été ouverte : "password", "otp" (lien), "recovery"… */
function methodeDe(claims) {
  const amr = Array.isArray(claims?.amr) ? claims.amr : [];
  let dernier = null;
  for (const a of amr) if (a && (!dernier || (a.timestamp ?? 0) > (dernier.timestamp ?? 0))) dernier = a;
  return typeof dernier?.method === "string" ? dernier.method : null;
}

function normaliser(j) {
  const maintenant = Math.floor(Date.now() / 1000);
  const expire = j.expires_at ? Number(j.expires_at) : maintenant + Number(j.expires_in || 3600);
  // Le lien magique ne rend que les jetons : l'identité se lit dans le JWT.
  const claims = decoderJwt(j.access_token);
  const user = j.user
    ? { id: j.user.id, email: j.user.email }
    : claims
      ? { id: claims.sub, email: claims.email }
      : null;
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: expire, user, methode: methodeDe(claims) };
}

let rafraichissement = null;

/** Le jeton d'accès, renouvelé une minute avant son expiration. */
async function jetonValide() {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  if (!rafraichissement) {
    rafraichissement = (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: SUPABASE_CLE, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (r.status === 400 || r.status === 401) {
          ecrireSession(null);
          return null;
        }
        if (!r.ok) return session?.access_token ?? null;
        ecrireSession(normaliser(await r.json()));
        return session.access_token;
      } catch {
        // Réseau coupé : on garde la session, la prochaine requête réessaiera.
        return session?.access_token ?? null;
      } finally {
        rafraichissement = null;
      }
    })();
  }
  return rafraichissement;
}

// ---------------------------------------------------------------------------
// Réponses
// ---------------------------------------------------------------------------

const MESSAGES_AUTH = {
  email_address_not_authorized:
    "Supabase n'envoie l'e-mail de connexion qu'aux membres de ton équipe Supabase tant qu'aucun serveur d'envoi n'est branché. Utilise l'adresse de ton compte Supabase.",
  over_email_send_rate_limit: "Trop d'e-mails envoyés cette heure-ci. Attends un peu, ou utilise le dernier lien reçu.",
  over_request_rate_limit: "Trop de tentatives. Attends quelques minutes avant de réessayer.",
  otp_expired: "Ce code a expiré ou n'est pas le bon. Demande un nouveau lien.",
  validation_failed: "Cette adresse e-mail ne semble pas valide.",
  invalid_credentials:
    "E-mail ou mot de passe incorrect. Pas encore de mot de passe ? Utilise « Première connexion ou mot de passe oublié ».",
  email_not_confirmed: "Ton adresse n'est pas encore confirmée : clique d'abord le lien reçu par e-mail.",
  weak_password: "Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.",
  same_password: "C'est déjà ton mot de passe actuel : choisis-en un autre.",
  reauthentication_needed: "Par sécurité, reconnecte-toi avec un lien reçu par e-mail, puis change ton mot de passe.",
};

async function lireReponse(r) {
  const brut = await r.text();
  let corps = null;
  try {
    corps = brut ? JSON.parse(brut) : null;
  } catch {
    corps = brut;
  }
  if (!r.ok) {
    const code = corps && typeof corps === "object" ? corps.error_code || corps.code : undefined;
    let m = corps && typeof corps === "object"
      ? corps.erreur || corps.msg || corps.message || corps.error_description || corps.error
      : null;
    if (code && MESSAGES_AUTH[code]) m = MESSAGES_AUTH[code];
    if (!m && r.status === 429) m = MESSAGES_AUTH.over_request_rate_limit;
    if (r.status === 401 && !m) m = "Ta session a expiré. Reconnecte-toi.";
    throw new ErreurApi(typeof m === "string" && m ? m : `Erreur ${r.status}`, r.status, code);
  }
  return corps;
}

async function appeler(url, init = {}) {
  let r;
  try {
    r = await fetch(url, init);
  } catch {
    throw new ErreurApi("Connexion impossible. Vérifie ton réseau puis réessaie.", 0, "reseau");
  }
  return lireReponse(r);
}

async function entetes(extra = {}) {
  const h = { apikey: SUPABASE_CLE, "Content-Type": "application/json", ...extra };
  const t = await jetonValide();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

// ---------------------------------------------------------------------------
// Base de données
// ---------------------------------------------------------------------------

export async function rpc(nom, params = {}) {
  return appeler(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: await entetes(),
    body: JSON.stringify(params),
  });
}

/** `chemin` est une requête PostgREST : "offres?select=*&order=created_at". */
export async function lire(chemin) {
  return appeler(`${SUPABASE_URL}/rest/v1/${chemin}`, { headers: await entetes() });
}

export async function modifier(table, filtre, valeurs) {
  return appeler(`${SUPABASE_URL}/rest/v1/${table}?${filtre}`, {
    method: "PATCH",
    headers: await entetes({ Prefer: "return=representation" }),
    body: JSON.stringify(valeurs),
  });
}

export async function inserer(table, valeurs) {
  return appeler(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: await entetes({ Prefer: "return=representation" }),
    body: JSON.stringify(valeurs),
  });
}

export async function supprimer(table, filtre) {
  return appeler(`${SUPABASE_URL}/rest/v1/${table}?${filtre}`, {
    method: "DELETE",
    headers: await entetes(),
  });
}

// ---------------------------------------------------------------------------
// Fonctions Edge
// ---------------------------------------------------------------------------

/**
 * Les fonctions publiques (paiement, accès) n'ont besoin d'aucun jeton ; celles
 * de l'espace admin reçoivent la session, qu'elles vérifient elles-mêmes.
 *
 *   admin   : la session est obligatoire.
 *   session : la session est jointe si elle existe (le propriétaire qui teste
 *             un achat depuis la page publique).
 */
export async function fonction(nom, corps = {}, { admin = false, session: jointe = false } = {}) {
  const h = { "Content-Type": "application/json" };
  if (admin || jointe) {
    const t = await jetonValide();
    if (!t && admin) throw new ErreurApi("Ta session a expiré. Reconnecte-toi.", 401);
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return appeler(`${SUPABASE_URL}/functions/v1/${nom}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(corps),
  });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Envoyer un fichier dans un seau public du stockage, en suivant l'avancement
 * (XMLHttpRequest : fetch ne dit pas où en est un envoi). Rend son adresse
 * publique. Les chemins sont uniques : le fichier peut rester un an en cache.
 */
export function televerser(seau, chemin, fichier, { progression } = {}) {
  return jetonValide().then(
    (t) =>
      new Promise((resolve, reject) => {
        if (!t) {
          reject(new ErreurApi("Ta session a expiré. Reconnecte-toi.", 401));
          return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${seau}/${chemin}`);
        xhr.setRequestHeader("apikey", SUPABASE_CLE);
        xhr.setRequestHeader("Authorization", `Bearer ${t}`);
        xhr.setRequestHeader("Content-Type", fichier.type || "application/octet-stream");
        xhr.setRequestHeader("cache-control", "max-age=31536000");
        if (progression) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) progression(e.loaded / e.total);
          };
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(`${SUPABASE_URL}/storage/v1/object/public/${seau}/${chemin}`);
            return;
          }
          let m = "";
          try {
            const j = JSON.parse(xhr.responseText);
            m = String(j.message || j.error || "");
          } catch {
            // réponse illisible
          }
          if (xhr.status === 413 || /maximum allowed size|too large/i.test(m)) m = "Le fichier dépasse la taille permise.";
          else if (/mime type|invalid_mime_type/i.test(m)) m = "Ce format de fichier n'est pas accepté.";
          else if (xhr.status === 401 || xhr.status === 403) m = "Envoi refusé : reconnecte-toi, puis réessaie.";
          reject(new ErreurApi(m || `Envoi refusé (${xhr.status}).`, xhr.status));
        };
        xhr.onerror = () => reject(new ErreurApi("Connexion coupée pendant l'envoi. Vérifie ton réseau, puis réessaie.", 0, "reseau"));
        xhr.send(fichier);
      }),
  );
}

export function televerserImage(chemin, fichier) {
  return televerser("medias", chemin, fichier);
}

/** Le chemin d'un fichier de ce seau d'après son adresse publique, sinon null. */
export function cheminStockage(url, seau) {
  const debut = `${SUPABASE_URL}/storage/v1/object/public/${seau}/`;
  return typeof url === "string" && url.startsWith(debut) ? url.slice(debut.length) : null;
}

/** Retirer un fichier du stockage. Un échec ne doit rien bloquer : il reste un fichier en trop. */
export async function supprimerFichier(seau, chemin) {
  const t = await jetonValide();
  if (!t) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${seau}/${chemin}`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_CLE, Authorization: `Bearer ${t}` },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Connexion du propriétaire : lien magique, ou code à six chiffres si le modèle
// d'e-mail de Supabase a été modifié pour l'afficher.
// ---------------------------------------------------------------------------

export async function envoyerLien(email, retour) {
  return appeler(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(retour)}`, {
    method: "POST",
    headers: { apikey: SUPABASE_CLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  });
}

/** Connexion directe, sans e-mail : l'adresse et le mot de passe. */
export async function connexionMotDePasse(email, motDePasse) {
  const j = await appeler(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_CLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: motDePasse }),
  });
  ecrireSession(normaliser(j));
}

/**
 * Un lien pour choisir (ou rechoisir) son mot de passe. Il revient sur `retour`
 * avec une session et `type=recovery` : l'espace admin demande alors le
 * nouveau mot de passe.
 */
export async function envoyerReinitialisation(email, retour) {
  return appeler(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(retour)}`, {
    method: "POST",
    headers: { apikey: SUPABASE_CLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

/** Créer ou changer le mot de passe du compte connecté. */
export async function definirMotDePasse(motDePasse) {
  const t = await jetonValide();
  if (!t) throw new ErreurApi("Ta session a expiré. Reconnecte-toi.", 401);
  await appeler(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: SUPABASE_CLE, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: motDePasse }),
  });
}

export async function verifierCode(email, code) {
  const j = await appeler(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: SUPABASE_CLE, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", email, token: code }),
  });
  ecrireSession(normaliser(j));
}

/**
 * Le lien magique revient sur le site avec la session dans le fragment :
 * #access_token=…&refresh_token=…&expires_at=… — ou avec une erreur.
 */
export function sessionDepuisAdresse() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const requete = new URLSearchParams(window.location.search);
  const nettoyer = () => window.history.replaceState(null, "", window.location.pathname);

  const erreur = fragment.get("error_description") || requete.get("error_description");
  if (erreur) {
    const code = fragment.get("error_code") || requete.get("error_code");
    nettoyer();
    return { erreur: code === "otp_expired" ? "Ce lien de connexion a expiré ou a déjà servi. Demande-en un nouveau." : erreur };
  }
  if (!fragment.get("access_token") || !fragment.get("refresh_token")) return null;

  ecrireSession(normaliser({
    access_token: fragment.get("access_token"),
    refresh_token: fragment.get("refresh_token"),
    expires_at: fragment.get("expires_at"),
    expires_in: fragment.get("expires_in"),
  }));
  // Un lien « choisir mon mot de passe » : l'espace admin le demandera.
  const recuperation = fragment.get("type") === "recovery";
  nettoyer();
  return { ok: true, recuperation };
}

export async function deconnecter() {
  const t = session?.access_token;
  ecrireSession(null);
  if (t) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_CLE, Authorization: `Bearer ${t}` },
    }).catch(() => {});
  }
}
