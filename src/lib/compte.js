// Les comptes spectateurs, avec Firebase Authentication : Google en un clic,
// ou une adresse e-mail et un mot de passe, sans e-mail de confirmation (ça
// marche aussi dans le navigateur de TikTok).
//
// Le module Firebase ne se charge qu'au moment où l'on s'en sert : l'accueil
// reste léger. Ce que le site doit savoir tout de suite (qui est connecté) est
// gardé à part dans le navigateur, et resynchronisé dès que Firebase répond.

import { useEffect, useState } from "react";
import { FIREBASE } from "../config.js";
import { fonction } from "./supa.js";
import { retenirAcces } from "./visiteur.js";

const CLE = "orci.compte";
const GOOGLE_EN_COURS = "orci.google";

const abonnes = new Set();
let actuel = lire();
let firebase = null;

function lire() {
  try {
    const c = JSON.parse(localStorage.getItem(CLE) || "null");
    return c && typeof c.uid === "string" ? c : null;
  } catch {
    return null;
  }
}

function ecrire(c) {
  actuel = c;
  try {
    if (c) localStorage.setItem(CLE, JSON.stringify(c));
    else localStorage.removeItem(CLE);
  } catch {
    // Stockage refusé : le compte vit le temps de l'onglet.
  }
  for (const f of abonnes) f(c);
}

function resume(u, prenom) {
  return {
    uid: u.uid,
    email: u.email ?? null,
    nom: prenom || u.displayName || null,
    fournisseur: u.providerData?.[0]?.providerId ?? null,
  };
}

/** Les comptes sont-ils branchés ? Sans configuration Firebase, le site marche sans. */
export function comptesActifs() {
  return Boolean(FIREBASE?.apiKey);
}

export function compteActuel() {
  return actuel;
}

export function surCompte(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** « Steven Ondoa » → « SO » ; « awa@… » → « A ». */
export function initiales(c) {
  const base = (c?.nom || c?.email || "").trim();
  const mots = base.split(/[\s@._-]+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "") + (c?.nom ? mots[1]?.[0] ?? "" : "")).toUpperCase() || "?";
}

async function charger() {
  if (!comptesActifs()) throw new Error("Les comptes ne sont pas encore ouverts.");
  if (!firebase) {
    firebase = (async () => {
      const [{ initializeApp }, auth] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      const a = auth.getAuth(initializeApp(FIREBASE));
      a.languageCode = "fr";
      auth.onAuthStateChanged(a, (u) => {
        if (!u) {
          if (actuel) ecrire(null);
          return;
        }
        if (actuel?.uid !== u.uid) ecrire(resume(u, actuel?.nom));
      });
      return { a, auth };
    })().catch((e) => {
      firebase = null;
      throw e;
    });
  }
  return firebase;
}

const MESSAGES = {
  "auth/email-already-in-use": "Un compte existe déjà avec cette adresse : connecte-toi.",
  "auth/invalid-email": "Cette adresse e-mail ne semble pas valide.",
  "auth/missing-password": "Choisis un mot de passe.",
  "auth/weak-password": "Mot de passe trop court : 6 caractères au moins.",
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/user-not-found": "Aucun compte avec cette adresse : crée-le.",
  "auth/too-many-requests": "Trop d'essais. Réessaie dans quelques minutes.",
  "auth/network-request-failed": "Connexion impossible. Vérifie ton réseau, puis réessaie.",
  "auth/operation-not-allowed": "Ce mode de connexion n'est pas encore activé.",
  "auth/unauthorized-domain": "Ce site n'est pas encore autorisé pour la connexion.",
  "auth/web-storage-unsupported": "Ce navigateur bloque la connexion : ouvre la page dans Chrome ou Safari.",
  "auth/user-disabled": "Ce compte a été désactivé.",
};

function traduire(e) {
  const m = MESSAGES[e?.code] ?? "La connexion a échoué. Réessaie.";
  const err = new Error(m);
  err.code = e?.code;
  return err;
}

/** Connexion Google, en pleine page : Google s'ouvre, puis on revient ici déjà connecté. */
export async function connexionGoogle() {
  const { a, auth } = await charger();
  try {
    sessionStorage.setItem(GOOGLE_EN_COURS, "1");
  } catch {
    // tant pis : le retour sera repéré par Firebase lui-même
  }
  const p = new auth.GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  await auth.signInWithRedirect(a, p).catch((e) => {
    throw traduire(e);
  });
}

function googleEnCours() {
  try {
    return sessionStorage.getItem(GOOGLE_EN_COURS) === "1";
  } catch {
    return false;
  }
}

/** Une connexion Google était en cours au chargement : la page attend son retour. */
export const retourGoogleAttendu = comptesActifs() && googleEnCours();

/**
 * Au retour de Google : finir la connexion. Promesse partagée, lancée une fois
 * au chargement du site si une connexion Google était en cours.
 */
export const retourGoogle = (() => {
  if (!comptesActifs() || !googleEnCours()) return Promise.resolve(null);
  return (async () => {
    try {
      const { a, auth } = await charger();
      const r = await auth.getRedirectResult(a);
      if (r?.user) ecrire(resume(r.user));
      await synchroniserCompte().catch(() => {});
      return actuel;
    } catch (e) {
      throw traduire(e);
    } finally {
      try {
        sessionStorage.removeItem(GOOGLE_EN_COURS);
      } catch {
        // rien
      }
    }
  })();
})();

export async function inscriptionEmail(email, motDePasse, prenom) {
  const { a, auth } = await charger();
  const r = await auth.createUserWithEmailAndPassword(a, email.trim(), motDePasse).catch((e) => {
    throw traduire(e);
  });
  const nom = (prenom || "").trim().slice(0, 80) || null;
  if (nom) await auth.updateProfile(r.user, { displayName: nom }).catch(() => {});
  ecrire(resume(r.user, nom));
  await synchroniserCompte({ prenom: nom }).catch(() => {});
  return actuel;
}

export async function connexionEmail(email, motDePasse) {
  const { a, auth } = await charger();
  const r = await auth.signInWithEmailAndPassword(a, email.trim(), motDePasse).catch((e) => {
    throw traduire(e);
  });
  ecrire(resume(r.user));
  await synchroniserCompte().catch(() => {});
  return actuel;
}

export async function motDePasseOublie(email) {
  const { a, auth } = await charger();
  await auth.sendPasswordResetEmail(a, email.trim()).catch((e) => {
    throw traduire(e);
  });
}

export async function deconnexionCompte() {
  if (comptesActifs()) {
    try {
      const { a, auth } = await charger();
      await auth.signOut(a);
    } catch {
      // déconnecté côté site quoi qu'il arrive
    }
  }
  ecrire(null);
}

/** Le jeton d'identité Firebase du spectateur, pour les fonctions d'Orci ; null s'il n'est pas connecté. */
export async function jetonCompte() {
  // Personne de connu, et Firebase pas chargé : inutile de le télécharger.
  if (!comptesActifs() || (!actuel && !firebase)) return null;
  try {
    const { a } = await charger();
    await a.authStateReady();
    return a.currentUser ? await a.currentUser.getIdToken() : null;
  } catch {
    return null;
  }
}

/**
 * Prévenir Orci que ce spectateur est là, et retrouver son Premium : le lien
 * d'accès revient sur ce téléphone, comme après un paiement.
 */
export async function synchroniserCompte({ prenom } = {}) {
  const jeton = await jetonCompte();
  if (!jeton) return null;
  const r = await fonction("acces", { action: "compte", jeton_compte: jeton, nom: prenom || undefined });
  if (r?.premium?.slug && r.premium.jeton) retenirAcces(r.premium.slug, r.premium.jeton);
  if (r?.compte?.nom && actuel && actuel.nom !== r.compte.nom) ecrire({ ...actuel, nom: r.compte.nom });
  return r;
}

/** Le spectateur connecté, tenu à jour. */
export function useCompte() {
  const [c, setC] = useState(compteActuel);
  useEffect(() => surCompte(setC), []);
  return c;
}

/** Le retour de Google : { enCours, erreur }. */
export function useRetourGoogle() {
  const [etat, setEtat] = useState(() => ({ enCours: retourGoogleAttendu, erreur: null }));
  useEffect(() => {
    if (!retourGoogleAttendu) return undefined;
    let fini = false;
    retourGoogle
      .then(() => !fini && setEtat({ enCours: false, erreur: null }))
      .catch((e) => !fini && setEtat({ enCours: false, erreur: e.message }));
    return () => {
      fini = true;
    };
  }, []);
  return etat;
}
