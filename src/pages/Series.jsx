// Les mini-séries : l'accueil (la vitrine des séries) et la page d'une série,
// avec son lecteur vertical. Une partie gratuite se regarde librement ; la
// suite est réservée au Premium, payé en Mobile Money comme les autres offres.
//
// Le catalogue ne dit jamais où sont les vidéos : la fonction `acces` les rend
// une par une, en lien signé qui expire au bout de quatre heures.

import { useCallback, useEffect, useRef, useState } from "react";
import { depuis, fcfa, lienWhatsApp } from "../lib/format.js";
import { Lien, naviguer } from "../lib/routeur.jsx";
import { fonction, rpc, sessionActuelle } from "../lib/supa.js";
import { accesConnu, idVisiteur, lireBienvenue, partieVue, retenirPartie, retenirRetour, sourceVisite } from "../lib/visiteur.js";
import { Bouton, Chargement, Copier, Icone, LienBouton, Message, useDonnees, useTitre } from "../ui.jsx";
import Introuvable from "./Introuvable.jsx";

// Chargé une fois : passer de l'accueil à une série, puis d'une partie à
// l'autre, ne redemande rien au serveur.
let catalogueEnCours = null;
function chargerCatalogue() {
  if (!catalogueEnCours) {
    catalogueEnCours = rpc("catalogue")
      .then((c) => ({
        ...c,
        series: (Array.isArray(c?.series) ? c.series : []).map((s) => ({ ...s, parties: Array.isArray(s.parties) ? s.parties : [] })),
      }))
      .catch((e) => {
        catalogueEnCours = null;
        throw e;
      });
  }
  return catalogueEnCours;
}

function lireSource(slug, numero, jeton) {
  // La session est jointe si elle existe : le propriétaire voit ses parties
  // Premium sans abonnement.
  return fonction("acces", { action: "episode", serie: slug, numero, jeton: jeton || undefined }, { session: true });
}

/** Les visites comptent pour l'offre Premium dans le tableau de bord. */
function useVue(offreId) {
  useEffect(() => {
    if (!offreId) return;
    rpc("enregistrer_vue", { p_offre: offreId, p_visiteur: idVisiteur(), p_source: sourceVisite() }).catch(() => {});
  }, [offreId]);
}

function useMouvementReduit() {
  const [reduit] = useState(() => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  return reduit;
}

/** « 1 000 FCFA / mois », d'un seul tenant : le bouton ne le coupe jamais en deux. */
function prixPremium(premium) {
  return `${fcfa(premium.prix)}${premium.facturation === "mensuel" ? " / mois" : ""}`.replace(/ /g, " ");
}

function duree(s) {
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${String(r).padStart(2, "0")}` : `${m} min`;
}

function dureeLongue(s) {
  if (!s) return null;
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

function normaliser(t) {
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
  action: "eclair",
  famille: "personnes",
  comedie: "etoile",
  fantastique: "etoile",
};

function iconeGenre(g) {
  return ICONES_GENRE[normaliser(g)] ?? "lecture";
}

const derniere = (s) => s.parties[s.parties.length - 1] ?? null;
const recente = (s) => Boolean(s.nouveaute) && Date.now() - new Date(s.nouveaute).getTime() < 4 * 86_400_000;
const offerte = (s) => s.parties.some((p) => p.gratuit);

/** Le chemin du paiement Premium, en retenant la page où revenir ensuite. */
function BoutonPremium({ premium, depuis: retour, className = "", children }) {
  return (
    <Lien className={`bouton bouton-or ${className}`} href={`/o/${premium.slug}/paiement`} onClick={() => retenirRetour(premium.slug, retour)}>
      {children}
    </Lien>
  );
}

function ErreurChargement({ erreur, recharger }) {
  return (
    <div className="page page-etroite">
      <Message type="erreur" titre="La page n'a pas pu s'ouvrir." action={<Bouton variante="discret" onClick={() => recharger()}>Réessayer</Bouton>}>
        {erreur?.message ?? "Vérifie ta connexion, puis réessaie."}
      </Message>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'en-tête du site : logo, sections, recherche et statut Premium
// ---------------------------------------------------------------------------

function EnteteSite({ premium, jeton, recherche = "", onRecherche, liens = null, retour = false }) {
  const [ouverte, setOuverte] = useState(false);
  const champ = (mobile) => (
    <label className="site-recherche">
      <Icone nom="loupe" taille={18} />
      <input
        type="search"
        value={recherche}
        onChange={(e) => onRecherche(e.target.value)}
        placeholder="Rechercher une série"
        aria-label="Rechercher une série"
        enterKeyHint="search"
        autoFocus={mobile}
      />
    </label>
  );

  function allerA(e, cible) {
    e.preventDefault();
    if (cible) document.getElementById(cible)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <header className="site-entete">
      <div className="site-entete-ligne">
        {retour ? (
          <Lien href="/" className="site-retour" aria-label="Revenir aux séries">
            <Icone nom="retour" taille={20} />
          </Lien>
        ) : null}
        <Lien href="/" className="logo" aria-label="Orci, accueil">
          <span className="logo-marque" aria-hidden="true" />
          Orci
        </Lien>
        {liens ? (
          <nav className="site-nav" aria-label="Sections de l'accueil">
            {liens.map(([texte, cible]) => (
              <a key={texte} href={cible ? `#${cible}` : "/"} aria-current={cible ? undefined : "page"} onClick={(e) => allerA(e, cible)}>
                {texte}
              </a>
            ))}
          </nav>
        ) : null}
        <div className="site-actions">
          {onRecherche ? (
            <>
              <div className="site-recherche-large">{champ(false)}</div>
              <button
                type="button"
                className="site-loupe"
                aria-label={ouverte ? "Fermer la recherche" : "Rechercher une série"}
                aria-expanded={ouverte}
                onClick={() => {
                  if (ouverte) onRecherche("");
                  setOuverte(!ouverte);
                }}
              >
                <Icone nom={ouverte ? "croix" : "loupe"} taille={20} />
              </button>
            </>
          ) : null}
          {jeton ? (
            <Lien href={`/acces/${jeton}`} className="ser-statut" title="Mon accès Premium">
              <Icone nom="etoile" taille={16} /> Premium
            </Lien>
          ) : premium ? (
            <BoutonPremium premium={premium} depuis={window.location.pathname} className="bouton-petit">
              Premium
            </BoutonPremium>
          ) : null}
        </div>
      </div>
      {onRecherche && ouverte ? <div className="site-recherche-mobile">{champ(true)}</div> : null}
    </header>
  );
}

function PiedSeries({ formateur }) {
  const contact = formateur?.whatsapp ? lienWhatsApp(formateur.whatsapp, "Bonjour, j'ai une question sur les séries Orci.") : null;
  return (
    <footer className="ser-pied">
      <p>Paiement Mobile Money sécurisé · Accès immédiat</p>
      {contact ? (
        <a href={contact} target="_blank" rel="noopener noreferrer">
          Une question ? Écris à {formateur.nom}
        </a>
      ) : null}
    </footer>
  );
}

// ---------------------------------------------------------------------------
// L'accueil
// ---------------------------------------------------------------------------

export function Catalogue() {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  const [recherche, setRecherche] = useState("");
  const [genre, setGenre] = useState(null);
  const [vedette, setVedette] = useState(0);
  useTitre("Orci · Mini-séries IA");
  useVue(c?.premium?.id);

  if (charge && !c) return <div className="page page-centree"><Chargement /></div>;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const premium = c.premium;
  const jeton = premium ? accesConnu(premium.slug) : null;
  const series = c.series;
  const vedettes = series.slice(0, 5);
  const fond = vedettes[vedette]?.pochette_url ?? null;

  const q = normaliser(recherche);
  const trouvees = q ? series.filter((s) => normaliser(`${s.titre} ${s.synopsis ?? ""} ${s.genre ?? ""}`).includes(q)) : null;
  const genres = [...new Set(series.map((s) => s.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const choisies = genre ? series.filter((s) => s.genre === genre) : series;
  const offertes = choisies.filter(offerte);
  const rangeesGenre = genre ? [] : genres.map((g) => [g, series.filter((s) => s.genre === g)]).filter(([, l]) => l.length >= 3);
  const toutes = [...choisies].sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
  const suites = suitesAffichees(series);
  const vendre = Boolean(premium && !jeton && series.length);
  const liens = [
    ["Accueil", null],
    ["Nouveautés", "nouveautes"],
    ...(choisies.length > 4 ? [["Toutes les séries", "toutes"]] : []),
    ...(vendre ? [["Premium", "premium"]] : []),
  ];

  return (
    <div className="accueil">
      <div
        key={fond ?? "vide"}
        className={`accueil-fond ${fond ? "" : "accueil-fond-vide"}`}
        style={fond ? { backgroundImage: `url("${fond}")` } : undefined}
        aria-hidden="true"
      />
      <EnteteSite premium={premium} jeton={jeton} recherche={recherche} onRecherche={setRecherche} liens={series.length ? liens : null} />
      <main className="accueil-contenu">
        <h1 className="cache-visuel">Orci, les mini-séries IA</h1>
        {trouvees ? (
          <Resultats recherche={recherche} series={trouvees} />
        ) : (
          <>
            <div className={`accueil-une ${suites.items.length ? "" : "accueil-une-seule"}`}>
              <Heros series={vedettes} onVedette={setVedette} />
              {suites.items.length ? <Suites titre={suites.titre} items={suites.items} /> : null}
            </div>
            {genres.length >= 2 ? <Genres genres={genres} actif={genre} onChoix={setGenre} /> : null}
            {choisies.length ? <Rangee id="nouveautes" titre={genre ?? "Nouveautés"} series={choisies.slice(0, 12)} /> : null}
            {offertes.length >= 2 ? <Rangee id="offertes" titre="Partie 1 offerte" series={offertes} /> : null}
            {rangeesGenre.map(([g, l]) => (
              <Rangee key={g} titre={g} series={l} />
            ))}
            {choisies.length > 4 ? <GrilleSeries id="toutes" titre={genre ? `Tout le genre ${genre}` : "Toutes les séries"} series={toutes} /> : null}
            {vendre ? <BandeauPremium premium={premium} /> : null}
          </>
        )}
        <PiedSeries formateur={c.formateur} />
      </main>
    </div>
  );
}

/** « Reprendre » pour qui a déjà regardé, sinon les dernières parties sorties. */
function suitesAffichees(series) {
  const reprendre = series
    .filter((s) => s.parties.length && partieVue(s.slug))
    .map((s) => ({ serie: s, partie: s.parties.find((p) => p.numero === partieVue(s.slug)) ?? s.parties[0], type: "reprendre" }));
  if (reprendre.length) return { titre: "Reprendre", items: reprendre.slice(0, 4) };
  return {
    titre: "Nouvelles parties",
    items: series
      .filter((s) => s.parties.length)
      .slice(0, 4)
      .map((s) => ({ serie: s, partie: derniere(s), type: "nouvelle" })),
  };
}

function Heros({ series, onVedette }) {
  const [i, setI] = useState(0);
  const [pause, setPause] = useState(false);
  const reduit = useMouvementReduit();
  const depart = useRef(null);
  const n = series.length;

  useEffect(() => {
    onVedette?.(i);
  }, [i, onVedette]);

  useEffect(() => {
    if (n < 2 || pause || reduit) return undefined;
    const t = setTimeout(() => setI((x) => (x + 1) % n), 7000);
    return () => clearTimeout(t);
  }, [i, n, pause, reduit]);

  if (!n) {
    return (
      <section className="heros heros-vide">
        <div className="heros-texte">
          <p className="surtitre">Mini-séries IA</p>
          <h2 className="heros-titre">Les premières séries arrivent très bientôt.</h2>
          <p className="heros-synopsis">Tu as vu le début sur TikTok ? La suite sera ici, partie après partie.</p>
        </div>
      </section>
    );
  }

  const aller = (k) => setI(((k % n) + n) % n);
  return (
    <section
      className="heros"
      aria-roledescription="carrousel"
      aria-label="Séries à la une"
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
      onFocusCapture={() => setPause(true)}
      onBlurCapture={() => setPause(false)}
      onTouchStart={(e) => {
        depart.current = e.touches[0].clientX;
        setPause(true);
      }}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0].clientX;
        const dx = x - (depart.current ?? x);
        if (Math.abs(dx) > 45) aller(i + (dx < 0 ? 1 : -1));
        setPause(false);
      }}
    >
      {series.map((s, k) => (
        <DiapoHeros key={s.slug} serie={s} active={k === i} position={`${k + 1} sur ${n}`} />
      ))}
      {n > 1 ? (
        <div className="heros-points">
          {series.map((s, k) => (
            <button
              key={s.slug}
              type="button"
              className={k === i ? "actif" : ""}
              aria-label={`Afficher ${s.titre}`}
              aria-current={k === i ? "true" : undefined}
              onClick={() => aller(k)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DiapoHeros({ serie, active, position }) {
  const n = serie.parties.length;
  const vu = partieVue(serie.slug);
  const cible = serie.parties.find((p) => p.numero === vu) ?? serie.parties[0] ?? null;
  const total = serie.parties.reduce((t, p) => t + (p.duree || 0), 0);
  const der = derniere(serie);
  const focus = active ? undefined : -1;
  const lien = `/s/${serie.slug}${cible ? `/${cible.numero}` : ""}`;
  return (
    <article
      className={`heros-diapo ${active ? "active" : ""}`}
      aria-hidden={active ? undefined : "true"}
      aria-roledescription="diapositive"
      aria-label={position}
    >
      {serie.pochette_url ? <img className="heros-image" src={serie.pochette_url} alt="" /> : <span className="heros-image heros-image-vide" />}
      <span className="heros-voile" />
      <div className="heros-texte">
        <p className="heros-badges">
          {recente(serie) && der ? <span className="heros-badge heros-badge-or">Partie {der.numero} dispo</span> : null}
          {serie.genre ? (
            <span className="heros-badge">
              <Icone nom={iconeGenre(serie.genre)} taille={14} /> {serie.genre}
            </span>
          ) : null}
        </p>
        <h2 className="heros-titre">{serie.titre}</h2>
        <p className="heros-meta">
          <span>
            <Icone nom="lecture" taille={15} /> {n ? `${n} partie${n > 1 ? "s" : ""}` : "Bientôt"}
          </span>
          {total ? (
            <span>
              <Icone nom="horloge" taille={15} /> {dureeLongue(total)}
            </span>
          ) : null}
          {offerte(serie) ? (
            <span>
              <Icone nom="cadeau" taille={15} /> Partie 1 offerte
            </span>
          ) : null}
        </p>
        {serie.synopsis ? <p className="heros-synopsis">{serie.synopsis}</p> : null}
        <div className="heros-actions">
          {cible ? (
            <Lien className="bouton bouton-or" href={lien} tabIndex={focus}>
              <Icone nom="lecture" taille={18} />
              <span>{vu && cible.numero === vu ? `Reprendre la partie ${vu}` : "Regarder"}</span>
            </Lien>
          ) : null}
          <Lien className="bouton heros-secondaire" href={`/s/${serie.slug}`} tabIndex={focus}>
            Toutes les parties
          </Lien>
        </div>
      </div>
      {serie.pochette_url ? (
        <Lien className="heros-vitrine" href={lien} tabIndex={-1} aria-hidden="true">
          <img src={serie.pochette_url} alt="" />
          <span className="heros-jouer">
            <Icone nom="lecture" taille={30} />
          </span>
        </Lien>
      ) : null}
    </article>
  );
}

function Suites({ titre, items }) {
  return (
    <section className="suites" aria-label={titre}>
      <h2 className="suites-titre">{titre}</h2>
      <ul className="suites-liste">
        {items.map(({ serie, partie, type }) => (
          <li key={serie.slug}>
            <Lien className="suite" href={`/s/${serie.slug}/${partie.numero}`}>
              <span className="suite-vignette">
                {serie.pochette_url ? <img src={serie.pochette_url} alt="" loading="lazy" decoding="async" /> : null}
                <span className="suite-jouer" aria-hidden="true">
                  <Icone nom="lecture" taille={18} />
                </span>
              </span>
              <span className="suite-corps">
                <span className="suite-titre">{serie.titre}</span>
                <span className="suite-pastilles">
                  <span className="pastille-texte">Partie {partie.numero}</span>
                  {partie.gratuit ? <span className="pastille-texte pastille-or">Gratuite</span> : null}
                </span>
                <span className="suite-meta">
                  {type === "nouvelle" && serie.nouveaute ? `Sortie ${depuis(serie.nouveaute)}` : duree(partie.duree) ?? `${serie.parties.length} parties`}
                </span>
              </span>
            </Lien>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Genres({ genres, actif, onChoix }) {
  return (
    <section className="genres" aria-label="Choisir un genre">
      <p className="genres-titre">Par genre</p>
      <div className="genres-liste">
        <button type="button" className={`genre ${actif ? "" : "actif"}`} aria-pressed={!actif} onClick={() => onChoix(null)}>
          <Icone nom="lecture" taille={17} /> Tout
        </button>
        {genres.map((g) => (
          <button key={g} type="button" className={`genre ${actif === g ? "actif" : ""}`} aria-pressed={actif === g} onClick={() => onChoix(actif === g ? null : g)}>
            <Icone nom={iconeGenre(g)} taille={17} /> {g}
          </button>
        ))}
      </div>
    </section>
  );
}

function Rangee({ id, titre, series }) {
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
    <section className="rangee-series" id={id} aria-label={titre}>
      <div className="rangee-tete">
        <h2>{titre}</h2>
        {bords.debut && bords.fin ? null : (
          <div className="rangee-fleches">
            <button type="button" onClick={() => defiler(-1)} disabled={bords.debut} aria-label="Séries précédentes">
              <Icone nom="gauche" taille={18} />
            </button>
            <button type="button" onClick={() => defiler(1)} disabled={bords.fin} aria-label="Séries suivantes">
              <Icone nom="droite" taille={18} />
            </button>
          </div>
        )}
      </div>
      <ul className="rangee-piste" ref={piste}>
        {series.map((s) => (
          <li key={s.slug}>
            <CarteAffiche serie={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function GrilleSeries({ id, titre, series }) {
  return (
    <section className="rangee-series" id={id} aria-label={titre}>
      <div className="rangee-tete">
        <h2>{titre}</h2>
      </div>
      <ul className="grille-affiches">
        {series.map((s) => (
          <li key={s.slug}>
            <CarteAffiche serie={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Resultats({ recherche, series }) {
  const n = series.length;
  const mot = recherche.trim();
  return (
    <section className="rangee-series resultats" aria-live="polite">
      <div className="rangee-tete">
        <h2>{n ? `${n} série${n > 1 ? "s" : ""} pour « ${mot} »` : `Aucune série pour « ${mot} »`}</h2>
      </div>
      {n ? (
        <ul className="grille-affiches">
          {series.map((s) => (
            <li key={s.slug}>
              <CarteAffiche serie={s} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide">Essaie un autre mot : un titre, un personnage, un genre.</p>
      )}
    </section>
  );
}

function CarteAffiche({ serie }) {
  const n = serie.parties.length;
  const vu = partieVue(serie.slug);
  const der = derniere(serie);
  return (
    <Lien href={`/s/${serie.slug}`} className="affiche">
      <span className="affiche-image">
        {serie.pochette_url ? (
          <img src={serie.pochette_url} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="affiche-vide">
            <Icone nom="lecture" taille={28} />
          </span>
        )}
        {recente(serie) && der ? (
          <span className="affiche-badge">Partie {der.numero} dispo</span>
        ) : offerte(serie) ? (
          <span className="affiche-badge affiche-badge-doux">Partie 1 offerte</span>
        ) : null}
        <span className="affiche-jouer" aria-hidden="true">
          <Icone nom="lecture" taille={22} />
        </span>
        {vu && n ? <span className="affiche-progression" style={{ "--avance": `${Math.min(100, Math.round((100 * vu) / n))}%` }} /> : null}
      </span>
      <span className="affiche-meta">
        <Icone nom="lecture" taille={13} />
        {n ? `${n} partie${n > 1 ? "s" : ""}` : "Bientôt"}
        {serie.genre ? ` · ${serie.genre}` : ""}
      </span>
      <span className="affiche-titre">{serie.titre}</span>
    </Lien>
  );
}

function BandeauPremium({ premium }) {
  return (
    <section className="bandeau-premium" id="premium" aria-label="Premium">
      <div>
        <p className="surtitre">Premium</p>
        <h2>Toutes les suites, dès leur sortie.</h2>
        <p className="texte-doux">
          Un paiement Mobile Money, et chaque partie de chaque série s'ouvre pendant {premium.duree_jours ?? 30} jours.
        </p>
      </div>
      <div className="bandeau-premium-action">
        <p className="bandeau-premium-prix">{prixPremium(premium)}</p>
        <BoutonPremium premium={premium} depuis="/" className="bouton-large">
          Devenir Premium
        </BoutonPremium>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Une série
// ---------------------------------------------------------------------------

function OffrePremium({ premium, depuis: retour }) {
  return (
    <section className="ser-offre" aria-label="Premium">
      <p className="surtitre">Premium</p>
      <p className="ser-offre-prix">{prixPremium(premium)}</p>
      <ul className="ser-offre-liste">
        <li><Icone nom="coche" taille={18} /> La suite de toutes les séries</li>
        <li><Icone nom="coche" taille={18} /> Chaque nouvelle partie dès sa sortie</li>
        <li><Icone nom="coche" taille={18} /> Paiement Mobile Money, accès immédiat</li>
      </ul>
      <BoutonPremium premium={premium} depuis={retour} className="bouton-large">
        Devenir Premium
      </BoutonPremium>
    </section>
  );
}

export function Serie({ slug, numero }) {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  const serie = c?.series?.find((s) => s.slug === slug) ?? null;
  const partie = serie && numero ? serie.parties.find((p) => p.numero === numero) ?? null : null;
  useTitre(serie ? `${partie ? `Partie ${partie.numero} · ` : ""}${serie.titre} · Orci` : "Orci");
  useVue(c?.premium?.id);
  const [bienvenue, setBienvenue] = useState(lireBienvenue);

  if (charge && !c) return <div className="page page-centree"><Chargement /></div>;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;
  if (!serie) return <Introuvable texte="Cette série n'est pas en ligne." />;

  const premium = c.premium;
  const jeton = premium ? accesConnu(premium.slug) : null;
  const ici = window.location.pathname;
  const contact = c.formateur?.whatsapp
    ? lienWhatsApp(c.formateur.whatsapp, `Bonjour, j'ai payé le Premium mais je n'ai plus mon lien d'accès pour « ${serie.titre} ».`)
    : null;

  return (
    <div className="ser-page">
      <EnteteSite premium={premium} jeton={jeton} retour />
      <div className="ecran ser">
        {bienvenue && jeton ? <Bienvenue jeton={jeton} onFermer={() => setBienvenue(false)} /> : null}
        <div className="ser-mise">
          <Lecteur serie={serie} partie={partie} demandee={numero} premium={premium} jeton={jeton} ici={ici} contact={contact} />
          <div className="ser-infos">
            {serie.genre ? (
              <p className="ser-genre">
                <Icone nom={iconeGenre(serie.genre)} taille={15} /> {serie.genre}
              </p>
            ) : null}
            <h1 className="ser-titre">{serie.titre}</h1>
            {serie.synopsis ? <p className="ser-synopsis">{serie.synopsis}</p> : null}
            <ListeParties serie={serie} actuelle={partie?.numero ?? null} jeton={jeton} />
            {premium && !jeton ? <OffrePremium premium={premium} depuis={ici} /> : null}
          </div>
        </div>
        <PiedSeries formateur={c.formateur} />
      </div>
    </div>
  );
}

function Bienvenue({ jeton, onFermer }) {
  const lien = `${window.location.origin}/acces/${jeton}`;
  return (
    <div className="ser-bienvenue">
      <Message
        type="succes"
        titre="Bienvenue dans Premium !"
        action={
          <div className="rangee">
            <Copier texte={lien}>Copier mon lien</Copier>
            <LienBouton variante="discret" icone="envoi" href={lienWhatsApp("", `Mon accès Premium Orci : ${lien}`)} target="_blank" rel="noopener noreferrer">
              Me l'envoyer sur WhatsApp
            </LienBouton>
            <Bouton variante="discret" onClick={onFermer}>Fermer</Bouton>
          </div>
        }
      >
        Toutes les suites sont ouvertes. Garde ton lien d'accès : c'est ta clé Premium sur n'importe quel téléphone.
      </Message>
    </div>
  );
}

function Lecteur({ serie, partie, demandee, premium, jeton, ici, contact }) {
  const parties = serie.parties;
  const [etat, setEtat] = useState({ statut: "repos" });
  const [essai, setEssai] = useState(0);
  const [termine, setTermine] = useState(false);
  const sources = useRef(new Map());
  const relances = useRef(0);
  const suivante = partie ? parties.find((p) => p.numero > partie.numero) ?? null : null;
  const ouverte = (p) => p.gratuit || Boolean(jeton);

  useEffect(() => {
    relances.current = 0;
  }, [partie?.numero]);

  // La vidéo de la partie choisie.
  useEffect(() => {
    setTermine(false);
    if (!partie) {
      setEtat({ statut: "repos" });
      return undefined;
    }
    if (!ouverte(partie) && !sessionActuelle()) {
      setEtat({ statut: "verrou", raison: "premium" });
      return undefined;
    }
    const connue = sources.current.get(partie.numero);
    if (connue && (!connue.expire || connue.expire - Date.now() > 10 * 60_000)) {
      setEtat({ statut: "pret", ...connue });
      retenirPartie(serie.slug, partie.numero);
      return undefined;
    }
    let annule = false;
    setEtat({ statut: "charge" });
    lireSource(serie.slug, partie.numero, jeton)
      .then((r) => {
        if (annule) return;
        if (r?.verrou) {
          setEtat({ statut: "verrou", raison: r.verrou });
          return;
        }
        sources.current.set(partie.numero, r);
        setEtat({ statut: "pret", ...r });
        retenirPartie(serie.slug, partie.numero);
      })
      .catch((e) => {
        if (!annule) setEtat({ statut: "erreur", message: e.statut === 404 ? "Cette partie n'est plus en ligne." : e.message });
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie.slug, partie?.numero, jeton, essai]);

  // La partie suivante est préparée pendant qu'on regarde : elle démarre sans attendre.
  useEffect(() => {
    if (etat.statut !== "pret" || !suivante || !ouverte(suivante) || sources.current.has(suivante.numero)) return;
    lireSource(serie.slug, suivante.numero, jeton)
      .then((r) => {
        if (r && !r.verrou) sources.current.set(suivante.numero, r);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat.statut, suivante?.numero]);

  function fin() {
    if (suivante) naviguer(`/s/${serie.slug}/${suivante.numero}`);
    else setTermine(true);
  }

  // Un lien expiré (onglet resté ouvert des heures) : on en redemande un, une fois.
  function panne() {
    if (partie && relances.current < 1) {
      relances.current += 1;
      sources.current.delete(partie.numero);
      setEssai((n) => n + 1);
      return;
    }
    setEtat({ statut: "erreur", message: "La vidéo n'a pas pu se lire. Vérifie ta connexion." });
  }

  const reprise = partieVue(serie.slug);
  const cible = parties.find((p) => p.numero === reprise) ?? parties[0] ?? null;
  const deuxieme = parties[1] ?? null;

  let ecran;
  if (etat.statut === "pret" && etat.type === "fichier") {
    ecran = (
      <video
        className="lecteur-video"
        src={etat.src}
        poster={serie.pochette_url || undefined}
        controls
        playsInline
        autoPlay
        preload="auto"
        controlsList="nodownload noplaybackrate"
        onContextMenu={(e) => e.preventDefault()}
        onEnded={fin}
        onError={panne}
      />
    );
  } else if (etat.statut === "pret" && etat.type === "youtube") {
    ecran = (
      <iframe
        className="lecteur-video"
        src={etat.src}
        title={`${serie.titre}, partie ${partie?.numero}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    );
  } else {
    ecran = (
      <div className="lecteur-pochette">
        {serie.pochette_url ? <img src={serie.pochette_url} alt="" /> : null}
        <div className={`lecteur-voile ${etat.statut === "verrou" ? "lecteur-voile-fort" : ""}`}>
          {etat.statut === "charge" ? <span className="roue roue-grande" role="status" aria-label="Chargement de la vidéo" /> : null}

          {etat.statut === "repos" ? (
            demandee && !partie ? (
              <>
                <p className="lecteur-voile-titre">La partie {demandee} arrive très bientôt.</p>
                {cible ? <Lien className="bouton bouton-discret" href={`/s/${serie.slug}/${cible.numero}`}>Regarder la partie {cible.numero}</Lien> : null}
              </>
            ) : cible ? (
              <>
                <Lien className="lecteur-jouer" href={`/s/${serie.slug}/${cible.numero}`} aria-label={`Regarder la partie ${cible.numero}`}>
                  <Icone nom="lecture" taille={34} />
                </Lien>
                <p className="lecteur-voile-titre">{cible.numero === reprise ? `Reprendre la partie ${cible.numero}` : `Regarder la partie ${cible.numero}`}</p>
                {cible === parties[0] && deuxieme ? (
                  <Lien className="lecteur-saut" href={`/s/${serie.slug}/${deuxieme.numero}`}>
                    Déjà vu la partie {cible.numero} sur TikTok ? Passe à la suite
                  </Lien>
                ) : null}
              </>
            ) : (
              <p className="lecteur-voile-titre">Les parties arrivent très bientôt.</p>
            )
          ) : null}

          {etat.statut === "verrou" ? <Verrou raison={etat.raison} partie={partie} premium={premium} ici={ici} contact={contact} /> : null}

          {etat.statut === "erreur" ? (
            <>
              <p className="lecteur-voile-titre">{etat.message}</p>
              <Bouton
                variante="discret"
                icone="rafraichir"
                onClick={() => {
                  relances.current = 0;
                  if (partie) sources.current.delete(partie.numero);
                  setEssai((n) => n + 1);
                }}
              >
                Réessayer
              </Bouton>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="lecteur">
      <div className="lecteur-cadre">
        {ecran}
        {termine ? (
          <div className="lecteur-voile lecteur-voile-fort">
            <p className="lecteur-voile-titre">Tu as tout vu !</p>
            <p className="verrou-texte">La partie suivante arrive très bientôt.</p>
            <Lien className="bouton bouton-discret" href="/">Voir les autres séries</Lien>
          </div>
        ) : null}
      </div>
      <div className="lecteur-barre">
        <p className="lecteur-partie">
          {partie ? (partie.titre ? `Partie ${partie.numero} · ${partie.titre}` : `Partie ${partie.numero}`) : serie.titre}
        </p>
        {suivante ? (
          <Lien className="bouton bouton-discret bouton-petit" href={`/s/${serie.slug}/${suivante.numero}`}>
            <span>Partie {suivante.numero}</span>
            <Icone nom={ouverte(suivante) ? "fleche" : "cadenas"} taille={16} />
          </Lien>
        ) : null}
      </div>
    </div>
  );
}

function Verrou({ raison, partie, premium, ici, contact }) {
  const expire = raison === "expire";
  return (
    <div className="verrou">
      <span className="verrou-icone"><Icone nom="cadenas" taille={24} /></span>
      <p className="lecteur-voile-titre">{expire ? "Ton Premium est terminé" : `La partie ${partie?.numero} est réservée au Premium`}</p>
      <p className="verrou-texte">{expire ? "Renouvelle-le pour voir la suite." : "Débloque la suite de toutes les séries, dès leur sortie."}</p>
      {premium ? (
        <BoutonPremium premium={premium} depuis={ici} className="bouton-large">
          {expire ? "Renouveler" : "Débloquer la suite"} · {prixPremium(premium)}
        </BoutonPremium>
      ) : (
        <p className="verrou-texte">Le Premium ouvre très bientôt.</p>
      )}
      <p className="verrou-petit">Mobile Money · Accès immédiat</p>
      {!expire ? (
        <p className="verrou-petit">
          Déjà Premium ? Ouvre le lien d'accès reçu après ton paiement
          {contact ? (
            <>
              {" "}ou <a href={contact} target="_blank" rel="noopener noreferrer">demande-le</a>
            </>
          ) : null}
          .
        </p>
      ) : null}
    </div>
  );
}

function ListeParties({ serie, actuelle, jeton }) {
  const parties = serie.parties;
  if (!parties.length) return <p className="vide">Les parties arrivent très bientôt.</p>;
  return (
    <ol className="parties" aria-label="Parties">
      {parties.map((p) => {
        const ouverte = p.gratuit || Boolean(jeton);
        const etiquette = p.gratuit ? "Gratuite" : jeton ? null : "Premium";
        const meta = [duree(p.duree), etiquette].filter(Boolean).join(" · ");
        const ici = p.numero === actuelle;
        return (
          <li key={p.numero}>
            <Lien href={`/s/${serie.slug}/${p.numero}`} className={`partie ${ici ? "partie-actuelle" : ""}`} aria-current={ici ? "true" : undefined}>
              <span className="partie-num">{p.numero}</span>
              <span className="partie-corps">
                <span className="partie-nom">{p.titre || `Partie ${p.numero}`}</span>
                {meta ? <span className="partie-meta">{meta}</span> : null}
              </span>
              <Icone nom={ouverte ? "lecture" : "cadenas"} taille={18} className="partie-etat" />
            </Lien>
          </li>
        );
      })}
    </ol>
  );
}
