// Le lecteur plein écran : la vidéo occupe l'écran, les commandes flottent
// par-dessus, un geste vers le haut passe à la partie suivante (vers le bas, la
// précédente). Une partie Premium affiche le passe à la place de la vidéo.
//
// La position est retenue toutes les quelques secondes : l'accueil propose de
// reprendre, et la partie redémarre là où on l'avait laissée.

import { useCallback, useEffect, useRef, useState } from "react";
import { lienWhatsApp } from "../../lib/format.js";
import { Lien, naviguer } from "../../lib/routeur.jsx";
import { sessionActuelle } from "../../lib/supa.js";
import { comptesActifs, useCompte, useRetourGoogle } from "../../lib/compte.js";
import { lireBienvenue, positionLecture, retenirPartie, retenirPosition } from "../../lib/visiteur.js";
import { Bouton, Copier, Icone, LienBouton, Message, useDonnees, useTitre } from "../../ui.jsx";
import Introuvable from "../Introuvable.jsx";
import { PorteCompte } from "./Compte.jsx";
import { BoutonPremium, chargerCatalogue, ErreurChargement, lireSource, PageChargement, prixPremium, temps, useJetonPremium, useVue } from "./commun.jsx";

export default function PageLecteur({ slug, numero }) {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  const serie = c?.series.find((s) => s.slug === slug) ?? null;
  const partie = serie?.parties.find((p) => p.numero === numero) ?? null;
  useTitre(serie ? `${serie.titre}, partie ${numero} · Orci` : "Orci");
  useVue(c?.premium?.id);
  const jeton = useJetonPremium(c?.premium);

  // Plein écran : la page derrière ne défile plus.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);

  if (charge && !c) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;
  if (!serie) return <Introuvable texte="Cette série n'est pas en ligne." />;

  const premium = c.premium;
  const contact = c.formateur?.whatsapp
    ? lienWhatsApp(c.formateur.whatsapp, `Bonjour, j'ai payé le Premium mais je n'ai plus mon lien d'accès pour « ${serie.titre} ».`)
    : null;
  return <Lecteur serie={serie} partie={partie} demandee={numero} premium={premium} jeton={jeton} contact={contact} />;
}

function Lecteur({ serie, partie, demandee, premium, jeton, contact }) {
  const parties = serie.parties;
  const total = parties.length;
  const index = partie ? parties.indexOf(partie) : -1;
  const precedente = index > 0 ? parties[index - 1] : null;
  const suivante = index >= 0 && index < total - 1 ? parties[index + 1] : null;
  const ouverte = (p) => p.gratuit || Boolean(jeton);
  const ici = `/s/${serie.slug}/${demandee}`;
  const compte = useCompte();
  const retour = useRetourGoogle();
  // Regarder demande un compte (gratuit). Le propriétaire connecté à son studio passe.
  const porte = comptesActifs() && !compte && !sessionActuelle();

  const [etat, setEtat] = useState({ statut: "charge" });
  const [essai, setEssai] = useState(0);
  const [lecture, setLecture] = useState({ pause: true, t: 0, d: 0, attente: false });
  const [muet, setMuet] = useState(false);
  const [termine, setTermine] = useState(false);
  const [feuille, setFeuille] = useState(false);
  const [bienvenue, setBienvenue] = useState(lireBienvenue);
  const video = useRef(null);
  const cadre = useRef(null);
  const sources = useRef(new Map());
  const relances = useRef(0);
  const sauve = useRef(0);
  const toucher = useRef(null);

  const aller = useCallback(
    (p) => {
      if (p) naviguer(`/s/${serie.slug}/${p.numero}`, { remplacer: true });
    },
    [serie.slug],
  );

  useEffect(() => {
    relances.current = 0;
  }, [partie?.numero]);

  // La vidéo de la partie choisie.
  useEffect(() => {
    setTermine(false);
    setLecture({ pause: true, t: 0, d: 0, attente: false });
    if (!partie) {
      setEtat({ statut: "absente" });
      return undefined;
    }
    if (porte || retour.enCours) {
      setEtat({ statut: "compte" });
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
  }, [serie.slug, partie?.numero, jeton, essai, porte, retour.enCours]);

  // La partie suivante est préparée pendant qu'on regarde : elle démarre sans attendre.
  useEffect(() => {
    if (etat.statut !== "pret" || !suivante || !ouverte(suivante) || sources.current.has(suivante.numero)) return;
    lireSource(serie.slug, suivante.numero, jeton, { prechargement: true })
      .then((r) => {
        if (r && !r.verrou) sources.current.set(suivante.numero, r);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat.statut, suivante?.numero]);

  // React ne suit pas l'attribut « muted » après le premier affichage.
  useEffect(() => {
    if (video.current) video.current.muted = muet;
  }, [muet, etat.src]);

  function basculer() {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function chercher(t) {
    const v = video.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(0, t), v.duration - 0.2);
  }

  function pleinEcran() {
    const el = cadre.current;
    const v = video.current;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      return;
    }
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    else v?.webkitEnterFullscreen?.();
  }

  function surMeta() {
    const v = video.current;
    if (!v || !partie) return;
    const pos = positionLecture(serie.slug);
    if (pos && pos.numero === partie.numero && pos.t > 3 && pos.t < (v.duration || pos.d) - 5) v.currentTime = pos.t;
    setLecture((l) => ({ ...l, d: v.duration || 0 }));
  }

  function surTemps() {
    const v = video.current;
    if (!v || !partie) return;
    setLecture((l) => ({ ...l, t: v.currentTime, d: v.duration || l.d }));
    if (Date.now() - sauve.current > 4000) {
      sauve.current = Date.now();
      retenirPosition(serie.slug, partie.numero, v.currentTime, v.duration);
    }
  }

  function surFin() {
    if (suivante) {
      retenirPosition(serie.slug, suivante.numero, 0, 0);
      aller(suivante);
    } else {
      retenirPosition(serie.slug, partie.numero, lecture.d, lecture.d);
      setTermine(true);
    }
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

  // Clavier, sur ordinateur : espace, flèches.
  useEffect(() => {
    const f = (e) => {
      if (e.target.closest?.("input:not([type=range]), textarea, select")) return;
      if (e.key === "Escape" && feuille) setFeuille(false);
      else if (e.key === " " || e.key === "k") {
        e.preventDefault();
        basculer();
      } else if (e.key === "ArrowRight") chercher((video.current?.currentTime ?? 0) + 5);
      else if (e.key === "ArrowLeft") chercher((video.current?.currentTime ?? 0) - 5);
      else if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        aller(suivante);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        aller(precedente);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suivante, precedente, feuille, aller]);

  const fichier = etat.statut === "pret" && etat.type === "fichier";
  const youtube = etat.statut === "pret" && etat.type === "youtube";
  const avance = lecture.d ? `${Math.min(100, (100 * lecture.t) / lecture.d)}%` : "0%";

  return (
    <div
      className="lecteur-plein"
      onTouchStart={(e) => {
        if (e.target.closest(".lecteur-bas, .lecteur-haut, .feuille, .verrou, .porte, .lecteur-bienvenue, a, button, input")) {
          toucher.current = null;
          return;
        }
        const t = e.touches[0];
        toucher.current = { x: t.clientX, y: t.clientY, quand: Date.now() };
      }}
      onTouchEnd={(e) => {
        const d = toucher.current;
        toucher.current = null;
        if (!d) return;
        const t = e.changedTouches[0];
        const dy = t.clientY - d.y;
        const dx = t.clientX - d.x;
        if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.5 && Date.now() - d.quand < 800) aller(dy < 0 ? suivante : precedente);
      }}
    >
      <div className="lecteur-cadre" ref={cadre}>
        {fichier ? (
          <video
            ref={video}
            className="lecteur-video"
            src={etat.src}
            poster={serie.pochette_url || undefined}
            playsInline
            autoPlay
            preload="auto"
            controlsList="nodownload noplaybackrate"
            disableRemotePlayback
            onClick={basculer}
            onContextMenu={(e) => e.preventDefault()}
            onLoadedMetadata={surMeta}
            onTimeUpdate={surTemps}
            onPlay={() => setLecture((l) => ({ ...l, pause: false }))}
            onPause={() => setLecture((l) => ({ ...l, pause: true }))}
            onWaiting={() => setLecture((l) => ({ ...l, attente: true }))}
            onPlaying={() => setLecture((l) => ({ ...l, attente: false }))}
            onCanPlay={() => setLecture((l) => ({ ...l, attente: false }))}
            onEnded={surFin}
            onError={panne}
          />
        ) : youtube ? (
          <iframe
            className="lecteur-video"
            src={etat.src}
            title={`${serie.titre}, partie ${demandee}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="lecteur-pochette">
            {serie.pochette_url ? <img src={serie.pochette_url} alt="" /> : null}
            <div className={`lecteur-voile ${etat.statut === "verrou" || etat.statut === "compte" ? "lecteur-voile-fort" : ""} ${etat.statut === "compte" ? "lecteur-voile-porte" : ""}`}>
              {etat.statut === "charge" ? (
                <>
                  <span className="roue roue-grande" aria-hidden="true" />
                  <p className="lecteur-voile-texte">Chargement de la partie {demandee}…</p>
                </>
              ) : null}
              {etat.statut === "compte" ? (
                <PorteCompte
                  titre="Connecte-toi pour regarder"
                  texte="C'est gratuit. Tu reprendras où tu t'es arrêté, sur n'importe quel téléphone."
                />
              ) : null}
              {etat.statut === "verrou" ? <Verrou raison={etat.raison} numero={demandee} premium={premium} ici={ici} contact={contact} /> : null}
              {etat.statut === "absente" ? (
                <>
                  <p className="lecteur-voile-titre">La partie {demandee} arrive très bientôt.</p>
                  <Lien className="bouton bouton-discret" href={`/s/${serie.slug}`}>
                    Voir les parties
                  </Lien>
                </>
              ) : null}
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
        )}

        {fichier && lecture.attente ? <span className="roue roue-grande lecteur-attente" aria-hidden="true" /> : null}
        {fichier && lecture.pause && !termine ? (
          <button type="button" className="lecteur-grand-jouer" onClick={basculer} aria-label="Lecture">
            <Icone nom="lecture" taille={38} />
          </button>
        ) : null}

        {termine ? (
          <div className="lecteur-voile lecteur-voile-fort">
            <p className="lecteur-voile-titre">Tu as tout vu !</p>
            <p className="lecteur-voile-texte">La suite de « {serie.titre} » arrive très bientôt.</p>
            <Lien className="bouton bouton-or" href="/explorer">
              Voir d'autres séries
            </Lien>
          </div>
        ) : null}

        <div className="lecteur-haut">
          <Lien className="rond rond-flou" href={`/s/${serie.slug}`} aria-label="Fermer le lecteur">
            <Icone nom="gauche" taille={20} />
          </Lien>
          {jeton ? (
            <span className="lecteur-etiquette">
              <Icone nom="etoile" taille={14} /> Premium
            </span>
          ) : null}
        </div>

        {bienvenue && jeton ? (
          <div className="lecteur-bienvenue">
            <Bienvenue jeton={jeton} onFermer={() => setBienvenue(false)} />
          </div>
        ) : null}

        <div className="lecteur-bas">
          <p className="lecteur-surtitre">
            Partie {demandee} / {total}
          </p>
          <Lien className="lecteur-titre" href={`/s/${serie.slug}`}>
            {serie.titre}
            {partie?.titre ? <span> · {partie.titre}</span> : null}
          </Lien>
          {fichier ? (
            <>
              <input
                type="range"
                className="lecteur-progression"
                min={0}
                max={lecture.d || 0}
                step={0.1}
                value={Math.min(lecture.t, lecture.d || 0)}
                onChange={(e) => chercher(Number(e.target.value))}
                aria-label="Position dans la partie"
                aria-valuetext={`${temps(lecture.t)} sur ${temps(lecture.d)}`}
                style={{ "--avance": avance }}
              />
              <div className="lecteur-commandes">
                <button type="button" className="rond rond-clair" onClick={basculer} aria-label={lecture.pause ? "Lecture" : "Pause"}>
                  <Icone nom={lecture.pause ? "lecture" : "pause"} taille={20} />
                </button>
                <span className="lecteur-temps">
                  {temps(lecture.t)} / {temps(lecture.d)}
                </span>
                <span className="espace" />
                <button type="button" className="rond" onClick={() => setMuet((m) => !m)} aria-label={muet ? "Remettre le son" : "Couper le son"}>
                  <Icone nom={muet ? "muet" : "son"} taille={20} />
                </button>
                <button type="button" className="rond" onClick={pleinEcran} aria-label="Plein écran">
                  <Icone nom="plein-ecran" taille={20} />
                </button>
              </div>
            </>
          ) : null}
          <div className="lecteur-pied">
            <button type="button" className="lecteur-parties" onClick={() => setFeuille(true)}>
              <Icone nom="grille" taille={18} /> Parties
            </button>
            <span className="espace" />
            <button type="button" className="rond" onClick={() => aller(precedente)} disabled={!precedente} aria-label="Partie précédente">
              <Icone nom="haut" taille={20} />
            </button>
            <button type="button" className="rond" onClick={() => aller(suivante)} disabled={!suivante} aria-label="Partie suivante">
              <Icone nom="bas" taille={20} />
            </button>
          </div>
        </div>
      </div>

      {feuille ? (
        <FeuilleParties
          serie={serie}
          actuelle={demandee}
          jeton={jeton}
          onChoix={(p) => {
            setFeuille(false);
            aller(p);
          }}
          onFermer={() => setFeuille(false)}
        />
      ) : null}
    </div>
  );
}

function Verrou({ raison, numero, premium, ici, contact }) {
  const expire = raison === "expire";
  return (
    <div className="verrou">
      <span className="verrou-icone">
        <Icone nom="cadenas" taille={24} />
      </span>
      <p className="lecteur-voile-titre">{expire ? "Ton passe Premium est terminé" : `La partie ${numero} est réservée au Premium`}</p>
      <p className="lecteur-voile-texte">{expire ? "Renouvelle-le pour voir la suite." : "Débloque la suite de toutes les séries, dès leur sortie."}</p>
      {premium ? (
        <BoutonPremium premium={premium} depuis={ici} className="bouton-large">
          {expire ? "Renouveler" : "Débloquer la suite"} · {prixPremium(premium)}
        </BoutonPremium>
      ) : (
        <p className="lecteur-voile-texte">Le Premium ouvre très bientôt.</p>
      )}
      <p className="verrou-petit">Mobile Money · Accès immédiat · Sans renouvellement automatique</p>
      {!expire ? (
        <p className="verrou-petit">
          Déjà Premium ? Ouvre le lien d'accès reçu après ton paiement
          {contact ? (
            <>
              {" "}ou{" "}
              <a href={contact} target="_blank" rel="noopener noreferrer">
                demande-le
              </a>
            </>
          ) : null}
          .
        </p>
      ) : null}
    </div>
  );
}

function FeuilleParties({ serie, actuelle, jeton, onChoix, onFermer }) {
  const n = serie.parties.length;
  return (
    <div className="feuille-fond" onClick={onFermer}>
      <section className="feuille" role="dialog" aria-modal="true" aria-label="Parties" onClick={(e) => e.stopPropagation()}>
        <div className="feuille-tete">
          <div>
            <h2>Parties</h2>
            <p className="feuille-sous-titre">
              {serie.titre} · {n} partie{n > 1 ? "s" : ""}
            </p>
          </div>
          <button type="button" className="rond" onClick={onFermer} aria-label="Fermer la liste des parties" autoFocus>
            <Icone nom="croix" taille={18} />
          </button>
        </div>
        <ol className="grille-parties">
          {serie.parties.map((p) => {
            const ouverte = p.gratuit || Boolean(jeton);
            const ici = p.numero === actuelle;
            return (
              <li key={p.numero}>
                <button
                  type="button"
                  className={`tuile-partie ${ouverte ? "" : "fermee"} ${ici ? "en-cours" : ""}`}
                  aria-current={ici ? "true" : undefined}
                  aria-label={`Partie ${p.numero}${ouverte ? "" : ", réservée au Premium"}`}
                  onClick={() => onChoix(p)}
                >
                  {p.numero}
                  {ouverte ? null : <Icone nom="cadenas" taille={12} className="tuile-cadenas" />}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Bienvenue({ jeton, onFermer }) {
  const lien = `${window.location.origin}/acces/${jeton}`;
  return (
    <Message
      type="succes"
      titre="Bienvenue dans Premium !"
      action={
        <div className="rangee">
          <Copier texte={lien}>Copier mon lien</Copier>
          <LienBouton variante="discret" icone="envoi" href={lienWhatsApp("", `Mon accès Premium Orci : ${lien}`)} target="_blank" rel="noopener noreferrer">
            Me l'envoyer sur WhatsApp
          </LienBouton>
          <Bouton variante="discret" onClick={onFermer}>
            Fermer
          </Bouton>
        </div>
      }
    >
      Toutes les suites sont ouvertes. Garde ton lien d'accès : c'est ta clé Premium sur n'importe quel téléphone.
    </Message>
  );
}
