import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { correspond, useAdresse } from "./lib/routeur.jsx";
import Acces from "./pages/Acces.jsx";
import Attente from "./pages/Attente.jsx";
import Introuvable from "./pages/Introuvable.jsx";
import Paiement from "./pages/Paiement.jsx";
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

  if (chemin === "/") return <Vente slug={null} />;
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
