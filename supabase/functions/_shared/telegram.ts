// Orci — le bot Telegram.
//
// POURQUOI TELEGRAM EST L'OUTIL LE PLUS SÛR. L'API des bots fait tout ce qu'il
// faut pour un groupe payant : un lien d'entrée valable pour UNE personne et un
// jour, un avis quand quelqu'un entre par ce lien, et la sortie d'un membre dont
// l'accès est fini. Rien n'est laissé au formateur.
//
// Le jeton du bot (créé chez @BotFather) est collé une fois dans l'espace admin
// et rangé dans `prive.reglages`. Un secret TELEGRAM_BOT_TOKEN, s'il existe,
// passe devant.

import { reglage } from "./base.ts";

const API = "https://api.telegram.org";

export async function jetonBot(): Promise<string | null> {
  return Deno.env.get("TELEGRAM_BOT_TOKEN") ?? (await reglage("telegram_bot_token"));
}

export async function appel<T = unknown>(
  methode: string,
  params: Record<string, unknown> = {},
  jeton?: string,
): Promise<T> {
  const t = jeton ?? (await jetonBot());
  if (!t) throw new Error("Le bot Telegram n'est pas configuré.");
  const r = await fetch(`${API}/bot${t}/${methode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const j = await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
  if (!j.ok) throw new Error(`Telegram ${methode} : ${j.description ?? "réponse illisible"}`);
  return j.result as T;
}

export interface LienInvitation {
  readonly invite_link: string;
  readonly expire_date?: number;
}

/** Un lien d'entrée pour une seule personne, valable 24 heures. */
export function creerLienUnique(chatId: number | string, nom: string): Promise<LienInvitation> {
  return appel<LienInvitation>("createChatInviteLink", {
    chat_id: chatId,
    name: nom.slice(0, 32),
    member_limit: 1,
    expire_date: Math.floor(Date.now() / 1000) + 24 * 3600,
  });
}

export async function revoquerLien(chatId: number | string, lien: string): Promise<void> {
  try {
    await appel("revokeChatInviteLink", { chat_id: chatId, invite_link: lien });
  } catch {
    // Un lien déjà expiré ou déjà utilisé ne se révoque pas : ce n'est pas une panne.
  }
}

/**
 * Sortir un membre sans le bannir à vie : bannir puis lever le ban. Il peut
 * revenir plus tard avec un nouveau lien, s'il paie à nouveau.
 */
export async function sortirMembre(chatId: number | string, userId: number): Promise<void> {
  await appel("banChatMember", { chat_id: chatId, user_id: userId, revoke_messages: false });
  await appel("unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true });
}

export function envoyer(chatId: number | string, texte: string): Promise<unknown> {
  return appel("sendMessage", { chat_id: chatId, text: texte, disable_web_page_preview: true });
}
