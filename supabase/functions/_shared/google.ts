// Orci — Google Drive et Google Meet, au nom du formateur.
//
// SEUL LE FORMATEUR AUTORISE ORCI, une fois. Les acheteurs n'autorisent rien :
// ils reçoivent un partage Drive et des invitations d'agenda sur leur adresse
// Gmail, comme s'ils venaient du formateur lui-même.
//
// LES DROITS DEMANDÉS SONT LES PLUS ÉTROITS POSSIBLE.
//   · drive.file : Orci ne voit QUE les fichiers qu'il a créés. Il crée donc le
//     dossier de la formation, le formateur y range ses vidéos, et partager ce
//     dossier partage tout ce qu'il contient. Le reste du Drive reste invisible.
//   · calendar.events : créer les lives avec leur lien Meet, inviter et retirer
//     des participants.
//
// Les identifiants OAuth (client_id, client_secret) se collent dans l'espace
// admin, ou se posent en secrets GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET.

import { admin, reglage } from "./base.ts";

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
];

export async function identifiants(): Promise<{ clientId: string; clientSecret: string } | null> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? (await reglage("google_client_id"));
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? (await reglage("google_client_secret"));
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function urlConnexion(clientId: string, redirectUri: string, etat: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Sans « consent », Google ne rend pas de refresh_token à la deuxième
    // connexion, et Orci perdrait l'accès au bout d'une heure.
    prompt: "consent",
    include_granted_scopes: "true",
    state: etat,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function echangerCode(code: string, redirectUri: string): Promise<{
  refreshToken: string | null;
  accessToken: string;
  email: string | null;
  scopes: string;
}> {
  const id = await identifiants();
  if (!id) throw new Error("Identifiants Google absents.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id.clientId,
      client_secret: id.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google a refusé le code : ${j.error_description ?? j.error ?? r.status}`);

  let email: string | null = null;
  if (j.id_token) {
    try {
      const charge = JSON.parse(atob(String(j.id_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      email = charge.email ?? null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: j.refresh_token ?? null, accessToken: j.access_token, email, scopes: j.scope ?? "" };
}

const cache = new Map<string, { jeton: string; expire: number }>();

/** Un jeton d'accès frais, tiré du refresh_token rangé en base. */
export async function jetonAcces(formateurId: string): Promise<string> {
  const c = cache.get(formateurId);
  if (c && c.expire > Date.now() + 60_000) return c.jeton;

  const { data, error } = await admin().rpc("google_jeton", { p_formateur: formateurId });
  if (error) throw new Error(`Connexion Google illisible : ${error.message}`);
  const refresh = (data as { refresh_token?: string } | null)?.refresh_token;
  if (!refresh) throw new Error("Google n'est pas connecté.");

  const id = await identifiants();
  if (!id) throw new Error("Identifiants Google absents.");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id.clientId,
      client_secret: id.clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) {
    // invalid_grant : l'autorisation a été retirée, ou l'application Google est
    // restée en mode « Test » (ses autorisations expirent au bout de 7 jours).
    throw new Error(`Google ne renouvelle plus l'accès : ${j.error_description ?? j.error ?? r.status}. Reconnecte Google dans Orci.`);
  }
  cache.set(formateurId, { jeton: j.access_token, expire: Date.now() + (Number(j.expires_in ?? 3600) * 1000) });
  return j.access_token;
}

async function api<T = Record<string, unknown>>(
  formateurId: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const jeton = await jetonAcces(formateurId);
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 204) return {} as T;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j as { error?: { message?: string } }).error?.message ?? `HTTP ${r.status}`;
    throw new Error(`Google : ${m}`);
  }
  return j as T;
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export function creerDossier(formateurId: string, nom: string): Promise<{ id: string; webViewLink: string }> {
  return api(formateurId, "https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    body: JSON.stringify({ name: nom, mimeType: "application/vnd.google-apps.folder" }),
  });
}

export async function partagerDossier(
  formateurId: string,
  dossierId: string,
  email: string,
  message: string,
): Promise<string> {
  const p = new URLSearchParams({ sendNotificationEmail: "true", emailMessage: message, fields: "id" });
  const r = await api<{ id: string }>(
    formateurId,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(dossierId)}/permissions?${p}`,
    { method: "POST", body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }) },
  );
  return r.id;
}

export async function retirerPartage(formateurId: string, dossierId: string, permissionId: string): Promise<void> {
  try {
    await api(formateurId, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(dossierId)}/permissions/${encodeURIComponent(permissionId)}`, {
      method: "DELETE",
    });
  } catch (e) {
    // Déjà retiré à la main dans Drive : le but est atteint.
    if (!String(e).includes("not found") && !String(e).includes("404")) throw e;
  }
}

// ---------------------------------------------------------------------------
// Agenda et Meet
// ---------------------------------------------------------------------------

const AGENDA = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface Evenement {
  id: string;
  hangoutLink?: string;
  attendees?: { email: string }[];
}

export function creerEvenement(formateurId: string, e: {
  titre: string;
  description: string;
  debut: Date;
  fin: Date;
  invites: string[];
}): Promise<Evenement> {
  const p = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: "all" });
  return api<Evenement>(formateurId, `${AGENDA}?${p}`, {
    method: "POST",
    body: JSON.stringify({
      summary: e.titre,
      description: e.description,
      start: { dateTime: e.debut.toISOString() },
      end: { dateTime: e.fin.toISOString() },
      attendees: e.invites.map((email) => ({ email })),
      // Les acheteurs ne voient pas les adresses des autres, et ne peuvent pas
      // inviter qui ils veulent.
      guestsCanSeeOtherGuests: false,
      guestsCanInviteOthers: false,
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
      },
    }),
  });
}

export async function modifierInvites(
  formateurId: string,
  eventId: string,
  ajouter: string[],
  retirer: string[],
): Promise<void> {
  const ev = await api<Evenement>(formateurId, `${AGENDA}/${encodeURIComponent(eventId)}`);
  const actuels = new Set((ev.attendees ?? []).map((a) => a.email.toLowerCase()));
  for (const e of ajouter) actuels.add(e.toLowerCase());
  for (const e of retirer) actuels.delete(e.toLowerCase());
  const p = new URLSearchParams({ sendUpdates: ajouter.length ? "all" : "none" });
  await api(formateurId, `${AGENDA}/${encodeURIComponent(eventId)}?${p}`, {
    method: "PATCH",
    body: JSON.stringify({ attendees: [...actuels].map((email) => ({ email })) }),
  });
}

export async function supprimerEvenement(formateurId: string, eventId: string): Promise<void> {
  try {
    await api(formateurId, `${AGENDA}/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" });
  } catch (e) {
    if (!String(e).includes("deleted") && !String(e).includes("404")) throw e;
  }
}
