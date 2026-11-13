// Les pays où NelsiusPay encaisse, et ce que l'acheteur peut y utiliser.
// Source : https://api.nelsiuspay.com/api/v1/public/payment-config (novembre 2026).
//
// Un opérateur est soit l'identifiant d'un logo de public/paiements (« mtn »,
// « orange »…), soit son nom tel quel, affiché en toutes lettres faute de logo.
// La carte (Visa, Mastercard) et PayPal sont proposés dans tous les pays.

export const MOYENS_GLOBAUX = ["visa", "mastercard", "paypal"];

/** Les moyens qui ont un logo (public/paiements/<id>.webp), et leur nom. */
export const NOMS_MOYENS = {
  mtn: "MTN Mobile Money",
  orange: "Orange Money",
  "moov-money": "Moov Money",
  "airtel-money": "Airtel Money",
  wave: "Wave",
  visa: "Visa",
  mastercard: "Mastercard",
  paypal: "PayPal",
};

export function nomMoyen(m) {
  return NOMS_MOYENS[m] ?? m;
}

export const PAYS = [
  { code: "CM", nom: "Cameroun", chez: "au Cameroun", indicatif: "237", drapeau: "🇨🇲", exemple: "6 90 12 34 56", operateurs: ["mtn", "orange"] },
  { code: "BJ", nom: "Bénin", chez: "au Bénin", indicatif: "229", drapeau: "🇧🇯", operateurs: ["mtn", "moov-money"] },
  { code: "CG", nom: "Congo-Brazzaville", chez: "au Congo-Brazzaville", indicatif: "242", drapeau: "🇨🇬", operateurs: ["mtn", "airtel-money"] },
  { code: "CI", nom: "Côte d'Ivoire", chez: "en Côte d'Ivoire", indicatif: "225", drapeau: "🇨🇮", operateurs: ["wave", "orange", "mtn", "moov-money"] },
  { code: "GH", nom: "Ghana", chez: "au Ghana", indicatif: "233", drapeau: "🇬🇭", operateurs: ["mtn", "Vodafone Cash", "AirtelTigo"] },
  { code: "KE", nom: "Kenya", chez: "au Kenya", indicatif: "254", drapeau: "🇰🇪", operateurs: ["M-Pesa", "airtel-money"] },
  { code: "LR", nom: "Libéria", chez: "au Libéria", indicatif: "231", drapeau: "🇱🇷", operateurs: ["mtn"] },
  { code: "MW", nom: "Malawi", chez: "au Malawi", indicatif: "265", drapeau: "🇲🇼", operateurs: ["airtel-money", "TNM Mpamba"] },
  { code: "MZ", nom: "Mozambique", chez: "au Mozambique", indicatif: "258", drapeau: "🇲🇿", operateurs: ["M-Pesa", "Vodacom", "e-Mola"] },
  { code: "NG", nom: "Nigéria", chez: "au Nigéria", indicatif: "234", drapeau: "🇳🇬", operateurs: ["mtn", "airtel-money"] },
  { code: "UG", nom: "Ouganda", chez: "en Ouganda", indicatif: "256", drapeau: "🇺🇬", operateurs: ["mtn", "airtel-money"] },
  { code: "CD", nom: "RD Congo", chez: "en RD Congo", indicatif: "243", drapeau: "🇨🇩", operateurs: ["Vodacom M-Pesa", "airtel-money", "orange", "Africell"] },
  { code: "RW", nom: "Rwanda", chez: "au Rwanda", indicatif: "250", drapeau: "🇷🇼", operateurs: ["mtn", "airtel-money"] },
  { code: "SN", nom: "Sénégal", chez: "au Sénégal", indicatif: "221", drapeau: "🇸🇳", operateurs: ["wave", "orange", "Free Money", "Expresso"] },
  { code: "SL", nom: "Sierra Leone", chez: "en Sierra Leone", indicatif: "232", drapeau: "🇸🇱", operateurs: ["orange", "Afrimoney"] },
  { code: "TZ", nom: "Tanzanie", chez: "en Tanzanie", indicatif: "255", drapeau: "🇹🇿", operateurs: ["Vodacom M-Pesa", "airtel-money", "Tigo Pesa", "HaloPesa"] },
  { code: "ZM", nom: "Zambie", chez: "en Zambie", indicatif: "260", drapeau: "🇿🇲", operateurs: ["mtn", "airtel-money", "Zamtel"] },
];

const PAR_CODE = new Map(PAYS.map((p) => [p.code, p]));

export function paysDe(code) {
  return PAR_CODE.get(code) ?? PAYS[0];
}

/** Tout ce que l'acheteur de ce pays peut utiliser : son Mobile Money, puis carte et PayPal. */
export function moyensDuPays(code) {
  return [...paysDe(code).operateurs, ...MOYENS_GLOBAUX];
}

// Le fuseau horaire du téléphone dit presque toujours le pays.
const FUSEAUX = {
  "Africa/Douala": "CM",
  "Africa/Porto-Novo": "BJ",
  "Africa/Brazzaville": "CG",
  "Africa/Abidjan": "CI",
  "Africa/Accra": "GH",
  "Africa/Nairobi": "KE",
  "Africa/Monrovia": "LR",
  "Africa/Blantyre": "MW",
  "Africa/Maputo": "MZ",
  "Africa/Lagos": "NG",
  "Africa/Kampala": "UG",
  "Africa/Kinshasa": "CD",
  "Africa/Lubumbashi": "CD",
  "Africa/Kigali": "RW",
  "Africa/Dakar": "SN",
  "Africa/Freetown": "SL",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Lusaka": "ZM",
};

/** Le pays retenu, sinon celui que suggère le fuseau horaire, sinon le Cameroun. */
export function paysParDefaut() {
  try {
    const retenu = localStorage.getItem("orci.pays");
    if (retenu && PAR_CODE.has(retenu)) return retenu;
  } catch {
    // Stockage refusé : on devine.
  }
  try {
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (FUSEAUX[fuseau]) return FUSEAUX[fuseau];
  } catch {
    // Pas de fuseau lisible.
  }
  return "CM";
}

export function retenirPays(code) {
  try {
    if (PAR_CODE.has(code)) localStorage.setItem("orci.pays", code);
  } catch {
    // sans importance
  }
}
