// Explorer : toutes les séries, avec une recherche et les genres en filtres.
// Le genre choisi vit dans l'adresse (/explorer?genre=Mystique) : on peut le
// partager, et les pastilles de l'accueil y mènent.

import { useState } from "react";
import { naviguer } from "../../lib/routeur.jsx";
import { Icone, useDonnees, useTitre } from "../../ui.jsx";
import {
  APropos,
  chargerCatalogue,
  Coquille,
  ErreurChargement,
  genresDe,
  GrilleAffiches,
  jetonPremium,
  normaliser,
  PageChargement,
  PucesGenres,
  useVue,
} from "./commun.jsx";

export default function Explorer() {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  const [texte, setTexte] = useState("");
  useTitre("Explorer les séries · Orci");
  useVue(c?.premium?.id);

  if (charge && !c) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const { series, premium } = c;
  const jeton = jetonPremium(premium);
  const genres = genresDe(series);
  const demande = new URLSearchParams(window.location.search).get("genre");
  const genre = genres.includes(demande) ? demande : null;
  const q = normaliser(texte);
  const trouvees = series
    .filter((s) => !genre || s.genre === genre)
    .filter((s) => !q || normaliser(`${s.titre} ${s.synopsis ?? ""} ${s.genre ?? ""}`).includes(q));
  const n = trouvees.length;

  const choisir = (g) => naviguer(g ? `/explorer?genre=${encodeURIComponent(g)}` : "/explorer", { remplacer: true });

  return (
    <Coquille actif="/explorer" premium={premium} jeton={jeton}>
      <section className="intro">
        <h1 className="intro-titre">Explorer</h1>
        <p className="intro-texte">Trouve ta prochaine série.</p>
      </section>

      <label className="champ-recherche">
        <Icone nom="loupe" taille={20} />
        <input
          type="search"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Titre, genre ou personnage"
          aria-label="Rechercher une série"
          enterKeyHint="search"
        />
      </label>

      {genres.length ? <PucesGenres genres={genres} actif={genre} onChoix={choisir} /> : null}

      <section className="bloc" aria-live="polite">
        <p className="compte">
          {n} série{n > 1 ? "s" : ""}
        </p>
        {n ? (
          <GrilleAffiches series={trouvees} />
        ) : (
          <p className="vide">{series.length ? "Aucune série ne correspond. Essaie un autre mot ou un autre genre." : "Les premières séries arrivent très bientôt."}</p>
        )}
      </section>

      <APropos formateur={c.formateur} />
    </Coquille>
  );
}
