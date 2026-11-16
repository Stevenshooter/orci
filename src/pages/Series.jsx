// Les mini-séries : l'accueil (le catalogue) et la page d'une série, avec son
// lecteur vertical. Une partie gratuite se regarde librement ; la suite est
// réservée au Premium, payé en Mobile Money comme les autres offres.
//
// Le catalogue ne dit jamais où sont les vidéos : la fonction `acces` les rend
// une par une, en lien signé qui expire au bout de quatre heures.

import { useEffect, useRef, useState } from "react";
import { fcfa, lienWhatsApp } from "../lib/format.js";
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
    catalogueEnCours = rpc("catalogue").catch((e) => {
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

/** Le chemin du paiement Premium, en retenant la page où revenir ensuite. */
function BoutonPremium({ premium, depuis, className = "", children }) {
  return (
    <Lien className={`bouton bouton-or ${className}`} href={`/o/${premium.slug}/paiement`} onClick={() => retenirRetour(premium.slug, depuis)}>
      {children}
    </Lien>
  );
}

function Entete({ premium, jeton, retour = false }) {
  return (
    <header className="ser-entete">
      {retour ? (
        <Lien href="/" className="lien-discret ser-retour">
          <Icone nom="retour" taille={18} /> Séries
        </Lien>
      ) : (
        <Lien href="/" className="logo" aria-label="Orci, accueil">
          <span className="logo-marque" aria-hidden="true" />
          Orci
        </Lien>
      )}
      {jeton ? (
        <Lien href={`/acces/${jeton}`} className="ser-statut" title="Mon accès Premium">
          <Icone nom="etoile" taille={16} /> Premium
        </Lien>
      ) : premium ? (
        <BoutonPremium premium={premium} depuis={window.location.pathname} className="bouton-petit">
          Devenir Premium
        </BoutonPremium>
      ) : null}
    </header>
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

function OffrePremium({ premium, depuis }) {
  return (
    <section className="ser-offre" aria-label="Premium">
      <p className="surtitre">Premium</p>
      <p className="ser-offre-prix">{prixPremium(premium)}</p>
      <ul className="ser-offre-liste">
        <li><Icone nom="coche" taille={18} /> La suite de toutes les séries</li>
        <li><Icone nom="coche" taille={18} /> Chaque nouvelle partie dès sa sortie</li>
        <li><Icone nom="coche" taille={18} /> Paiement Mobile Money, accès immédiat</li>
      </ul>
      <BoutonPremium premium={premium} depuis={depuis} className="bouton-large">
        Devenir Premium
      </BoutonPremium>
    </section>
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
  useTitre("Orci · Mini-séries IA");
  useVue(c?.premium?.id);

  if (charge && !c) return <div className="page page-centree"><Chargement /></div>;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const premium = c.premium;
  const jeton = premium ? accesConnu(premium.slug) : null;
  const series = Array.isArray(c.series) ? c.series : [];

  return (
    <div className="ecran">
      <Entete premium={premium} jeton={jeton} />
      <section className="cat-intro">
        <p className="surtitre">Mini-séries IA</p>
        <h1>La suite de tes histoires, partie après partie.</h1>
        <p className="texte-doux">Tu as vu le début sur TikTok ? Retrouve ici toutes les parties.</p>
      </section>

      {series.length ? (
        <ul className="cat-grille">
          {series.map((s) => (
            <li key={s.slug}>
              <CarteSerie serie={s} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide">Les premières séries arrivent très bientôt.</p>
      )}

      {premium && !jeton && series.length ? <OffrePremium premium={premium} depuis="/" /> : null}
      <PiedSeries formateur={c.formateur} />
    </div>
  );
}

function CarteSerie({ serie }) {
  const parties = Array.isArray(serie.parties) ? serie.parties : [];
  const n = parties.length;
  const vue = partieVue(serie.slug);
  const derniere = parties[n - 1];
  const recente = serie.nouveaute && Date.now() - new Date(serie.nouveaute).getTime() < 4 * 86_400_000;
  return (
    <Lien href={`/s/${serie.slug}`} className="cat-carte">
      <span className="cat-pochette">
        {serie.pochette_url ? (
          <img src={serie.pochette_url} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="cat-pochette-vide"><Icone nom="lecture" taille={30} /></span>
        )}
        {recente && derniere ? <span className="cat-nouveau">Partie {derniere.numero} dispo</span> : null}
      </span>
      <h2 className="cat-titre">{serie.titre}</h2>
      <span className="cat-meta">
        {n ? `${n} partie${n > 1 ? "s" : ""}` : "Bientôt"}
        {vue ? ` · reprendre la partie ${vue}` : ""}
      </span>
    </Lien>
  );
}

// ---------------------------------------------------------------------------
// Une série
// ---------------------------------------------------------------------------

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
    <div className="ecran ser">
      <Entete premium={premium} jeton={jeton} retour />
      {bienvenue && jeton ? <Bienvenue jeton={jeton} onFermer={() => setBienvenue(false)} /> : null}
      <div className="ser-mise">
        <Lecteur serie={serie} partie={partie} demandee={numero} premium={premium} jeton={jeton} ici={ici} contact={contact} />
        <div className="ser-infos">
          <h1 className="ser-titre">{serie.titre}</h1>
          {serie.synopsis ? <p className="ser-synopsis">{serie.synopsis}</p> : null}
          <ListeParties serie={serie} actuelle={partie?.numero ?? null} jeton={jeton} />
          {premium && !jeton ? <OffrePremium premium={premium} depuis={ici} /> : null}
        </div>
      </div>
      <PiedSeries formateur={c.formateur} />
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
