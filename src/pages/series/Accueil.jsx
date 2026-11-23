// L'accueil : où reprendre, le Top, le passe Premium, puis les rangées de
// séries (nouveautés, puis un genre par rangée).

import { fcfa } from "../../lib/format.js";
import { Lien } from "../../lib/routeur.jsx";
import { Icone, useDonnees, useTitre } from "../../ui.jsx";
import {
  APropos,
  aReprendre,
  BoutonPremium,
  chargerCatalogue,
  Coquille,
  ErreurChargement,
  genresDe,
  jetonPremium,
  joursPremium,
  PageChargement,
  PucesGenres,
  Rangee,
  Reprendre,
  useVue,
} from "./commun.jsx";

export default function Accueil() {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  useTitre("Orci · Mini-séries IA en français");
  useVue(c?.premium?.id);

  if (charge && !c) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const { series, premium } = c;
  const jeton = jetonPremium(premium);
  const genres = genresDe(series);
  const reprendre = aReprendre(series);
  // Le Top ne montre que des séries réellement lancées, la plus regardée d'abord.
  const top = series
    .filter((s) => s.lectures > 0)
    .sort((a, b) => b.lectures - a.lectures)
    .slice(0, 10);
  const parGenre = genres.map((g) => [g, series.filter((s) => s.genre === g)]).filter(([, l]) => l.length >= 2);

  return (
    <Coquille actif="/" premium={premium} jeton={jeton}>
      <section className="intro">
        <h1 className="intro-titre">Mini-séries IA en français</h1>
        <p className="intro-texte">Des histoires choc créées avec l'IA, en parties courtes. Tu as vu le début sur TikTok ? La suite est ici.</p>
        <Lien href="/explorer" className="intro-lien">
          <span>Tu cherches une série précise ?</span>
          <strong>
            Explorer <Icone nom="fleche" taille={16} />
          </strong>
        </Lien>
      </section>

      {genres.length >= 2 ? <PucesGenres genres={genres} /> : null}
      {reprendre.length ? <Reprendre items={reprendre} /> : null}
      {top.length >= 2 ? <Rangee titre={`Top ${top.length} sur Orci`} series={top} classee /> : null}
      {premium && !jeton && series.length ? <PanneauPasse premium={premium} /> : null}

      {series.length ? (
        <Rangee titre="Nouveautés" series={series.slice(0, 12)} />
      ) : (
        <section className="bloc">
          <p className="vide">Les premières séries arrivent très bientôt.</p>
        </section>
      )}
      {parGenre.map(([g, l]) => (
        <Rangee key={g} titre={g} series={l} />
      ))}

      <APropos formateur={c.formateur} />
    </Coquille>
  );
}

function PanneauPasse({ premium }) {
  const jours = joursPremium(premium);
  return (
    <section className="panneau-passe" aria-label="Passe Premium">
      <p className="panneau-passe-label">
        <Icone nom="ticket" taille={18} /> Passe {jours} jours
      </p>
      <h2>Toutes les suites, sans attendre.</h2>
      <p className="panneau-passe-prix">
        {fcfa(premium.prix)} pour {jours} jours
      </p>
      <p className="panneau-passe-note">Sans renouvellement automatique. Paie avec Mobile Money.</p>
      <BoutonPremium premium={premium} depuis="/" className="bouton-large">
        Activer le passe
      </BoutonPremium>
    </section>
  );
}
