import { Lien } from "../lib/routeur.jsx";
import { useTitre } from "../ui.jsx";

export default function Introuvable({ texte = "Cette page n'existe pas." }) {
  useTitre("Page introuvable · Orci");
  return (
    <div className="page page-etroite page-centree introuvable">
      <p className="surtitre">Introuvable</p>
      <h1>{texte}</h1>
      <Lien className="bouton bouton-discret" href="/">Aller à l'accueil</Lien>
    </div>
  );
}
