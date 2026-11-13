// Le formulaire de paiement : nom, numéro Mobile Money, opérateur, Gmail.
//
// Avec NelsiusPay, l'acheteur passe ensuite sur la page sécurisée NelsiusPay
// pour valider, puis revient sur la page d'attente d'Orci.
//
// En mode test (simulation, ou bac à sable NelsiusPay), seul le propriétaire
// connecté voit ce formulaire. Un visiteur lit « Les paiements ouvrent
// bientôt » et peut laisser un message au formateur.

import { useEffect, useState } from "react";
import { devinerOperateur, fcfa, lienWhatsApp } from "../lib/format.js";
import { Lien, naviguer } from "../lib/routeur.jsx";
import { fonction, rpc, sessionActuelle } from "../lib/supa.js";
import { coordonneesConnues, retenirCle, retenirCoordonnees, sourceVisite } from "../lib/visiteur.js";
import { paysDe, paysParDefaut, retenirPays } from "../lib/pays.js";
import { Bouton, Champ, Chargement, Icone, LienBouton, Message, MoyensPaiement, SelectPays, useDonnees, useTitre } from "../ui.jsx";
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
  // Si le mode ne se lit pas (réseau), le formulaire s'affiche : c'est le
  // serveur qui tranche de toute façon.
  const mode = useDonnees(() => fonction("paiement", { action: "mode" }).catch(() => null), []);
  useTitre(offre ? `Paiement · ${offre.titre}` : "Paiement");

  const connu = coordonneesConnues();
  const [nom, setNom] = useState(connu.nom || "");
  const [tel, setTel] = useState(connu.telephone || "");
  const [operateur, setOperateur] = useState(connu.operateur || "");
  const [choisi, setChoisi] = useState(Boolean(connu.operateur));
  const [email, setEmail] = useState(connu.email || "");
  // Le pays choisi sur la page de vente (ou deviné) : il décide des moyens de
  // paiement montrés et de l'indicatif du numéro.
  const [pays, setPays] = useState(paysParDefaut);
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

  if ((charge && !offre) || mode.charge) return <div className="page page-centree"><Chargement /></div>;
  if (erreurOffre) return <div className="page page-etroite"><Message type="erreur" titre="La page n'a pas pu s'ouvrir.">{erreurOffre.message}</Message></div>;
  if (!offre) return <Introuvable texte="Cette formation n'est pas en vente pour le moment." />;

  const avecGoogle = (offre.outils || []).some((o) => o.type === "drive" || o.type === "meet");
  const nelsius = mode.donnees?.mode === "nelsius";
  const test = mode.donnees ? (mode.donnees.test ?? mode.donnees.mode === "simulation") : false;
  const proprietaire = Boolean(sessionActuelle());
  const formateur = offre.formateur || {};

  const entete = (
    <>
      <Lien className="lien-retour" href={`/o/${offre.slug}${window.location.search}`}>
        <Icone nom="retour" taille={18} /> Retour à la formation
      </Lien>
      <div className="recap">
        <p className="recap-titre">{offre.titre}</p>
        <p className="recap-prix">{fcfa(offre.prix)}</p>
      </div>
    </>
  );

  if (test && !proprietaire) {
    return (
      <div className="page page-etroite paiement">
        {entete}
        <section className="carte bientot">
          <div className="envoye-icone"><Icone nom="horloge" taille={26} /></div>
          <h1 className="titre-carte">Les paiements ouvrent bientôt</h1>
          <p className="texte-doux">
            Le paiement par Mobile Money n'est pas encore activé pour cette formation.
            {formateur.whatsapp ? ` Écris à ${formateur.nom} : tu seras prévenu dès l'ouverture.` : " Reviens très vite."}
          </p>
          {formateur.whatsapp ? (
            <LienBouton
              className="bouton-large"
              icone="bulle"
              target="_blank"
              rel="noopener noreferrer"
              href={lienWhatsApp(formateur.whatsapp, `Bonjour, je veux rejoindre « ${offre.titre} ». Préviens-moi dès que les paiements ouvrent.`)}
            >
              Être prévenu sur WhatsApp
            </LienBouton>
          ) : null}
        </section>
      </div>
    );
  }

  function verifier() {
    const e = {};
    if (nom.trim().length < 2) e.nom = "Écris ton nom complet.";
    const chiffres = tel.replace(/\D/g, "");
    if (nelsius ? chiffres.length < 6 || chiffres.length > 15 : chiffres.length < 8 || chiffres.length > 15) {
      e.tel = nelsius
        ? `Écris ton numéro de téléphone ${paysDe(pays).chez}${paysDe(pays).exemple ? `, par exemple ${paysDe(pays).exemple}` : ""}.`
        : "Écris ton numéro avec ses 9 chiffres, par exemple 6 90 12 34 56.";
    }
    // Avec NelsiusPay, le moyen de paiement se choisit sur sa page sécurisée.
    if (!nelsius && !operateur) e.operateur = "Choisis ton opérateur.";
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
        operateur: nelsius ? "" : operateur,
        ...(nelsius ? { pays } : {}),
        email: email.trim().toLowerCase(),
        source: sourceVisite(),
      };
      if (nelsius) retenirPays(pays);
      const r = await fonction("paiement", corps, { session: true });
      retenirCle(r.reference, r.cle);
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
      {entete}

      {test ? (
        <div className="bandeau-test bandeau-formulaire" role="note">
          <Icone nom="info" taille={18} />
          {nelsius ? (
            <span>
              Bac à sable NelsiusPay : toi seul vois ce formulaire, aucun argent ne bouge. Un numéro qui finit par 000
              simule un paiement réussi, par 111 un refus.
            </span>
          ) : (
            <span>Mode test : toi seul vois ce formulaire, aucun argent ne bouge. Les visiteurs lisent « Les paiements ouvrent bientôt ».</span>
          )}
        </div>
      ) : null}

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

        {nelsius ? (
          <Champ
            etiquette="Ton pays"
            id="pays"
            enfant={
              <SelectPays
                id="pays"
                valeur={pays}
                changer={(code) => {
                  setPays(code);
                  retenirPays(code);
                }}
              />
            }
          />
        ) : null}

        {nelsius ? (
          <Champ
            etiquette="Numéro de téléphone (WhatsApp)"
            id="telephone"
            erreur={erreurs.tel}
            aide="C'est lui qui te permettra de rejoindre le groupe WhatsApp."
            enfant={
              <div className="champ-tel">
                <span className="champ-tel-prefixe">+{paysDe(pays).indicatif}</span>
                <input
                  id="telephone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder={paysDe(pays).exemple ?? "Ton numéro"}
                  aria-invalid={erreurs.tel ? "true" : undefined}
                  aria-describedby="telephone-aide"
                  value={tel}
                  onChange={corriger("tel", setTel)}
                  maxLength={20}
                  required
                />
              </div>
            }
          />
        ) : (
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
        )}

        {nelsius ? (
          <div className="moyens-bloc">
            <p className="etiquette">Moyens de paiement {paysDe(pays).chez}</p>
            <MoyensPaiement pays={pays} />
            <p className="champ-aide">Tu choisis le tien à l'étape suivante, sur la page sécurisée NelsiusPay.</p>
          </div>
        ) : (
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
        )}

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
          {nelsius
            ? "Tu passes ensuite sur la page sécurisée NelsiusPay pour payer par Mobile Money, carte bancaire ou PayPal. Tes codes ne s'écrivent jamais sur Orci."
            : "Une demande de paiement arrive sur ton téléphone : tu la valides avec ton code secret Mobile Money. Ton code ne s'écrit jamais sur cette page."}
        </p>
      </form>
    </div>
  );
}
