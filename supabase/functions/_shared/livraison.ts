// Orci — donner l'accès, et le reprendre.
//
// Chaque accès a une « livraison » par outil. Ce module les fait avancer :
//   · livrer()  : ce qui peut se faire sans l'acheteur (partage Drive, invitations
//                 Meet) se fait tout de suite ; Telegram attend son clic, WhatsApp
//                 attend le formateur.
//   · retirer() : à l'expiration ou au remboursement, chaque outil est refermé.
//                 WhatsApp n'ayant pas d'API de groupe, il passe en « à retirer »
//                 et le formateur le fait à la main.
//
// UNE PANNE D'OUTIL N'ARRÊTE PAS LES AUTRES. Un Drive mal connecté ne doit pas
// empêcher l'invitation Meet : chaque livraison échoue seule, en « erreur », avec
// son message, et se rejoue au prochain passage.

import { admin } from "./base.ts";
import * as google from "./google.ts";
import * as telegram from "./telegram.ts";

type Details = Record<string, unknown>;

interface Livraison {
  id: string;
  statut: string;
  details: Details;
  outil: { id: string; type: string; titre: string; config: Details; actif: boolean };
}

interface Contexte {
  acces: { id: string; statut: string; offre_id: string };
  offre: { id: string; titre: string; formateur_id: string };
  acheteur: { id: string; nom: string; email: string | null; telephone: string };
  livraisons: Livraison[];
}

async function charger(accesId: string): Promise<Contexte | null> {
  const { data: a, error } = await admin()
    .from("acces")
    .select("id, statut, offre_id, offres(id, titre, formateur_id), acheteurs(id, nom, email, telephone)")
    .eq("id", accesId)
    .maybeSingle();
  if (error) throw new Error(`Accès illisible : ${error.message}`);
  if (!a) return null;

  const { data: ls, error: e2 } = await admin()
    .from("livraisons")
    .select("id, statut, details, outils(id, type, titre, config, actif)")
    .eq("acces_id", accesId);
  if (e2) throw new Error(`Livraisons illisibles : ${e2.message}`);

  // deno-lint-ignore no-explicit-any
  const brut = a as any;
  return {
    acces: { id: brut.id, statut: brut.statut, offre_id: brut.offre_id },
    offre: brut.offres,
    acheteur: brut.acheteurs,
    // deno-lint-ignore no-explicit-any
    livraisons: (ls ?? []).map((l: any) => ({ id: l.id, statut: l.statut, details: l.details ?? {}, outil: l.outils })),
  };
}

async function maj(id: string, statut: string, details: Details, erreur: string | null = null): Promise<void> {
  const { error } = await admin().from("livraisons").update({ statut, details, erreur }).eq("id", id);
  if (error) console.error(`[livraison ${id}] mise à jour impossible :`, error.message);
}

async function futursLives(offreId: string): Promise<{ id: string; google_event_id: string | null }[]> {
  const { data } = await admin()
    .from("lives")
    .select("id, google_event_id")
    .eq("offre_id", offreId)
    .gte("debut", new Date(Date.now() - 3 * 3600_000).toISOString());
  return (data ?? []) as { id: string; google_event_id: string | null }[];
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function livrer(accesId: string): Promise<void> {
  const ctx = await charger(accesId);
  if (!ctx || ctx.acces.statut !== "actif") return;

  for (const l of ctx.livraisons) {
    if (!l.outil?.actif) continue;
    if (l.statut !== "a_faire" && l.statut !== "erreur") continue;
    const cfg = l.outil.config ?? {};

    try {
      switch (l.outil.type) {
        case "drive": {
          if (!ctx.acheteur.email || !cfg.dossier_id) break;
          const permission = await google.partagerDossier(
            ctx.offre.formateur_id,
            String(cfg.dossier_id),
            ctx.acheteur.email,
            `Bienvenue dans « ${ctx.offre.titre} ». Voici le dossier de la formation.`,
          );
          await maj(l.id, "fait", { ...l.details, permission_id: permission, email: ctx.acheteur.email });
          break;
        }
        case "meet": {
          if (!ctx.acheteur.email) break;
          for (const live of await futursLives(ctx.offre.id)) {
            if (live.google_event_id) {
              await google.modifierInvites(ctx.offre.formateur_id, live.google_event_id, [ctx.acheteur.email], []);
            }
          }
          await maj(l.id, "fait", { ...l.details, email: ctx.acheteur.email });
          break;
        }
        case "lien":
          await maj(l.id, "fait", l.details);
          break;
        // telegram : le lien se crée quand l'acheteur clique sur « Rejoindre ».
        // whatsapp : c'est le formateur qui accepte le membre dans le groupe.
      }
    } catch (e) {
      console.error(`[livraison ${l.id}] ${l.outil.type} :`, message(e));
      await maj(l.id, "erreur", l.details, message(e));
    }
  }
}

export async function retirer(accesId: string, statut: "expire" | "revoque"): Promise<void> {
  const { error } = await admin().from("acces").update({ statut }).eq("id", accesId);
  if (error) throw new Error(`Accès non fermé : ${error.message}`);

  const ctx = await charger(accesId);
  if (!ctx) return;

  for (const l of ctx.livraisons) {
    if (l.statut === "retire") continue;
    const cfg = l.outil?.config ?? {};

    try {
      switch (l.outil?.type) {
        case "telegram": {
          if (cfg.chat_id && l.details.user_id) {
            await telegram.sortirMembre(cfg.chat_id as number, Number(l.details.user_id));
          } else if (cfg.chat_id && l.details.invite_link) {
            await telegram.revoquerLien(cfg.chat_id as number, String(l.details.invite_link));
          }
          await maj(l.id, "retire", l.details);
          break;
        }
        case "drive": {
          if (cfg.dossier_id && l.details.permission_id) {
            await google.retirerPartage(ctx.offre.formateur_id, String(cfg.dossier_id), String(l.details.permission_id));
          }
          await maj(l.id, "retire", { ...l.details, permission_id: null });
          break;
        }
        case "meet": {
          const email = (l.details.email as string | undefined) ?? ctx.acheteur.email;
          if (email) {
            for (const live of await futursLives(ctx.offre.id)) {
              if (live.google_event_id) {
                await google.modifierInvites(ctx.offre.formateur_id, live.google_event_id, [], [email]);
              }
            }
          }
          await maj(l.id, "retire", l.details);
          break;
        }
        case "whatsapp":
          // Pas d'API de groupe utilisable : le formateur le sort à la main.
          await maj(l.id, l.statut === "fait" ? "a_retirer" : "retire", l.details);
          break;
        default:
          await maj(l.id, "retire", l.details);
      }
    } catch (e) {
      console.error(`[retrait ${l.id}] ${l.outil?.type} :`, message(e));
      await maj(l.id, "erreur", { ...l.details, retrait: true }, `Retrait impossible : ${message(e)}`);
    }
  }
}
