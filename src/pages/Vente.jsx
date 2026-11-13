// La page de vente : une promesse, une vidéo, un bouton, puis tout ce qu'il faut
// pour décider. Fond noir violacé, éclats or et violet.
//
// Un mot de l'accroche passe en doré souligné : celui que le formateur entoure
// d'astérisques (« vidéos *professionnelles* »), sinon le mot le plus long.

import { useEffect, useRef, useState } from "react";
import { fcfa, lienWhatsApp, nombre } from "../lib/format.js";
import { Lien } from "../lib/routeur.jsx";
import { rpc } from "../lib/supa.js";
import { videoIntegree } from "../lib/video.js";
import { accesConnu, idVisiteur, sourceVisite } from "../lib/visiteur.js";
import { Chargement, Icone, ICONE_OUTIL, Message, MoyensPaiement, useDonnees, useTitre } from "../ui.jsx";
import Introuvable from "./Introuvable.jsx";

const PROMESSE = {
  drive: "Partagé sur ton adresse Gmail, à regarder quand tu veux.",
  meet: "Les invitations arrivent dans ton agenda Google.",
  telegram: "Ton lien d'entrée personnel, juste après le paiement.",
  whatsapp: "Pour poser tes questions et avancer avec les autres.",
  lien: "Ouvert dès le paiement.",
};

/** Le texte sans les astérisques qui marquent le mot doré. */
export function sansAccent(texte) {
  return String(texte ?? "").replace(/\*/g, "");
}

const LETTRES = /[^\p{L}\p{N}'’-]/gu;

/** Le texte, avec un mot doré souligné. */
function avecAccent(texte) {
  const t = String(texte ?? "");
  const morceaux = t.split(/\*([^*]+)\*/);
  if (morceaux.length > 1) {
    return morceaux.map((m, i) => (i % 2 ? <span className="v-accent" key={i}>{m}</span> : m));
  }
  const mots = t.split(/(\s+)/);
  let choisi = -1;
  let longueur = 5;
  mots.forEach((m, i) => {
    const l = m.replace(LETTRES, "").length;
    if (l > longueur) {
      choisi = i;
      longueur = l;
    }
  });
  if (choisi < 0) return t;
  const [, avant, coeur, apres] = mots[choisi].match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  return [
    mots.slice(0, choisi).join(""),
    avant,
    <span className="v-accent" key="accent">{coeur}</span>,
    apres,
    mots.slice(choisi + 1).join(""),
  ];
}

/** Les éléments .v-apparait glissent en place quand ils entrent à l'écran. */
function useApparition(racine, cle) {
  useEffect(() => {
    const el = racine.current;
    if (!el || !("IntersectionObserver" in window)) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    el.classList.add("v-anime");
    const o = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (e.isIntersecting) {
            e.target.classList.add("v-vu");
            o.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    el.querySelectorAll(".v-apparait").forEach((x) => o.observe(x));
    return () => o.disconnect();
  }, [racine, cle]);
}

function Media({ video, image, titre }) {
  const v = videoIntegree(video);
  if (v?.type === "youtube") {
    return (
      <div className="v-media v-media-video v-apparait">
        <iframe
          src={v.src}
          title={`Présentation : ${titre}`}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (v?.type === "fichier") {
    return (
      <div className="v-media v-media-video v-apparait">
        <video src={v.src} poster={image || undefined} controls playsInline preload="metadata" />
      </div>
    );
  }
  if (image) {
    return (
      <div className="v-media v-apparait">
        <img src={image} alt="" loading="eager" decoding="async" />
      </div>
    );
  }
  return null;
}

/** Les captures qui défilent toutes seules (et se parcourent au doigt si le mouvement est réduit). */
function Defile({ images }) {
  const serie = images.slice(0, 16);
  return (
    <div className="v-defile">
      <div className="v-defile-piste">
        {[...serie, ...serie].map((src, i) => (
          <img key={i} src={src} alt={i < serie.length ? `Preuve ${i + 1}` : ""} aria-hidden={i >= serie.length || undefined} loading="lazy" decoding="async" />
        ))}
      </div>
    </div>
  );
}

function Faq({ questions }) {
  const [ouverte, setOuverte] = useState(0);
  return (
    <div className="v-faq v-carte v-apparait">
      {questions.map((x, i) => {
        const id = `faq-${i}`;
        const ouvert = ouverte === i;
        return (
          <div className={`v-faq-item ${ouvert ? "ouvert" : ""}`} key={i}>
            <h3>
              <button type="button" className="v-faq-q" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuverte(ouvert ? -1 : i)}>
                <span>{x.q}</span>
                <span className="v-faq-chevron" aria-hidden="true"><Icone nom="chevron" taille={16} /></span>
              </button>
            </h3>
            <div className="v-faq-r" id={id} role="region" inert={!ouvert}>
              <div><p>{x.r}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Vente({ slug }) {
  const { donnees: offre, erreur, charge, recharger } = useDonnees(() => rpc("offre_publique", { p_slug: slug ?? null }), [slug]);
  const titre = sansAccent(offre?.titre);
  useTitre(offre ? `${titre} · ${offre.formateur?.nom ?? "Orci"}` : "Orci");

  useEffect(() => {
    if (!offre?.id) return;
    rpc("enregistrer_vue", { p_offre: offre.id, p_visiteur: idVisiteur(), p_source: sourceVisite() }).catch(() => {});
  }, [offre?.id]);

  const racine = useRef(null);
  useApparition(racine, offre?.id);

  const heros = useRef(null);
  const [barre, setBarre] = useState(false);
  useEffect(() => {
    const el = heros.current;
    if (!el || !("IntersectionObserver" in window)) return undefined;
    const o = new IntersectionObserver(([e]) => setBarre(!e.isIntersecting), { rootMargin: "0px 0px -40px 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, [offre?.id]);

  if (charge && !offre) return <div className="page page-centree"><Chargement /></div>;
  if (erreur) {
    return (
      <div className="page page-etroite">
        <Message type="erreur" titre="La page n'a pas pu s'ouvrir." action={<button className="bouton bouton-discret" onClick={() => recharger()}>Réessayer</button>}>
          {erreur.message}
        </Message>
      </div>
    );
  }
  if (!offre) return <Introuvable texte="Cette formation n'est pas en vente pour le moment." />;

  const paiement = `/o/${offre.slug}/paiement${window.location.search}`;
  const barreAffichee = offre.prix_barre && offre.prix_barre > offre.prix;
  const reduction = barreAffichee ? Math.round(100 - (100 * offre.prix) / offre.prix_barre) : 0;
  const jeton = accesConnu(offre.slug);
  const nom = offre.formateur?.nom ?? "le formateur";
  const whatsapp = offre.formateur?.whatsapp;
  const contact = whatsapp ? lienWhatsApp(whatsapp, `Bonjour, j'ai une question sur « ${titre} ».`) : null;
  const programme = Array.isArray(offre.programme) ? offre.programme : [];
  const bonus = Array.isArray(offre.bonus) ? offre.bonus : [];
  const infos = offre.infos || {};
  const preuves = Array.isArray(infos.preuves) ? infos.preuves.filter((x) => typeof x === "string" && x.startsWith("https://")) : [];
  const outils = Array.isArray(offre.outils) ? offre.outils : [];
  const avecGoogle = outils.some((o) => o.type === "drive" || o.type === "meet");
  const mensuel = offre.facturation === "mensuel";
  const acces = mensuel
    ? `${offre.duree_jours ?? 30} jours, renouvelés à chaque paiement`
    : offre.duree_jours
      ? `${offre.duree_jours} jours`
      : "à vie";
  const modalite = mensuel ? `par mois · accès ${acces}` : `paiement unique · accès ${acces}`;

  const questions = [
    {
      q: "Comment je paie ?",
      r: "Sur la page de paiement sécurisée NelsiusPay, tu choisis : Mobile Money (MTN et Orange au Cameroun, et aussi Moov, Airtel ou Wave dans les autres pays couverts), carte Visa ou Mastercard, ou PayPal. Tes codes ne s'écrivent jamais sur cette page.",
    },
    {
      q: "Quand est-ce que j'ai accès à la formation ?",
      r: "Tout de suite après le paiement : ta page « Mes accès » s'ouvre, avec tes liens pour rejoindre la formation. Garde bien son adresse.",
    },
    {
      q: "Combien de temps dure mon accès ?",
      r: mensuel
        ? `Chaque paiement t'ouvre ${offre.duree_jours ?? 30} jours d'accès. Tu renouvelles quand tu veux.`
        : offre.duree_jours
          ? `${offre.duree_jours} jours à partir du paiement.`
          : "À vie : tu paies une seule fois, et tu gardes tes accès.",
    },
    ...(avecGoogle
      ? [{
          q: "Il me faut une adresse Gmail ?",
          r: "Oui pour les vidéos (Google Drive) et les lives (Google Meet) : ils sont partagés sur ton adresse Gmail. Tu peux la donner pendant le paiement, ou juste après.",
        }]
      : []),
    ...(infos.public ? [{ q: "La formation est‑elle faite pour moi ?", r: infos.public }] : []),
    ...(contact
      ? [{
          q: "J'ai une autre question",
          r: (
            <>
              Écris à {nom} sur WhatsApp :{" "}
              <a href={contact} target="_blank" rel="noopener noreferrer">ouvrir la discussion</a>.
            </>
          ),
        }]
      : []),
  ];

  const prix = (
    <div className="v-prix">
      <span className="v-prix-montant">{nombre(offre.prix)}</span>
      <span className="v-prix-devise">FCFA</span>
      {barreAffichee ? (
        <span className="v-prix-ancien">
          <s>{fcfa(offre.prix_barre)}</s>
          <span className="v-remise">−{reduction}&nbsp;%</span>
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="vente v2" ref={racine}>
      <div className="v-fond" aria-hidden="true" />
      <div className="v-contenu">

      <header className="vente-entete">
        <span className="vente-marque">{offre.formateur?.nom}</span>
        {contact ? (
          <a className="lien-discret" href={contact} target="_blank" rel="noopener noreferrer">
            <Icone nom="bulle" taille={18} /> Une question ?
          </a>
        ) : null}
      </header>

      {jeton ? (
        <div className="v-deja">
          <Message type="succes" titre="Tu as déjà accès à cette formation." action={<Lien className="bouton bouton-or" href={`/acces/${jeton}`}>Ouvrir mes accès</Lien>} />
        </div>
      ) : null}

      <section className="v-heros" ref={heros}>
        <p className="v-surtitre">
          {titre}
          {infos.duree ? <span> · {infos.duree}</span> : null}
        </p>
        <h1 className="v-titre-heros">{avecAccent(offre.sous_titre || offre.titre)}</h1>
        <Media video={infos.video} image={offre.image_url} titre={titre} />
        <Lien className="v-cta" href={paiement}>
          <span>Je rejoins la formation</span>
          <Icone nom="fleche" taille={18} />
        </Lien>
        <p className="v-rassure">Paiement sécurisé · Accès immédiat</p>
        <MoyensPaiement />
      </section>

      {preuves.length ? (
        <section className="v-section" aria-labelledby="titre-preuves">
          <h2 className="v-titre v-apparait" id="titre-preuves">Ils nous ont fait confiance :</h2>
          <Defile images={preuves} />
        </section>
      ) : null}

      <section className="v-section" aria-labelledby="titre-offre">
        <div className="v-offre v-apparait">
          <h2 className="v-offre-titre" id="titre-offre">{titre}</h2>
          {infos.public ? <p className="v-offre-public">{infos.public}</p> : null}
          {prix}
          <ul className="v-puces">
            <li><Icone nom="eclair" taille={15} /> Accès immédiat</li>
            <li><Icone nom="carte" taille={15} /> {mensuel ? "Abonnement mensuel" : "Paiement unique"}</li>
            {infos.duree ? <li><Icone nom="horloge" taille={15} /> {infos.duree}</li> : null}
            {whatsapp ? <li><Icone nom="bulle" taille={15} /> Support WhatsApp</li> : null}
          </ul>
          <Lien className="v-cta v-cta-plein" href={paiement}>
            <span>Je rejoins la formation</span>
            <Icone nom="fleche" taille={18} />
          </Lien>
          <p className="v-offre-modalite">{modalite}</p>
          <MoyensPaiement taille="petit" className="v-offre-moyens" />
          {outils.length || bonus.length ? (
            <ul className="v-coches">
              {outils.map((o) => (
                <li key={o.type}><Icone nom="coche" taille={16} /><span>{o.titre}</span></li>
              ))}
              {bonus.map((b, i) => (
                <li key={`b${i}`} className="v-coche-bonus"><Icone nom="cadeau" taille={16} /><span><strong>Bonus</strong> · {b}</span></li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {outils.length ? (
        <section className="v-section" aria-labelledby="titre-recus">
          <h2 className="v-titre v-apparait" id="titre-recus">Tout ce que tu reçois</h2>
          <ul className="v-cartes">
            {outils.map((o) => (
              <li key={o.type} className="v-carte v-apparait">
                <span className="v-tuile"><Icone nom={ICONE_OUTIL[o.type]} taille={20} /></span>
                <h3 className="v-carte-titre">{o.titre}</h3>
                <p className="v-carte-texte">{PROMESSE[o.type]}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {programme.length ? (
        <section className="v-section" aria-labelledby="titre-programme">
          <h2 className="v-titre v-apparait" id="titre-programme">Au programme</h2>
          <ol className="v-cartes v-cartes-3">
            {programme.map((p, i) => (
              <li key={i} className="v-carte v-apparait">
                <span className="v-tuile v-tuile-violet">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="v-carte-titre">{p.titre}</h3>
                {p.texte ? <p className="v-carte-texte">{p.texte}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {offre.description ? (
        <section className="v-section" aria-labelledby="titre-detail">
          <h2 className="v-titre v-apparait" id="titre-detail">La formation en détail</h2>
          <div className="v-carte v-detail v-apparait">{offre.description}</div>
        </section>
      ) : null}

      <section className="v-section" aria-labelledby="titre-faq">
        <h2 className="v-titre v-apparait" id="titre-faq">Questions fréquentes</h2>
        <Faq questions={questions} />
      </section>

      <section className="v-section v-final" aria-labelledby="titre-final">
        <h2 className="v-titre-final v-apparait" id="titre-final">Prêt à commencer {avecAccent("*dès aujourd'hui*")} ?</h2>
        <Lien className="v-cta" href={paiement}>
          <span>Je rejoins la formation</span>
          <Icone nom="fleche" taille={18} />
        </Lien>
        <p className="v-rassure">{fcfa(offre.prix)} · {modalite}</p>
      </section>

      <footer className="v-pied">
        {contact ? (
          <p>
            Une question avant de payer ? <a href={contact} target="_blank" rel="noopener noreferrer">Écris à {nom} sur WhatsApp</a>
          </p>
        ) : null}
        <p className="v-pied-orci">Page de vente propulsée par Orci</p>
      </footer>
      </div>

      <div className={`barre-achat ${barre ? "visible" : ""}`} aria-hidden={!barre}>
        <div>
          <p className="barre-achat-prix">{fcfa(offre.prix)}</p>
          {barreAffichee ? <s className="prix-barre">{fcfa(offre.prix_barre)}</s> : null}
        </div>
        <Lien className="v-cta v-cta-compact" href={paiement} tabIndex={barre ? 0 : -1}>Je rejoins</Lien>
      </div>
    </div>
  );
}
