// L'attente de la confirmation : la page interroge le statut toutes les trois
// secondes, et ouvre les accès dès que le paiement est acquis.

import { useEffect, useRef, useState } from "react";
import { fcfa } from "../lib/format.js";
import { Lien, naviguer } from "../lib/routeur.jsx";
import { fonction } from "../lib/supa.js";
import { retenirAcces } from "../lib/visiteur.js";
import { Bouton, Chargement, Icone, Message, useTitre } from "../ui.jsx";

const INTERVALLE = 3000;
const PATIENCE = 15 * 60 * 1000;

export default function Attente({ reference }) {
  useTitre("Paiement en cours");
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [lassitude, setLassitude] = useState(false);
  const debut = useRef(Date.now());

  async function lire() {
    try {
      const r = await fonction("paiement", { action: "statut", reference });
      setEtat(r);
      setErreur(null);
      return r;
    } catch (e) {
      setErreur(e);
      return null;
    }
  }

  useEffect(() => {
    let fini = false;
    let minuteur;
    async function tour() {
      const r = await lire();
      if (fini) return;
      if (r?.statut === "paye" && r.jeton) {
        retenirAcces(r.offre?.slug, r.jeton);
        minuteur = setTimeout(() => naviguer(`/acces/${r.jeton}`, { remplacer: true }), 1400);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, simulation]);

  async function simuler(resultat) {
    setSimulation(resultat);
    try {
      await fonction("paiement", { action: "simuler", reference, resultat });
    } catch (e) {
      setErreur(e);
    }
    // Relancer la boucle de lecture.
    setSimulation(`${resultat}-${Date.now()}`);
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

  const test = etat.mode === "simulation";
  const slug = etat.offre?.slug;

  if (etat.statut === "paye") {
    return (
      <div className="page page-etroite attente">
        <div className="attente-icone attente-ok"><Icone nom="coche" taille={34} /></div>
        <h1>Paiement reçu</h1>
        <p className="attente-texte">Merci ! Tes accès à « {etat.offre?.titre} » s'ouvrent…</p>
        {etat.jeton ? <Lien className="bouton bouton-or bouton-large" href={`/acces/${etat.jeton}`}>Ouvrir mes accès</Lien> : null}
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
          <Icone nom="info" taille={18} /> Mode test : aucun argent ne bouge.
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

      {test ? (
        <div className="carte simulation">
          <p className="simulation-titre">Simuler la réponse de l'opérateur</p>
          <p className="simulation-texte">En mode test, aucune demande ne part vers un téléphone. Choisis ce qui se passe :</p>
          <div className="rangee">
            <Bouton variante="or" icone="coche" onClick={() => simuler("paye")} charge={simulation === "paye"}>Paiement réussi</Bouton>
            <Bouton variante="discret" icone="alerte" onClick={() => simuler("echec")} charge={simulation === "echec"}>Paiement refusé</Bouton>
          </div>
        </div>
      ) : null}

      {lassitude ? (
        <Message type="attention" titre="Toujours rien ?" action={<Bouton variante="discret" icone="rafraichir" onClick={() => { debut.current = Date.now(); setLassitude(false); setSimulation(`relance-${Date.now()}`); }}>Vérifier à nouveau</Bouton>}>
          Si l'argent est parti mais que rien ne s'ouvre, garde la référence ci-dessus et écris au formateur.
        </Message>
      ) : null}
      {erreur ? <Message type="attention">Connexion instable, nouvel essai dans quelques secondes…</Message> : null}
    </div>
  );
}
