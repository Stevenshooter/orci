// Mise en forme des nombres, des dates et des numéros, à la française.

const ESPACE = "\u00a0";

export function nombre(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE);
}

export function fcfa(n) {
  return `${nombre(n)}${ESPACE}FCFA`;
}

export function pourcent(part, total) {
  if (!total) return "0" + ESPACE + "%";
  const v = (100 * part) / total;
  return `${v < 10 ? v.toFixed(1).replace(".", ",") : Math.round(v)}${ESPACE}%`;
}

const JOUR_HEURE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function dateHeure(iso) {
  return iso ? JOUR_HEURE.format(new Date(iso)) : "";
}

export function date(iso) {
  return iso ? JOUR.format(new Date(iso)) : "";
}

export function dateCourte(iso) {
  return iso ? COURT.format(new Date(iso)) : "";
}

export function depuis(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)}${ESPACE}min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)}${ESPACE}h`;
  const j = Math.floor(s / 86400);
  return j === 1 ? "hier" : `il y a ${j}${ESPACE}jours`;
}

/** 237690000001 → +237 690 00 00 01 */
export function telephone(t) {
  const n = String(t || "").replace(/\D/g, "");
  if (n.length === 12 && n.startsWith("237")) {
    return `+237${ESPACE}${n.slice(3, 6)}${ESPACE}${n.slice(6, 8)}${ESPACE}${n.slice(8, 10)}${ESPACE}${n.slice(10)}`;
  }
  return n ? `+${n}` : "";
}

export function lienWhatsApp(numero, message) {
  const n = String(numero || "").replace(/\D/g, "");
  const texte = message ? `?text=${encodeURIComponent(message)}` : "";
  return n ? `https://wa.me/${n}${texte}` : `https://wa.me/${texte}`;
}

/**
 * L'opérateur d'un numéro camerounais, quand ses premiers chiffres le disent
 * sans ambiguïté. Dans le doute, rien : l'acheteur choisit lui-même.
 */
export function devinerOperateur(brut) {
  let n = String(brut || "").replace(/\D/g, "");
  if (n.length === 12 && n.startsWith("237")) n = n.slice(3);
  if (n.length < 3 || n[0] !== "6") return null;
  if (n.startsWith("67")) return "mtn";
  if (n.startsWith("69")) return "orange";
  if (/^65[0-4]/.test(n)) return "mtn";
  if (/^65[5-9]/.test(n)) return "orange";
  return null;
}

export function prenom(nom) {
  return String(nom || "").trim().split(/\s+/)[0] || "";
}
