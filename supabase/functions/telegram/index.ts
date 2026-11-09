// telegram — le webhook du bot, et ses réglages depuis l'espace admin.
//
// DEUX PORTES DANS LA MÊME FONCTION, et c'est l'en-tête qui choisit :
//   · X-Telegram-Bot-Api-Secret-Token présent → c'est Telegram. Le secret est
//     généré par la base (`prive.reglages.telegram_secret`) et donné à Telegram
//     à l'installation : personne d'autre ne peut se faire passer pour lui.
//   · Sinon → c'est l'espace admin, et le jeton de session du propriétaire est
//     vérifié (verify_jwt ne prouve rien, la clé anon est un JWT valide).
//
// Actions admin :
//   etat                     → bot configuré ? son nom, l'état du webhook, ses
//                              droits dans le groupe relié
//   installer { jeton }      → vérifie le jeton chez @BotFather, branche le webhook
//   code      { outil_id }   → un code à envoyer dans le groupe : « /lier CODE »
//   oublier                  → débranche le bot

import {
  admin,
  definirReglage,
  egal,
  erreur,
  json,
  lireCorps,
  oublierReglage,
  preflight,
  proprietaire,
  reglage,
  texte,
  urlFonction,
} from "../_shared/base.ts";
import { appel, envoyer, jetonBot } from "../_shared/telegram.ts";

// deno-lint-ignore no-explicit-any
type Ligne = any;

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;

  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== null) return await webhook(req, secret);

  const moi = await proprietaire(req);
  if (!moi) return erreur("Connecte-toi d'abord.", 401);

  const corps = await lireCorps(req);
  try {
    switch (corps.action) {
      case "etat":
        return json(await etat(moi.formateurId));
      case "installer":
        return await installer(texte(corps.jeton, 100));
      case "code":
        return await code(moi.formateurId, texte(corps.outil_id, 40));
      case "oublier":
        return await oublier();
      default:
        return erreur("Action inconnue");
    }
  } catch (e) {
    console.error("[telegram]", e);
    return erreur(e instanceof Error ? e.message : "Erreur interne", 500);
  }
});

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

async function webhook(req: Request, recu: string): Promise<Response> {
  const attendu = await reglage("telegram_secret");
  if (!attendu || !egal(recu, attendu)) return new Response("interdit", { status: 401 });

  const u = await req.json().catch(() => null);
  try {
    await traiter(u);
  } catch (e) {
    // Toujours répondre 200 : une erreur renvoyée ferait rejouer la même mise à
    // jour par Telegram, en boucle.
    console.error("[telegram] mise à jour non traitée :", e instanceof Error ? e.message : e);
  }
  return new Response("ok");
}

async function traiter(u: Ligne): Promise<void> {
  const m = u?.message;

  // Un groupe qui devient « supergroupe » change d'identifiant : le suivre,
  // sinon plus aucun lien d'entrée ne pourrait être créé.
  if (m?.migrate_to_chat_id && m.chat?.id) {
    await migrer(m.chat.id, m.migrate_to_chat_id);
    return;
  }

  if (m?.text) {
    const t = String(m.text).trim();
    const chat = m.chat;
    const groupe = chat?.type === "group" || chat?.type === "supergroup";

    if (groupe && /^\/lier(@\w+)?(\s|$)/i.test(t)) {
      await lier(chat, t.split(/\s+/)[1] ?? "");
      return;
    }
    if (chat?.type === "private" && /^\/start/.test(t)) {
      await envoyer(
        chat.id,
        "Bonjour ! Je gère l'entrée dans les groupes des formations vendues sur Orci. " +
          "Pour rejoindre un groupe, utilise le bouton de ta page « Mes accès ».",
      );
    }
    return;
  }

  const cm = u?.chat_member;
  if (cm) {
    const statut = cm.new_chat_member?.status;
    if (statut === "left" || statut === "kicked") await sortie(cm);
    else await entree(cm);
  }
}

async function migrer(ancien: number, nouveau: number): Promise<void> {
  const { data: os } = await admin()
    .from("outils")
    .select("id, config")
    .eq("type", "telegram")
    .eq("config->>chat_id", String(ancien));
  for (const o of os ?? []) {
    await admin()
      .from("outils")
      .update({ config: { ...(o.config ?? {}), chat_id: nouveau } })
      .eq("id", o.id);
  }
}

/**
 * Un acheteur dont l'accès court encore a quitté le groupe de lui-même : son
 * lien d'entrée, à usage unique, est consommé. On rouvre sa livraison pour
 * qu'il puisse en demander un nouveau depuis « Mes accès ».
 *
 * Les sorties provoquées par Orci (fin d'accès) passent aussi par ici, mais
 * l'accès est déjà fermé à ce moment-là : elles sont ignorées.
 */
async function sortie(cm: Ligne): Promise<void> {
  const user = cm.new_chat_member?.user;
  const chatId = cm.chat?.id;
  if (!user || !chatId) return;

  const { data: ls } = await admin()
    .from("livraisons")
    .select("id, details, acces(statut), outils(type, config)")
    .eq("statut", "fait")
    .eq("details->>user_id", String(user.id));
  for (const l of (ls ?? []) as Ligne[]) {
    if (l.outils?.type !== "telegram" || String(l.outils?.config?.chat_id) !== String(chatId)) continue;
    if (l.acces?.statut !== "actif") continue;
    await admin()
      .from("livraisons")
      .update({ statut: "a_faire", details: { ...(l.details ?? {}), invite_link: null, invite_expire: null } })
      .eq("id", l.id);
  }
}

async function lier(chat: Ligne, codeRecu: string): Promise<void> {
  if (!codeRecu) {
    await envoyer(chat.id, "Écris le code donné par Orci, par exemple : /lier AB12CD34");
    return;
  }
  const { data: outilId } = await admin().rpc("telegram_utiliser_code", { p_code: codeRecu });
  if (!outilId) {
    await envoyer(chat.id, "Ce code n'est pas valable ou a expiré. Génère-en un nouveau dans Orci.");
    return;
  }

  const { data: o } = await admin().from("outils").select("config").eq("id", outilId).single();
  await admin()
    .from("outils")
    .update({ config: { ...(o?.config ?? {}), chat_id: chat.id, chat_titre: chat.title ?? null } })
    .eq("id", outilId);

  // Le bot doit pouvoir inviter et sortir des membres, sinon il ne sert à rien.
  let droits = false;
  try {
    const moi = await appel<{ id: number }>("getMe");
    const membre = await appel<Ligne>("getChatMember", { chat_id: chat.id, user_id: moi.id });
    droits = membre?.status === "administrator" && membre?.can_invite_users && membre?.can_restrict_members;
  } catch {
    droits = false;
  }

  await envoyer(
    chat.id,
    droits
      ? "C'est bon : ce groupe est relié à Orci. Chaque acheteur recevra son propre lien d'entrée."
      : "Groupe relié à Orci, mais il me manque des droits. Fais de moi un administrateur avec « Inviter des utilisateurs » et « Bannir des utilisateurs ».",
  );
}

/** Quelqu'un entre par un lien d'Orci : on sait maintenant qui il est. */
async function entree(cm: Ligne): Promise<void> {
  const statut = cm.new_chat_member?.status;
  const lien = cm.invite_link?.invite_link;
  const user = cm.new_chat_member?.user;
  if (!lien || !user || (statut !== "member" && statut !== "restricted")) return;

  const { data: l } = await admin()
    .from("livraisons")
    .select("id, details, acces(acheteur_id)")
    .eq("details->>invite_link", lien)
    .maybeSingle();
  if (!l) return;

  await admin()
    .from("livraisons")
    .update({ statut: "fait", details: { ...(l.details ?? {}), user_id: user.id }, erreur: null })
    .eq("id", l.id);
  // deno-lint-ignore no-explicit-any
  const acheteurId = (l as any).acces?.acheteur_id;
  if (acheteurId) await admin().from("acheteurs").update({ telegram_id: user.id }).eq("id", acheteurId);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function etat(formateurId: string): Promise<Record<string, unknown>> {
  const jeton = await jetonBot();
  if (!jeton) return { configure: false };
  try {
    const moi = await appel<{ id: number; username: string }>("getMe");
    const info = await appel<{ url: string; last_error_message?: string; last_error_date?: number }>("getWebhookInfo");
    const recente = info.last_error_date && Date.now() / 1000 - info.last_error_date < 24 * 3600;

    // Les droits du bot dans le groupe relié à l'offre du propriétaire.
    let droits: Record<string, boolean> | null = null;
    const { data: os } = await admin()
      .from("outils")
      .select("config, offres!inner(formateur_id)")
      .eq("type", "telegram")
      .eq("offres.formateur_id", formateurId)
      .limit(1);
    const chatId = (os?.[0] as Ligne)?.config?.chat_id;
    if (chatId) {
      try {
        const m = await appel<Ligne>("getChatMember", { chat_id: chatId, user_id: moi.id });
        droits = {
          admin: m?.status === "administrator",
          inviter: Boolean(m?.can_invite_users),
          bannir: Boolean(m?.can_restrict_members),
        };
      } catch {
        droits = { admin: false, inviter: false, bannir: false };
      }
    }

    return {
      configure: true,
      bot: moi.username,
      webhook: info.url === urlFonction("telegram"),
      derniere_erreur: recente ? info.last_error_message ?? null : null,
      droits,
    };
  } catch (e) {
    return { configure: true, bot: null, webhook: false, derniere_erreur: e instanceof Error ? e.message : String(e) };
  }
}

async function installer(jeton: string): Promise<Response> {
  if (!/^\d{6,12}:[\w-]{30,}$/.test(jeton)) {
    return erreur("Ce jeton ne ressemble pas à celui de @BotFather (il ressemble à 123456789:AA…).");
  }
  let moi: { username: string };
  try {
    moi = await appel<{ username: string }>("getMe", {}, jeton);
  } catch {
    return erreur("Telegram refuse ce jeton. Recopie-le depuis @BotFather.");
  }

  const secret = await reglage("telegram_secret");
  if (!secret) throw new Error("Secret Telegram absent de la base.");

  await appel("setWebhook", {
    url: urlFonction("telegram"),
    secret_token: secret,
    allowed_updates: ["message", "chat_member", "my_chat_member"],
    drop_pending_updates: true,
  }, jeton);

  await definirReglage("telegram_bot_token", jeton);
  return json({ bot: moi.username });
}

async function code(formateurId: string, outilId: string): Promise<Response> {
  const { data: o } = await admin()
    .from("outils")
    .select("id, type, offres(formateur_id)")
    .eq("id", outilId)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  if (!o || o.type !== "telegram" || (o as any).offres?.formateur_id !== formateurId) {
    return erreur("Outil introuvable.", 404);
  }
  const { data: c, error } = await admin().rpc("telegram_creer_code", { p_outil: outilId });
  if (error) throw new Error(error.message);

  let bot: string | null = null;
  try {
    bot = (await appel<{ username: string }>("getMe")).username;
  } catch {
    bot = null;
  }
  return json({ code: c, bot });
}

async function oublier(): Promise<Response> {
  try {
    await appel("deleteWebhook", { drop_pending_updates: true });
  } catch {
    // Jeton déjà invalide : rien à débrancher chez Telegram.
  }
  await oublierReglage("telegram_bot_token");
  return json({ ok: true });
}
