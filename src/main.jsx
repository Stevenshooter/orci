import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { correspond, useAdresse } from "./lib/routeur.jsx";
import Acces from "./pages/Acces.jsx";
import Attente from "./pages/Attente.jsx";
import Introuvable from "./pages/Introuvable.jsx";
import Paiement from "./pages/Paiement.jsx";
import Accueil from "./pages/series/Accueil.jsx";
import Explorer from "./pages/series/Explorer.jsx";
import Fiche from "./pages/series/Fiche.jsx";
import PageLecteur from "./pages/series/Lecteur.jsx";
import { MaListe, MonAcces } from "./pages/series/Perso.jsx";
import PagePremium from "./pages/series/Premium.jsx";
import Vente from "./pages/Vente.jsx";
import { Chargement } from "./ui.jsx";

// L'espace admin n'est téléchargé que par le propriétaire : un acheteur sur
// téléphone ne paie pas son poids.
const Admin = lazy(() => import("./admin/Admin.jsx"));

// Le lien de connexion du propriétaire peut revenir à la racine du site (c'est
// le réglage « Site URL » de Supabase qui décide) : on le conduit à l'espace
// admin, qui sait lire la session portée par l'adresse.
if (/(^#|&)(access_token|error_description)=/.test(window.location.hash) && !window.location.pathname.startsWith("/admin")) {
  window.history.replaceState(null, "", `/admin${window.location.hash}`);
}

function App() {
  const { chemin } = useAdresse();
  let p;

  // Les mini-séries, organisées comme une appli : accueil, explorer, premium,
  // ma liste, mon accès ; la fiche d'une série, puis son lecteur plein écran.
  // Le lecteur garde la même clé d'une partie à l'autre : il enchaîne sans se
  // recharger.
  if (chemin === "/") return <Accueil />;
  if (chemin === "/explorer") return <Explorer />;
  if (chemin === "/premium") return <PagePremium />;
  if (chemin === "/ma-liste") return <MaListe />;
  if (chemin === "/mon-acces") return <MonAcces />;
  if ((p = correspond("/s/:slug", chemin))) return <Fiche key={p.slug} slug={p.slug} />;
  if ((p = correspond("/s/:slug/:numero", chemin))) {
    return <PageLecteur key={p.slug} slug={p.slug} numero={Number.parseInt(p.numero, 10) || 0} />;
  }
  if ((p = correspond("/o/:slug", chemin))) return <Vente key={p.slug} slug={p.slug} />;
  if ((p = correspond("/o/:slug/paiement", chemin))) return <Paiement key={p.slug} slug={p.slug} />;
  if ((p = correspond("/paiement/:reference", chemin))) return <Attente key={p.reference} reference={p.reference} />;
  if ((p = correspond("/acces/:jeton", chemin))) return <Acces key={p.jeton} jeton={p.jeton} />;
  // /connexion : l'adresse courte à garder en favori. Une fois connecté, elle
  // mène au tableau de bord.
  if (chemin === "/connexion" || chemin === "/connexion/") {
    return (
      <Suspense fallback={<div className="page page-centree"><Chargement /></div>}>
        <Admin chemin="/admin/connexion" />
      </Suspense>
    );
  }
  if (chemin === "/admin" || chemin.startsWith("/admin/")) {
    return (
      <Suspense fallback={<div className="page page-centree"><Chargement /></div>}>
        <Admin chemin={chemin} />
      </Suspense>
    );
  }
  return <Introuvable />;
}

createRoot(document.getElementById("racine")).render(<App />);
