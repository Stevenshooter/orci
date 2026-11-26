// Adresse du projet Supabase et clé publiable.
//
// Ces deux valeurs sont PUBLIQUES par nature : elles voyagent dans chaque page
// servie au navigateur. Ce qui protège les données, ce sont les politiques RLS
// et les fonctions Edge, pas le secret de cette clé.
export const SUPABASE_URL = "https://bjdghybtcskbfklxoocz.supabase.co";
export const SUPABASE_CLE = "sb_publishable_GQOsSj3QG9YiyqLtAGCG3g_5Wj49Jo-";

// Les comptes spectateurs (Firebase Authentication). Ces valeurs aussi sont
// publiques : elles identifient le projet Firebase, elles n'ouvrent rien.
// `authDomain` est le site lui-même : vercel.json renvoie /__/auth vers
// Firebase, pour que la connexion Google revienne bien, même depuis TikTok.
// Tant que FIREBASE vaut null, le site marche sans compte.
export const FIREBASE = null;
