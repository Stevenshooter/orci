// Ce que le navigateur garde pour l'acheteur : une empreinte anonyme (pour
// compter les visiteurs uniques), la source de sa venue, ses coordonnées s'il
// revient payer, et ses liens d'accès.

function hexAleatoire(octets) {
  const b = new Uint8Array(octets);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function lireLocal(cle) {
  try {
    return JSON.parse(localStorage.getItem(cle) || "null");
  } catch {
    return null;
  }
}

function ecrireLocal(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Stockage refusé : rien de grave, l'acheteur retapera.
  }
}

export function idVisiteur() {
  let v = lireLocal("orci.v");
  if (typeof v !== "string" || v.length < 8) {
    v = hexAleatoire(12);
    ecrireLocal("orci.v", v);
  }
  return v;
}

function deviner() {
  const r = document.referrer;
  if (!r) return null;
  try {
    const h = new URL(r).hostname.replace(/^www\./, "");
    if (h === window.location.hostname) return null;
    if (/tiktok/.test(h)) return "tiktok";
    if (/facebook|^fb\.|^l\.facebook|^m\.facebook/.test(h)) return "facebook";
    if (/instagram/.test(h)) return "instagram";
    if (/whatsapp|^wa\.me/.test(h)) return "whatsapp";
    if (/^t\.me|telegram/.test(h)) return "telegram";
    if (/youtube|youtu\.be/.test(h)) return "youtube";
    if (/google\./.test(h)) return "google";
    return h.slice(0, 60);
  } catch {
    return null;
  }
}

/** ?source=tiktok (ou ?s=, ou ?utm_source=), retenue pour la session. */
export function sourceVisite() {
  const p = new URLSearchParams(window.location.search);
  const brute = p.get("source") || p.get("s") || p.get("utm_source") || "";
  const s = brute.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 60);
  try {
    if (s) sessionStorage.setItem("orci.source", s);
    return s || sessionStorage.getItem("orci.source") || deviner();
  } catch {
    return s || deviner();
  }
}

export function coordonneesConnues() {
  return lireLocal("orci.acheteur") || {};
}

export function retenirCoordonnees(c) {
  ecrireLocal("orci.acheteur", c);
}

// La clé d'un paiement en cours. La référence seule n'ouvre rien : c'est cette
// clé, gardée par le navigateur qui a lancé le paiement, qui rend le lien d'accès.
const clesEnMemoire = new Map();

export function retenirCle(reference, cle) {
  if (!reference || !cle) return;
  clesEnMemoire.set(reference, cle);
  const connues = lireLocal("orci.paiements");
  const autres = Array.isArray(connues) ? connues.filter((x) => Array.isArray(x) && x[0] !== reference) : [];
  ecrireLocal("orci.paiements", [[reference, cle], ...autres].slice(0, 8));
}

export function cleConnue(reference) {
  if (clesEnMemoire.has(reference)) return clesEnMemoire.get(reference);
  const connues = lireLocal("orci.paiements");
  const trouvee = Array.isArray(connues) ? connues.find((x) => Array.isArray(x) && x[0] === reference) : null;
  return trouvee ? trouvee[1] : null;
}

export function accesConnu(slug) {
  const a = lireLocal("orci.acces") || {};
  return typeof a[slug] === "string" ? a[slug] : null;
}

export function retenirAcces(slug, jeton) {
  if (!slug || !jeton) return;
  const a = lireLocal("orci.acces") || {};
  a[slug] = jeton;
  ecrireLocal("orci.acces", a);
}
