// Ce que partagent les pages des mini-séries : le catalogue, l'habillage de
// l'appli (menu à gauche sur ordinateur, barre en bas sur téléphone) et les
// cartes d'affiche.
//
// Le catalogue ne dit jamais où sont les vidéos : la fonction `acces` les rend
// une par une, en lien signé qui expire au bout de quatre heures.

import { useCallback, useEffect, useRef, useState } from "react";
import { fcfa, lienWhatsApp } from "../../lib/format.js";
import { Lien } from "../../lib/routeur.jsx";
import { fonction, rpc } from "../../lib/supa.js";
import { comptesActifs, initiales, useCompte } from "../../lib/compte.js";
import { accesConnu, idVisiteur, partieVue, positionLecture, retenirRetour, sourceVisite } from "../../lib/visiteur.js";
import { Bouton, Chargement, Icone, MarqueOrci, Message } from "../../ui.jsx";

// Chargé une fois : passer d'une page à l'autre ne redemande rien au serveur.
let catalogueEnCours = null;
export function chargerCatalogue() {
  if (!catalogueEnCours) {
    catalogueEnCours = rpc("catalogue")
      .then((c) => ({
        ...c,
        series: (Array.isArray(c?.series) ? c.series : []).map((s) => ({
          ...s,
          lectures: Number(s.lectures) || 0,
          parties: Array.isArray(s.parties) ? s.parties : [],
        })),
      }))
      .catch((e) => {
        catalogueEnCours = null;
        throw e;
      });
  }
  return catalogueEnCours;
}

/**
 * La vidéo d'une partie. La session est jointe si elle existe : le propriétaire
 * voit ses parties Premium sans abonnement. Une partie préparée en avance ne
 * compte pas comme une lecture.
 */
export function lireSource(slug, numero, jeton, { prechargement = false } = {}) {
  return fonction(
    "acces",
    { action: "episode", serie: slug, numero, jeton: jeton || undefined, prechargement: prechargement || undefined },
    { session: true },
  );
}

/** Les visites comptent pour l'offre Premium dans le tableau de bord. */
export function useVue(offreId) {
  useEffect(() => {
    if (!offreId) return;
    rpc("enregistrer_vue", { p_offre: offreId, p_visiteur: idVisiteur(), p_source: sourceVisite() }).catch(() => {});
  }, [offreId]);
}

export function jetonPremium(premium) {
  return premium ? accesConnu(premium.slug) : null;
}

/** Le lien d'accès Premium, relu quand il arrive (paiement, connexion au compte). */
export function useJetonPremium(premium) {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener("orci-acces", f);
    return () => window.removeEventListener("orci-acces", f);
  }, []);
  return jetonPremium(premium);
}

/** « 1 000 FCFA / mois », d'un seul tenant : un bouton ne le coupe jamais en deux. */
export function prixPremium(premium) {
  return `${fcfa(premium.prix)}${premium.facturation === "mensuel" ? " / mois" : ""}`.replace(/ /g, " ");
}

export function joursPremium(premium) {
  return premium?.duree_jours ?? 30;
}

/** 94 → « 1:34 ». */
export function temps(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** La durée moyenne d'une partie : « 2 min par partie ». */
export function dureeMoyenne(parties) {
  const d = parties.map((p) => p.duree).filter((x) => Number.isFinite(x) && x > 0);
  if (!d.length) return null;
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  return m < 60 ? `${Math.round(m)} s` : `${Math.max(1, Math.round(m / 60))} min`;
}

export function normaliser(t) {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const ICONES_GENRE = {
  mystique: "lune",
  mystere: "lune",
  sorcellerie: "lune",
  horreur: "flamme",
  epouvante: "flamme",
  drame: "goutte",
  tragedie: "goutte",
  suspense: "horloge",
  thriller: "horloge",
  trahison: "alerte",
  jalousie: "alerte",
  vengeance: "eclair",
  revanche: "eclair",
  action: "eclair",
  famille: "personnes",
  comedie: "etoile",
  fantastique: "etoile",
};

export function iconeGenre(g) {
  return ICONES_GENRE[normaliser(g)] ?? "lecture";
}

export function genresDe(series) {
  return [...new Set(series.map((s) => s.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
}

export const derniere = (s) => s.parties[s.parties.length - 1] ?? null;
export const recente = (s) => Boolean(s.nouveaute) && Date.now() - new Date(s.nouveaute).getTime() < 4 * 86_400_000;

/** Les parties gratuites dites simplement : « Les 3 premières parties sont gratuites ». */
export function texteGratuites(parties) {
  const g = parties.filter((p) => p.gratuit).map((p) => p.numero);
  if (!g.length) return null;
  const debut = g.every((n, i) => n === parties[i]?.numero);
  if (debut) return g.length === 1 ? `La partie ${g[0]} est gratuite` : `Les ${g.length} premières parties sont gratuites`;
  return g.length === 1 ? `La partie ${g[0]} est gratuite` : `${g.length} parties gratuites`;
}

/** Les séries commencées sur ce téléphone, la plus récente d'abord. */
export function aReprendre(series) {
  return series
    .map((s) => {
      const pos = positionLecture(s.slug);
      const numero = pos?.numero ?? partieVue(s.slug);
      if (!numero || !s.parties.some((p) => p.numero === numero)) return null;
      const meme = pos?.numero === numero;
      return { serie: s, numero, t: meme ? pos.t : 0, d: meme ? pos.d : 0, maj: pos?.maj ?? 0 };
    })
    .filter(Boolean)
    .sort((a, b) => b.maj - a.maj)
    .slice(0, 8);
}

/** Le chemin du paiement Premium, en retenant la page où revenir ensuite. */
export function BoutonPremium({ premium, depuis, className = "", children }) {
  return (
    <Lien className={`bouton bouton-or ${className}`} href={`/o/${premium.slug}/paiement`} onClick={() => retenirRetour(premium.slug, depuis)}>
      {children}
    </Lien>
  );
}

export function PageChargement() {
  return (
    <div className="page page-centree">
      <Chargement />
    </div>
  );
}

export function ErreurChargement({ erreur, recharger }) {
  return (
    <div className="page page-etroite">
      <Message type="erreur" titre="La page n'a pas pu s'ouvrir." action={<Bouton variante="discret" onClick={() => recharger()}>Réessayer</Bouton>}>
        {erreur?.message ?? "Vérifie ta connexion, puis réessaie."}
      </Message>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'habillage de l'appli
// ---------------------------------------------------------------------------

// Le dernier onglet : « Profil » quand les comptes sont branchés, sinon « Mon accès ».
function menu() {
  return [
    ["/", "Accueil", "maison"],
    ["/explorer", "Explorer", "loupe"],
    ["/premium", "Premium", "ticket"],
    ["/ma-liste", "Ma liste", "signet"],
    comptesActifs() ? ["/profil", "Profil", "personne"] : ["/mon-acces", "Mon accès", "personne"],
  ];
}

/** L'icône d'un onglet ; celle du profil devient les initiales du spectateur connecté. */
function IconeMenu({ icone, compte }) {
  if (icone === "personne" && compte) {
    return (
      <span className="avatar-mini" aria-hidden="true">
        {initiales(compte)}
      </span>
    );
  }
  return <Icone nom={icone} taille={20} />;
}

function Logo() {
  return (
    <Lien href="/" className="logo" aria-label="Orci, accueil">
      <MarqueOrci className="logo-marque" />
      Orci
    </Lien>
  );
}

/**
 * Sur téléphone : un en-tête (logo, Premium) et une barre d'onglets en bas.
 * Sur ordinateur : un menu à gauche. `dock` et `entete` se coupent pour les
 * pages qui ont leur propre barre (la fiche d'une série).
 */
export function Coquille({ actif = null, premium, jeton, dock = true, entete = true, children }) {
  const compte = useCompte();
  const MENU = menu();
  return (
    <div className={`app ${dock ? "app-avec-dock" : ""}`}>
      <aside className="app-cote">
        <Logo />
        <nav className="app-menu" aria-label="Menu">
          {MENU.map(([href, texte, icone]) => (
            <Lien key={href} href={href} className={`app-menu-lien ${actif === href ? "actif" : ""}`} aria-current={actif === href ? "page" : undefined}>
              <IconeMenu icone={icone} compte={compte} />
              <span>{texte}</span>
            </Lien>
          ))}
        </nav>
        <EncartPremium premium={premium} jeton={jeton} />
      </aside>

      <div className="app-corps">
        {entete ? (
          <header className="app-entete">
            <Logo />
            {jeton ? (
              <Lien href={`/acces/${jeton}`} className="pastille-premium pastille-premium-actif">
                <Icone nom="etoile" taille={16} /> Premium
              </Lien>
            ) : (
              <Lien href="/premium" className="pastille-premium">
                <Icone nom="ticket" taille={18} /> Premium
              </Lien>
            )}
          </header>
        ) : null}
        <main className="app-contenu" id="contenu">
          {children}
        </main>
      </div>

      {dock ? (
        <nav className="app-dock" aria-label="Menu">
          {MENU.map(([href, texte, icone]) => (
            <Lien
              key={href}
              href={href}
              className={`app-dock-lien ${href === "/premium" ? "app-dock-premium" : ""} ${actif === href ? "actif" : ""}`}
              aria-current={actif === href ? "page" : undefined}
            >
              <span className="app-dock-icone">
                <IconeMenu icone={icone} compte={compte} />
              </span>
              <span>{texte}</span>
            </Lien>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function EncartPremium({ premium, jeton }) {
  if (jeton) {
    return (
      <Lien href={`/acces/${jeton}`} className="encart-premium encart-premium-actif">
        <Icone nom="etoile" taille={18} />
        <span>
          <strong>Premium actif</strong>
          <span>Voir mon accès</span>
        </span>
      </Lien>
    );
  }
  if (!premium) return null;
  return (
    <Lien href="/premium" className="encart-premium">
      <Icone nom="ticket" taille={18} />
      <span>
        <strong>Passe {joursPremium(premium)} jours</strong>
        <span>Toutes les suites · {fcfa(premium.prix)}</span>
      </span>
    </Lien>
  );
}

// ---------------------------------------------------------------------------
// Briques des pages
// ---------------------------------------------------------------------------

/** Les genres en pastilles : des liens vers Explorer, ou des filtres. */
export function PucesGenres({ genres, actif = null, onChoix = null }) {
  const classe = (g) => `filtre-genre ${actif === g ? "actif" : ""}`;
  return (
    <div className="filtres-genres" role="group" aria-label="Genres">
      {onChoix ? (
        <button type="button" className={classe(null)} aria-pressed={!actif} onClick={() => onChoix(null)}>
          {actif ? null : <Icone nom="coche" taille={15} />} Tout
        </button>
      ) : (
        <Lien href="/explorer" className={classe(null)}>
          <Icone nom="coche" taille={15} /> Tout
        </Lien>
      )}
      {genres.map((g) =>
        onChoix ? (
          <button key={g} type="button" className={classe(g)} aria-pressed={actif === g} onClick={() => onChoix(actif === g ? null : g)}>
            {actif === g ? <Icone nom="coche" taille={15} /> : <Icone nom={iconeGenre(g)} taille={15} />} {g}
          </button>
        ) : (
          <Lien key={g} href={`/explorer?genre=${encodeURIComponent(g)}`} className={classe(g)}>
            <Icone nom={iconeGenre(g)} taille={15} /> {g}
          </Lien>
        ),
      )}
    </div>
  );
}

/** « Reprendre la lecture » : la partie en cours, le temps déjà regardé. */
export function Reprendre({ items }) {
  return (
    <section className="bloc" aria-label="Reprendre la lecture">
      <h2 className="titre-bloc">Reprendre la lecture</h2>
      <ul className="reprendre-liste">
        {items.map(({ serie, numero, t, d }) => (
          <li key={serie.slug}>
            <Lien className="reprendre" href={`/s/${serie.slug}/${numero}`}>
              <span className="reprendre-image">{serie.pochette_url ? <img src={serie.pochette_url} alt="" loading="lazy" decoding="async" /> : null}</span>
              <span className="reprendre-corps">
                <span className="reprendre-titre">{serie.titre}</span>
                <span className="reprendre-meta">
                  Partie {numero} sur {serie.parties.length}
                </span>
                {d ? (
                  <>
                    <span className="reprendre-temps">
                      {temps(t)} / {temps(d)}
                    </span>
                    <span className="reprendre-barre">
                      <span style={{ width: `${Math.min(100, Math.round((100 * t) / d))}%` }} />
                    </span>
                  </>
                ) : null}
              </span>
              <span className="reprendre-jouer" aria-hidden="true">
                <Icone nom="lecture" taille={18} />
              </span>
            </Lien>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Une rangée d'affiches qui défile, avec des flèches sur ordinateur. `classee` ajoute les grands numéros du Top. */
export function Rangee({ titre, series, classee = false }) {
  const piste = useRef(null);
  const [bords, setBords] = useState({ debut: true, fin: true });
  const mesurer = useCallback(() => {
    const el = piste.current;
    if (!el) return;
    setBords({ debut: el.scrollLeft <= 4, fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = piste.current;
    mesurer();
    el?.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer);
    return () => {
      el?.removeEventListener("scroll", mesurer);
      window.removeEventListener("resize", mesurer);
    };
  }, [mesurer, series.length]);

  const defiler = (sens) => {
    const el = piste.current;
    if (el) el.scrollBy({ left: sens * Math.max(200, el.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <section className="bloc" aria-label={titre}>
      <div className="bloc-tete">
        <h2 className="titre-bloc">{titre}</h2>
        {bords.debut && bords.fin ? null : (
          <div className="fleches">
            <button type="button" className="rond" onClick={() => defiler(-1)} disabled={bords.debut} aria-label="Séries précédentes">
              <Icone nom="gauche" taille={18} />
            </button>
            <button type="button" className="rond" onClick={() => defiler(1)} disabled={bords.fin} aria-label="Séries suivantes">
              <Icone nom="droite" taille={18} />
            </button>
          </div>
        )}
      </div>
      <ul className={`piste ${classee ? "piste-classee" : ""}`} ref={piste}>
        {series.map((s, i) => (
          <li key={s.slug}>
            <CarteAffiche serie={s} rang={classee ? i + 1 : null} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GrilleAffiches({ series }) {
  return (
    <ul className="grille-affiches">
      {series.map((s) => (
        <li key={s.slug}>
          <CarteAffiche serie={s} />
        </li>
      ))}
    </ul>
  );
}

/** Une affiche : le titre posé en bas de la pochette, puis le genre et le nombre de parties. */
export function CarteAffiche({ serie, rang = null }) {
  const n = serie.parties.length;
  const pos = positionLecture(serie.slug);
  const der = derniere(serie);
  return (
    <Lien href={`/s/${serie.slug}`} className={`affiche ${rang ? "affiche-classee" : ""}`}>
      {rang ? (
        <span className="affiche-rang" aria-hidden="true">
          {rang}
        </span>
      ) : null}
      <span className="affiche-colonne">
        <span className="affiche-image">
          {serie.pochette_url ? (
            <img src={serie.pochette_url} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="affiche-vide">
              <Icone nom="lecture" taille={28} />
            </span>
          )}
          {recente(serie) && der ? <span className="affiche-badge">Partie {der.numero} dispo</span> : null}
          <span className="affiche-nom">{serie.titre}</span>
          {pos && n ? <span className="affiche-progression" style={{ "--avance": `${Math.min(100, Math.round((100 * pos.numero) / n))}%` }} /> : null}
        </span>
        <span className="affiche-infos">
          {serie.genre ? <span className="genre-pastille">{serie.genre}</span> : null}
          <span className="affiche-meta">{n ? `${n} partie${n > 1 ? "s" : ""}` : "Bientôt"}</span>
        </span>
      </span>
    </Lien>
  );
}

/** Le bloc de texte qui présente Orci, en bas des pages. */
export function APropos({ formateur }) {
  return (
    <section className="a-propos">
      <h2>Les mini-séries IA, en parties courtes</h2>
      <p>
        Orci publie des histoires africaines créées avec l'intelligence artificielle : mystère, trahison, vengeance, en parties de
        quelques minutes pensées pour ton téléphone. La partie 1 se regarde sur TikTok, la suite ici.
      </p>
      <p className="a-propos-pied">
        Paiement Mobile Money sécurisé · Accès immédiat
        {formateur?.whatsapp ? (
          <>
            {" · "}
            <a href={lienWhatsApp(formateur.whatsapp, "Bonjour, j'ai une question sur les séries Orci.")} target="_blank" rel="noopener noreferrer">
              Écrire à {formateur.nom}
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
