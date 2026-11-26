// Les comptes spectateurs, tenus par Firebase Authentication.
//
// Le navigateur envoie le jeton d'identité Firebase du spectateur ; on le
// vérifie ici avec les clés publiques de Google (signature, émetteur, audience,
// expiration). Sans projet Firebase configuré (secret FIREBASE_PROJECT_ID),
// aucun compte n'est reconnu, et le reste d'Orci marche comme avant.

import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { admin, texte } from "./base.ts";

const CLES_GOOGLE = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface Compte {
  readonly uid: string;
  readonly email: string | null;
  readonly nom: string | null;
  readonly fournisseur: string | null;
}

/** Le compte derrière un jeton Firebase, ou null si le jeton est absent, faux ou expiré. */
export async function verifierCompte(jeton: unknown): Promise<Compte | null> {
  const projet = Deno.env.get("FIREBASE_PROJECT_ID");
  const brut = texte(jeton, 4096);
  if (!projet || !brut) return null;
  try {
    const { payload } = await jwtVerify(brut, CLES_GOOGLE, {
      issuer: `https://securetoken.google.com/${projet}`,
      audience: projet,
    });
    const uid = typeof payload.sub === "string" ? payload.sub : "";
    if (!uid || uid.length > 128) return null;
    const firebase = (payload.firebase ?? {}) as Record<string, unknown>;
    return {
      uid,
      email: typeof payload.email === "string" ? payload.email.toLowerCase().slice(0, 254) : null,
      nom: typeof payload.name === "string" ? payload.name.trim().slice(0, 80) || null : null,
      fournisseur: typeof firebase.sign_in_provider === "string" ? firebase.sign_in_provider.slice(0, 40) : null,
    };
  } catch {
    return null;
  }
}

/** Crée ou met à jour la fiche du spectateur. Un prénom vide n'efface pas celui déjà connu. */
export async function enregistrerSpectateur(c: Compte, prenom?: string | null): Promise<void> {
  const fiche: Record<string, unknown> = {
    uid: c.uid,
    email: c.email,
    fournisseur: c.fournisseur,
    vu_le: new Date().toISOString(),
  };
  const nom = (prenom ?? "").trim().slice(0, 80) || c.nom;
  if (nom) fiche.nom = nom;
  const { error } = await admin().from("spectateurs").upsert(fiche, { onConflict: "uid" });
  if (error) throw new Error(`Compte non enregistré : ${error.message}`);
}

/** Relie un acheteur à un compte, sauf s'il appartient déjà à un autre. */
export async function relierAcheteur(acheteurId: string, uid: string): Promise<boolean> {
  await admin().from("acheteurs").update({ compte: uid }).eq("id", acheteurId).is("compte", null);
  const { data } = await admin().from("acheteurs").select("compte").eq("id", acheteurId).maybeSingle();
  return data?.compte === uid;
}
