// Orci — signer un court message avec un secret que la base a généré.
//
// Sert à remettre au navigateur qui ouvre un paiement une « clé » que lui seul
// détient. La référence d'une commande, elle, s'affiche à l'écran, se recopie,
// part en capture dans un groupe : elle ne doit pas suffire à récupérer le lien
// d'accès d'un autre.
//
// Rien n'est stocké : la clé se recalcule à partir de la référence.

import { reglage } from "./base.ts";

let cle: Promise<CryptoKey> | null = null;

function cleHmac(): Promise<CryptoKey> {
  if (!cle) {
    cle = (async () => {
      const secret = await reglage("etat_secret");
      if (!secret) throw new Error("Secret de signature absent de la base.");
      return await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    })();
    // Un échec ne doit pas rester en mémoire : le prochain appel réessaie.
    cle.catch(() => {
      cle = null;
    });
  }
  return cle;
}

/** 40 caractères hexadécimaux (160 bits) : impossible à deviner. */
export async function signature(message: string): Promise<string> {
  const s = await crypto.subtle.sign("HMAC", await cleHmac(), new TextEncoder().encode(message));
  return Array.from(new Uint8Array(s), (x) => x.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
