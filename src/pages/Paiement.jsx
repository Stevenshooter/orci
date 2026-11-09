// Le formulaire de paiement : nom, numéro Mobile Money, opérateur, Gmail.

import { useEffect, useState } from "react";
import { devinerOperateur, fcfa } from "../lib/format.js";
import { Lien, naviguer } from "../lib/routeur.jsx";
import { fonction, rpc } from "../lib/supa.js";
import { coordonneesConnues, retenirCoordonnees, sourceVisite } from "../lib/visiteur.js";
import { Bouton, Champ, Chargement, Icone, Message, useDonnees, useTitre } from "../ui.jsx";
import Introuvable from "./Introuvable.jsx";

const OPERATEURS = [
  { id: "mtn", nom: "MTN MoMo", texte: "Mobile Money MTN" },
  { id: "orange", nom: "Orange Money", texte: "Orange Money" },
];

function emailValide(e) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

export default function Paiement({ slug }) {
  const { donnees: offre, erreur: erreurOffre, charge } = useDonnees(() => rpc("offre_publique", { p_slug: slug }), [slug]);
  useTitre(offre ? `Paiement · ${offre.titre}` : "Paiement");

  const connu = coordonneesConnues();
  const [nom, setNom] = useState(connu.nom || "");
  const [tel, setTel] = useState(connu.telephone || "");
  const [operateur, setOperateur] = useState(connu.operateur || "");
  const [choisi, setChoisi] = useState(Boolean(connu.operateur));
  const [email, setEmail] = useState(connu.email || "");
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Une erreur signalée s'efface dès que l'acheteur corrige le champ.
  const corriger = (champ, poser) => (e) => {
    poser(e.target.value);
    if (erreurs[champ]) setErreurs((x) => ({ ...x, [champ]: undefined }));
  };

  // L'opérateur se déduit du numéro tant que l'acheteur n'en a pas choisi un.
  useEffect(() => {
    if (choisi) return;
    const o = devinerOperateur(tel);
    if (o) {
      setOperateur(o);
      setErreurs((x) => (x.operateur ? { ...x, operateur: undefined } : x));
    }
  }, [tel, choisi]);

  if (charge && !offre) return <div className="page page-centree"><Chargement /></div>;
  if (erreurOffre) return <div className="page page-etroite"><Message type="erreur" titre="La page n'a pas pu s'ouvrir.">{erreurOffre.message}</Message></div>;
  if (!offre) return <Introuvable texte="Cette formation n'est pas en vente pour le moment." />;

  const avecGoogle = (offre.outils || []).some((o) => o.type === "drive" || o.type === "meet");

  function verifier() {
    const e = {};
    if (nom.trim().length < 2) e.nom = "Écris ton nom complet.";
    const chiffres = tel.replace(/\D/g, "");
    if (chiffres.length < 8 || chiffres.length > 15) e.tel = "Écris ton numéro avec ses 9 chiffres, par exemple 6 90 12 34 56.";
    if (!operateur) e.operateur = "Choisis ton opérateur.";
    if (email.trim() && !emailValide(email.trim())) e.email = "Cette adresse ne semble pas valide.";
    setErreurs(e);
    return Object.keys(e).length === 0;
  }

  async function payer(ev) {
    ev.preventDefault();
    setErreur(null);
    if (!verifier()) return;
    setEnvoi(true);
    try {
      const corps = {
        action: "creer",
        offre: offre.slug,
        nom: nom.trim(),
        telephone: tel,
        operateur,
        email: email.trim().toLowerCase(),
        source: sourceVisite(),
      };
      const r = await fonction("paiement", corps);
      retenirCoordonnees({ nom: corps.nom, telephone: tel, operateur, email: corps.email });
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      naviguer(`/paiement/${r.reference}`);
    } catch (e) {
      setErreur(e.message);
      setEnvoi(false);
    }
  }

  return (
    <div className="page page-etroite paiement">
      <Lien className="lien-retour" href={`/o/${offre.slug}${window.location.search}`}>
        <Icone nom="retour" taille={18} /> Retour à la formation
      </Lien>

      <div className="recap">
        <p className="recap-titre">{offre.titre}</p>
        <p className="recap-prix">{fcfa(offre.prix)}</p>
      </div>

      <form className="carte formulaire" onSubmit={payer} noValidate>
        <h1 className="titre-carte">Tes informations</h1>

        <Champ
          etiquette="Nom complet"
          id="nom"
          autoComplete="name"
          value={nom}
          onChange={corriger("nom", setNom)}
          erreur={erreurs.nom}
          maxLength={80}
          required
        />

        <Champ
          etiquette="Numéro Mobile Money"
          id="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="6 90 12 34 56"
          value={tel}
          onChange={corriger("tel", setTel)}
          erreur={erreurs.tel}
          aide="Le numéro qui va payer. C'est aussi lui qui te permettra de rejoindre le groupe WhatsApp."
          maxLength={20}
          required
        />

        <fieldset className={`choix ${erreurs.operateur ? "champ-erreur" : ""}`}>
          <legend>Opérateur</legend>
          <div className="choix-options">
            {OPERATEURS.map((o) => (
              <label key={o.id} className={`choix-option ${operateur === o.id ? "actif" : ""}`}>
                <input
                  type="radio"
                  name="operateur"
                  value={o.id}
                  checked={operateur === o.id}
                  onChange={() => {
                    setOperateur(o.id);
                    setChoisi(true);
                    setErreurs((x) => ({ ...x, operateur: undefined }));
                  }}
                />
                <span className={`pastille pastille-${o.id}`} aria-hidden="true" />
                <span>{o.nom}</span>
              </label>
            ))}
          </div>
          {erreurs.operateur ? <p className="champ-aide champ-aide-erreur">{erreurs.operateur}</p> : null}
        </fieldset>

        <Champ
          etiquette={avecGoogle ? "Adresse Gmail (conseillé)" : "Adresse e-mail (facultatif)"}
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="toncompte@gmail.com"
          value={email}
          onChange={corriger("email", setEmail)}
          erreur={erreurs.email}
          aide={avecGoogle ? "C'est là que tu recevras le dossier des vidéos et les invitations aux lives. Tu pourras aussi la donner après le paiement." : undefined}
          maxLength={254}
        />

        {erreur ? <Message type="erreur" titre="Le paiement n'a pas pu démarrer.">{erreur}</Message> : null}

        <Bouton type="submit" className="bouton-large" charge={envoi} icone="cadenas">
          Payer {fcfa(offre.prix)}
        </Bouton>
        <p className="mention">
          Une demande de paiement arrive sur ton téléphone : tu la valides avec ton code secret Mobile Money. Ton code
          ne s'écrit jamais sur cette page.
        </p>
      </form>
    </div>
  );
}
