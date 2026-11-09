// La page de vente : tout ce qu'il faut pour décider, et un seul bouton.

import { useEffect, useRef, useState } from "react";
import { fcfa, lienWhatsApp } from "../lib/format.js";
import { Lien } from "../lib/routeur.jsx";
import { rpc } from "../lib/supa.js";
import { accesConnu, idVisiteur, sourceVisite } from "../lib/visiteur.js";
import { Chargement, Icone, ICONE_OUTIL, Message, useDonnees, useTitre } from "../ui.jsx";
import Introuvable from "./Introuvable.jsx";

const PROMESSE = {
  drive: "Partagé sur ton adresse Gmail, à regarder quand tu veux.",
  meet: "Les invitations arrivent dans ton agenda Google.",
  telegram: "Ton lien d'entrée personnel, juste après le paiement.",
  whatsapp: "Pour poser tes questions et avancer avec les autres.",
  lien: "Ouvert dès le paiement.",
};

export default function Vente({ slug }) {
  const { donnees: offre, erreur, charge, recharger } = useDonnees(() => rpc("offre_publique", { p_slug: slug ?? null }), [slug]);
  useTitre(offre ? `${offre.titre} · ${offre.formateur?.nom ?? "Orci"}` : "Orci");

  useEffect(() => {
    if (!offre?.id) return;
    rpc("enregistrer_vue", { p_offre: offre.id, p_visiteur: idVisiteur(), p_source: sourceVisite() }).catch(() => {});
  }, [offre?.id]);

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
  const reduction = offre.prix_barre && offre.prix_barre > offre.prix ? Math.round(100 - (100 * offre.prix) / offre.prix_barre) : 0;
  const jeton = accesConnu(offre.slug);
  const whatsapp = offre.formateur?.whatsapp;
  const programme = Array.isArray(offre.programme) ? offre.programme : [];
  const bonus = Array.isArray(offre.bonus) ? offre.bonus : [];
  const infos = offre.infos || {};
  const outils = Array.isArray(offre.outils) ? offre.outils : [];
  const modalite = offre.facturation === "mensuel"
    ? `par mois · accès ${offre.duree_jours ?? 30} jours renouvelable`
    : offre.duree_jours
      ? `paiement unique · accès ${offre.duree_jours} jours`
      : "paiement unique · accès à vie";

  return (
    <div className="vente">
      <header className="vente-entete">
        <span className="vente-marque">{offre.formateur?.nom}</span>
        {whatsapp ? (
          <a className="lien-discret" href={lienWhatsApp(whatsapp, `Bonjour, j'ai une question sur « ${offre.titre} ».`)} target="_blank" rel="noopener noreferrer">
            <Icone nom="bulle" taille={18} /> Une question ?
          </a>
        ) : null}
      </header>

      {jeton ? (
        <div className="vente-section vente-deja">
          <Message type="succes" titre="Tu as déjà accès à cette formation." action={<Lien className="bouton bouton-or" href={`/acces/${jeton}`}>Ouvrir mes accès</Lien>} />
        </div>
      ) : null}

      <section className={`vente-heros ${offre.image_url ? "" : "sans-image"}`} ref={heros}>
        <div className="vente-heros-texte">
          <p className="surtitre">
            Formation{infos.duree ? ` · ${infos.duree}` : ""}
          </p>
          <h1>{offre.titre}</h1>
          {offre.sous_titre ? <p className="vente-accroche">{offre.sous_titre}</p> : null}

          <div className="prix">
            <span className="prix-montant">{fcfa(offre.prix)}</span>
            {offre.prix_barre && offre.prix_barre > offre.prix ? (
              <>
                <s className="prix-barre">{fcfa(offre.prix_barre)}</s>
                <span className="badge badge-or">−{reduction}&nbsp;%</span>
              </>
            ) : null}
          </div>
          <p className="prix-modalite">{modalite}</p>

          <Lien className="bouton bouton-or bouton-large" href={paiement}>
            <Icone nom="fleche" taille={18} /><span>Je rejoins la formation</span>
          </Lien>
          <ul className="garanties">
            <li><Icone nom="telephone" taille={16} /> MTN MoMo ou Orange Money</li>
            <li><Icone nom="cadenas" taille={16} /> Accès ouvert dès le paiement</li>
          </ul>
        </div>
        {offre.image_url ? (
          <div className="vente-heros-image">
            <img src={offre.image_url} alt="" loading="eager" decoding="async" />
          </div>
        ) : null}
      </section>

      {outils.length ? (
        <section className="vente-section">
          <h2>Ce que tu reçois</h2>
          <ul className="recus">
            {outils.map((o) => (
              <li key={o.type} className="recu">
                <span className={`recu-icone recu-${o.type}`}><Icone nom={ICONE_OUTIL[o.type]} taille={22} /></span>
                <div>
                  <p className="recu-titre">{o.titre}</p>
                  <p className="recu-texte">{PROMESSE[o.type]}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {programme.length ? (
        <section className="vente-section">
          <h2>Au programme</h2>
          <ol className="programme">
            {programme.map((p, i) => (
              <li key={i}>
                <span className="programme-numero">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="programme-titre">{p.titre}</p>
                  {p.texte ? <p className="programme-texte">{p.texte}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {bonus.length ? (
        <section className="vente-section">
          <h2>En bonus</h2>
          <ul className="bonus">
            {bonus.map((b, i) => (
              <li key={i}><Icone nom="cadeau" taille={20} /><span>{b}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {infos.duree || infos.public ? (
        <section className="vente-section">
          <dl className="infos">
            {infos.duree ? (<div><dt>Durée</dt><dd>{infos.duree}</dd></div>) : null}
            {infos.public ? (<div><dt>Pour qui</dt><dd>{infos.public}</dd></div>) : null}
          </dl>
        </section>
      ) : null}

      {offre.description ? (
        <section className="vente-section">
          <h2>La formation en détail</h2>
          <div className="texte-long">{offre.description}</div>
        </section>
      ) : null}

      <section className="vente-section">
        <h2>Comment ça marche</h2>
        <ol className="etapes">
          <li><span>1</span><p>Tu paies {fcfa(offre.prix)} par MTN MoMo ou Orange Money, depuis ton téléphone.</p></li>
          <li><span>2</span><p>Ta page « Mes accès » s'ouvre aussitôt. Garde bien son lien.</p></li>
          <li><span>3</span><p>Tu rejoins les groupes et tu reçois les vidéos en quelques clics.</p></li>
        </ol>
      </section>

      <section className="vente-section vente-final">
        <p className="vente-final-titre">{offre.titre}</p>
        <div className="prix prix-centre">
          <span className="prix-montant">{fcfa(offre.prix)}</span>
          {offre.prix_barre && offre.prix_barre > offre.prix ? <s className="prix-barre">{fcfa(offre.prix_barre)}</s> : null}
        </div>
        <Lien className="bouton bouton-or bouton-large" href={paiement}>
          <Icone nom="fleche" taille={18} /><span>Je rejoins la formation</span>
        </Lien>
      </section>

      <footer className="vente-pied">
        {whatsapp ? (
          <p>
            Une question avant de payer ?{" "}
            <a href={lienWhatsApp(whatsapp, `Bonjour, j'ai une question sur « ${offre.titre} ».`)} target="_blank" rel="noopener noreferrer">
              Écris à {offre.formateur?.nom} sur WhatsApp
            </a>
          </p>
        ) : null}
        <p className="vente-pied-orci">Page de vente propulsée par Orci</p>
      </footer>

      <div className={`barre-achat ${barre ? "visible" : ""}`} aria-hidden={!barre}>
        <div>
          <p className="barre-achat-prix">{fcfa(offre.prix)}</p>
          {offre.prix_barre && offre.prix_barre > offre.prix ? <s className="prix-barre">{fcfa(offre.prix_barre)}</s> : null}
        </div>
        <Lien className="bouton bouton-or" href={paiement} tabIndex={barre ? 0 : -1}>Je rejoins</Lien>
      </div>
    </div>
  );
}
