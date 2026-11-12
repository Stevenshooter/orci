// L'attente de la confirmation : la page interroge le statut toutes les trois
// secondes, et ouvre les accès dès que le paiement est acquis.
//
// Le lien d'accès n'est rendu qu'au navigateur qui a lancé le paiement (il en
// garde la clé). La référence, elle, peut se recopier sans rien ouvrir.
//
// L'acheteur qui abandonne sur la page NelsiusPay revient ici avec ?annule=1 :
// le premier tour le signale, et la demande est close si rien n'a été payé.

import { useEffect, useRef, useState } from "react";
import { fcfa, lienWhatsApp } from "../lib/format.js";
import { Lien, naviguer } from "../lib/routeur.jsx";
import { fonction, sessionActuelle } from "../lib/supa.js";
import { cleConnue, retenirAcces } from "../lib/visiteur.js";
import { Bouton, Chargement, Icone, LienBouton, Message, useTitre } from "../ui.jsx";

const INTERVALLE = 3000;
const PATIENCE = 15 * 60 * 1000;

export default function Attente({ reference }) {
  useTitre("Paiement en cours");
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  const [erreurSimulation, setErreurSimulation] = useState(null);
  const [relance, setRelance] = useState(0);
  const [lassitude, setLassitude] = useState(false);
  const debut = useRef(Date.now());
  // startsWith : un fournisseur peut coller ses propres paramètres derrière (?annule=1?status=…).
  const abandon = useRef((new URLSearchParams(window.location.search).get("annule") ?? "").startsWith("1"));

  useEffect(() => {
    let fini = false;
    let minuteur;

    async function tour() {
      let r = null;
      const corps = { action: "statut", reference, cle: cleConnue(reference) };
      if (abandon.current) {
        corps.annule = true;
        abandon.current = false;
        window.history.replaceState(null, "", window.location.pathname);
      }
      try {
        r = await fonction("paiement", corps);
        if (fini) return;
        setEtat(r);
        setErreur(null);
      } catch (e) {
        if (fini) return;
        setErreur(e);
        if (e.statut === 404) return; // référence inconnue : inutile d'insister
      }

      if (r?.statut === "paye") {
        if (r.jeton) {
          retenirAcces(r.offre?.slug, r.jeton);
          minuteur = setTimeout(() => naviguer(`/acces/${r.jeton}`, { remplacer: true }), 1400);
        }
        return;
      }
      if (r && r.statut !== "en_cours") return;
      if (Date.now() - debut.current > PATIENCE) {
        setLassitude(true);
        return;
      }
      minuteur = setTimeout(tour, document.hidden ? INTERVALLE * 3 : INTERVALLE);
    }

    tour();
    return () => {
      fini = true;
      clearTimeout(minuteur);
    };
  }, [reference, relance]);

  async function simuler(resultat) {
    setEnvoi(resultat);
    setErreurSimulation(null);
    try {
      await fonction("paiement", { action: "simuler", reference, resultat }, { session: true });
    } catch (e) {
      setErreurSimulation(e.message);
    } finally {
      setEnvoi(null);
      setRelance((n) => n + 1);
    }
  }

  if (!etat && erreur) {
    return (
      <div className="page page-etroite">
        <Message type="erreur" titre={erreur.statut === 404 ? "Ce paiement est introuvable." : "Le suivi du paiement a échoué."}>
          {erreur.statut === 404 ? "Vérifie le lien, ou recommence depuis la page de la formation." : erreur.message}
        </Message>
      </div>
    );
  }
  if (!etat) return <div className="page page-centree"><Chargement texte="Vérification du paiement…" /></div>;

  const test = etat.test ?? etat.mode === "simulation";
  const nelsius = etat.mode === "nelsius";
  const proprietaire = Boolean(sessionActuelle());
  const slug = etat.offre?.slug;
  const formateur = etat.formateur || {};

  if (etat.statut === "paye") {
    if (!etat.jeton) {
      return (
        <div className="page page-etroite attente">
          <div className="attente-icone attente-ok"><Icone nom="coche" taille={34} /></div>
          <h1>Paiement reçu</h1>
          <p className="attente-texte">
            Tes accès à « {etat.offre?.titre} » sont ouverts. Par sécurité, ils ne s'affichent que sur le navigateur
            qui a lancé le paiement : rouvre cette page depuis lui.
          </p>
          <p className="attente-texte">Sinon, demande ton lien d'accès au formateur avec ta référence.</p>
          <p className="attente-reference">Référence : {reference}</p>
          {formateur.whatsapp ? (
            <LienBouton
              className="bouton-large"
              icone="bulle"
              target="_blank"
              rel="noopener noreferrer"
              href={lienWhatsApp(formateur.whatsapp, `Bonjour, j'ai payé « ${etat.offre?.titre} » (référence ${reference}). Peux-tu m'envoyer mon lien d'accès ?`)}
            >
              Demander mon lien sur WhatsApp
            </LienBouton>
          ) : null}
        </div>
      );
    }
    return (
      <div className="page page-etroite attente">
        <div className="attente-icone attente-ok"><Icone nom="coche" taille={34} /></div>
        <h1>Paiement reçu</h1>
        <p className="attente-texte">Merci ! Tes accès à « {etat.offre?.titre} » s'ouvrent…</p>
        <Lien className="bouton bouton-or bouton-large" href={`/acces/${etat.jeton}`}>Ouvrir mes accès</Lien>
      </div>
    );
  }

  if (etat.statut !== "en_cours") {
    return (
      <div className="page page-etroite attente">
        <div className="attente-icone attente-echec"><Icone nom="alerte" taille={30} /></div>
        <h1>Le paiement n'a pas abouti</h1>
        <p className="attente-texte">
          {etat.statut === "expire"
            ? "La demande a expiré avant d'être validée."
            : etat.statut === "annule"
              ? "La demande a été annulée."
              : "La demande a été refusée, ou le solde ne suffisait pas."}{" "}
          Si de l'argent a quand même quitté ton compte, écris au formateur avec la référence {reference}.
        </p>
        {slug ? <Lien className="bouton bouton-or bouton-large" href={`/o/${slug}/paiement`}>Réessayer</Lien> : null}
      </div>
    );
  }

  return (
    <div className="page page-etroite attente">
      {test ? (
        <div className="bandeau-test" role="note">
          <Icone nom="info" taille={18} /> {nelsius ? "Bac à sable NelsiusPay" : "Mode test"} : aucun argent ne bouge.
        </div>
      ) : null}

      <div className="attente-icone attente-cours" aria-hidden="true">
        <span className="roue roue-grande" />
      </div>
      <h1>Valide le paiement sur ton téléphone</h1>
      <p className="attente-texte">
        Une demande de {fcfa(etat.montant)} arrive sur ton téléphone{etat.operateur === "orange" ? " (Orange Money)" : etat.operateur === "mtn" ? " (MTN MoMo)" : ""}.
        Entre ton code secret pour la valider. Cette page s'ouvrira toute seule ensuite.
      </p>
      <p className="attente-reference">Référence : {reference}</p>

      {test && proprietaire ? (
        <div className="carte simulation">
          <p className="simulation-titre">Simuler la réponse de l'opérateur</p>
          <p className="simulation-texte">
            {nelsius
              ? "Bac à sable NelsiusPay : si la demande reste en attente, force sa réponse. Tout passe par NelsiusPay, comme un vrai paiement."
              : "En mode test, aucune demande ne part vers un téléphone. Choisis ce qui se passe :"}
          </p>
          <div className="rangee">
            <Bouton variante="or" icone="coche" onClick={() => simuler("paye")} charge={envoi === "paye"} disabled={Boolean(envoi)}>Paiement réussi</Bouton>
            <Bouton variante="discret" icone="alerte" onClick={() => simuler("echec")} charge={envoi === "echec"} disabled={Boolean(envoi)}>Paiement refusé</Bouton>
          </div>
          {erreurSimulation ? <Message type="erreur">{erreurSimulation}</Message> : null}
        </div>
      ) : null}
      {test && !proprietaire ? (
        <Message type="info" titre="Paiement de test">
          Seul le propriétaire peut le simuler : connecte-toi à l'espace admin sur cet appareil, puis reviens ici.
        </Message>
      ) : null}

      {lassitude ? (
        <Message
          type="attention"
          titre="Toujours rien ?"
          action={
            <Bouton
              variante="discret"
              icone="rafraichir"
              onClick={() => {
                debut.current = Date.now();
                setLassitude(false);
                setRelance((n) => n + 1);
              }}
            >
              Vérifier à nouveau
            </Bouton>
          }
        >
          Si l'argent est parti mais que rien ne s'ouvre, garde la référence ci-dessus et écris au formateur.
        </Message>
      ) : null}
      {erreur ? <Message type="attention">Connexion instable, nouvel essai dans quelques secondes…</Message> : null}
    </div>
  );
}
