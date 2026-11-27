// Adresse du projet Supabase et clé publiable.
//
// Ces deux valeurs sont PUBLIQUES par nature : elles voyagent dans chaque page
// servie au navigateur. Ce qui protège les données, ce sont les politiques RLS
// et les fonctions Edge, pas le secret de cette clé.
export const SUPABASE_URL = "https://bjdghybtcskbfklxoocz.supabase.co";
export const SUPABASE_CLE = "sb_publishable_GQOsSj3QG9YiyqLtAGCG3g_5Wj49Jo-";

// Les comptes spectateurs (Firebase Authentication). Ces valeurs aussi sont
// publiques : elles identifient le projet Firebase, elles n'ouvrent rien.
// Sur orci.me, `authDomain` devient le site lui-même (src/lib/compte.js) :
// vercel.json relaie /__/auth vers Firebase, pour que la connexion Google
// revienne bien, même depuis Safari ou TikTok.
// Avec FIREBASE = null, le site marche sans compte.
export const FIREBASE = {
  apiKey: "AIzaSyCgrSU3tjXoIff_WKuKdKgOR6KK5cbsNtM",
  authDomain: "orci-9e4ad.firebaseapp.com",
  projectId: "orci-9e4ad",
  appId: "1:545889209294:web:386b3c6e66ebb88bfeb99f",
};
