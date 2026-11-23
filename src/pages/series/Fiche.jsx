// La fiche d'une série : l'affiche, le résumé, la grille des parties (un
// cadenas sur celles du Premium), des séries proches, et un bouton fixe en bas
// pour lancer ou reprendre la lecture.

import { useState } from "react";
import { Lien, naviguer } from "../../lib/routeur.jsx";
import { basculerListe, maListe, partieVue, positionLecture } from "../../lib/visiteur.js";
import { Icone, useDonnees, useTitre } from "../../ui.jsx";
import Introuvable from "../Introuvable.jsx";
import {
  chargerCatalogue,
  Coquille,
  dureeMoyenne,
  ErreurChargement,
  jetonPremium,
  PageChargement,
  Rangee,
  texteGratuites,
  useVue,
} from "./commun.jsx";

export default function Fiche({ slug }) {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  const serie = c?.series.find((s) => s.slug === slug) ?? null;
  useTitre(serie ? `${serie.titre} · mini-série IA · Orci` : "Orci");
  useVue(c?.premium?.id);
  const [dansListe, setDansListe] = useState(() => maListe().includes(slug));
  const [partage, setPartage] = useState(null);

  if (charge && !c) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;
  if (!serie) return <Introuvable texte="Cette série n'est pas en ligne." />;

  const premium = c.premium;
  const jeton = jetonPremium(premium);
  const parties = serie.parties;
  const n = parties.length;
  const moyenne = dureeMoyenne(parties);
  const gratuites = jeton ? null : texteGratuites(parties);
  const pos = positionLecture(slug);
  const reprise = parties.find((p) => p.numero === (pos?.numero ?? partieVue(slug))) ?? null;
  const premiere = parties[0] ?? null;
  const cible = reprise ?? premiere;
  const proches = c.series
    .filter((s) => s.slug !== slug)
    .sort((a, b) => Number(b.genre === serie.genre) - Number(a.genre === serie.genre))
    .slice(0, 10);

  function retour() {
    // Venu d'une autre page d'Orci : on y revient. Arrivé de TikTok : l'accueil.
    let interne = false;
    try {
      interne = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch {
      interne = false;
    }
    if (interne && window.history.length > 1) window.history.back();
    else naviguer("/");
  }

  async function partager() {
    const url = `${window.location.origin}/s/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: serie.titre, text: `« ${serie.titre} », la suite sur Orci`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setPartage("Lien copié");
    } catch (e) {
      if (e?.name !== "AbortError") setPartage("Copie ce lien : " + url);
    }
    setTimeout(() => setPartage(null), 2500);
  }

  return (
    <Coquille premium={premium} jeton={jeton} dock={false} entete={false}>
      <article className="fiche">
        {serie.pochette_url ? <div className="fiche-fond" style={{ backgroundImage: `url("${serie.pochette_url}")` }} aria-hidden="true" /> : null}

        <div className="fiche-barre">
          <button type="button" className="rond rond-flou" onClick={retour} aria-label="Retour">
            <Icone nom="gauche" taille={20} />
          </button>
          <div className="fiche-barre-droite">
            <button
              type="button"
              className={`rond rond-flou ${dansListe ? "actif" : ""}`}
              aria-pressed={dansListe}
              aria-label={dansListe ? "Retirer de ma liste" : "Ajouter à ma liste"}
              onClick={() => setDansListe(basculerListe(slug))}
            >
              <Icone nom="signet" taille={20} />
            </button>
            <button type="button" className="rond rond-flou" onClick={partager} aria-label="Partager la série">
              <Icone nom="partager" taille={20} />
            </button>
          </div>
        </div>
        {partage ? (
          <p className="fiche-toast" role="status">
            {partage}
          </p>
        ) : null}

        <div className="fiche-tete">
          <span className="fiche-affiche">{serie.pochette_url ? <img src={serie.pochette_url} alt={`Pochette de ${serie.titre}`} /> : <Icone nom="lecture" taille={30} />}</span>
          <div className="fiche-infos">
            <nav className="fil" aria-label="Fil d'Ariane">
              <Lien href="/">Accueil</Lien>
              <span aria-hidden="true"> / </span>
              <Lien href="/explorer">Séries</Lien>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{serie.titre}</span>
            </nav>
            {serie.genre ? (
              <p className="fiche-puces">
                <Lien className="genre-pastille" href={`/explorer?genre=${encodeURIComponent(serie.genre)}`}>
                  {serie.genre}
                </Lien>
              </p>
            ) : null}
            <h1 className="fiche-titre">{serie.titre}</h1>
            <p className="fiche-meta">
              <span>{n ? `${n} partie${n > 1 ? "s" : ""}` : "Bientôt"}</span>
              {moyenne ? <span>{moyenne} par partie</span> : null}
            </p>
          </div>
        </div>

        {serie.synopsis ? <p className="fiche-resume">{serie.synopsis}</p> : null}

        <section className="fiche-parties" aria-label="Parties">
          <div className="fiche-parties-tete">
            <h2 className="titre-bloc">Parties</h2>
            {gratuites ? <span className="fiche-gratuites">{gratuites}</span> : null}
          </div>
          {n ? (
            <ol className="grille-parties">
              {parties.map((p) => {
                const ouverte = p.gratuit || Boolean(jeton);
                const enCours = reprise?.numero === p.numero;
                return (
                  <li key={p.numero}>
                    <Lien
                      href={`/s/${slug}/${p.numero}`}
                      className={`tuile-partie ${ouverte ? "" : "fermee"} ${enCours ? "en-cours" : ""}`}
                      aria-label={`Partie ${p.numero}${p.titre ? `, ${p.titre}` : ""}${ouverte ? "" : ", réservée au Premium"}${enCours ? ", en cours" : ""}`}
                    >
                      {p.numero}
                      {ouverte ? null : <Icone nom="cadenas" taille={12} className="tuile-cadenas" />}
                    </Lien>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="vide">Les parties arrivent très bientôt.</p>
          )}
          {!jeton && parties.some((p) => !p.gratuit) ? <p className="fiche-note">Les parties avec un cadenas s'ouvrent avec le passe Premium.</p> : null}
        </section>

        {proches.length ? <Rangee titre="Tu aimeras aussi" series={proches} /> : null}
      </article>

      {cible ? (
        <div className="fiche-action">
          <Lien className="bouton bouton-or bouton-large" href={`/s/${slug}/${cible.numero}`}>
            <Icone nom="lecture" taille={18} />
            <span>{reprise && reprise !== premiere ? `Reprendre la partie ${reprise.numero}` : `Regarder la partie ${cible.numero}`}</span>
          </Lien>
        </div>
      ) : null}
    </Coquille>
  );
}
