// Les applications (TikTok, Instagram, Facebook) ouvrent les liens dans leur
// propre navigateur. Le paiement et les liens vers Telegram ou WhatsApp y
// marchent mal, et l'acheteur perd la page en fermant l'application : mieux
// vaut lui proposer son vrai navigateur.

const APPLIS = [
  ["TikTok", /musical_ly|trill_|BytedanceWebview|TikTok/i],
  ["Instagram", /Instagram/],
  ["Facebook", /FBAN|FBAV|FB_IAB|FBIOS/],
];

/** L'application dont la page est ouverte dans le navigateur intégré, sinon null. */
export function navigateurIntegre(ua = navigator.userAgent || "") {
  for (const [nom, motif] of APPLIS) if (motif.test(ua)) return nom;
  return null;
}

export function estAndroid(ua = navigator.userAgent || "") {
  return /Android/i.test(ua);
}

/**
 * Sur Android, un lien intent:// ouvre la page dans le navigateur du téléphone.
 * Si rien ne peut l'ouvrir, la même page se recharge ici.
 */
export function lienNavigateur(adresse = window.location.href) {
  const u = new URL(adresse);
  const schema = u.protocol.replace(":", "");
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${schema};S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
}
