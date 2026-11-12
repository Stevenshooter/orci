// Le mot de passe du propriétaire : le champ (avec l'œil pour l'afficher) et le
// panneau pour le créer ou le changer depuis l'espace admin.
//
// Les attributs autocomplete (username, current-password, new-password) laissent
// le téléphone ou le navigateur proposer d'enregistrer le mot de passe, puis le
// remplir tout seul la fois suivante.

import { useState } from "react";
import { definirMotDePasse } from "../lib/supa.js";
import { Bouton, Champ, Icone, Message } from "../ui.jsx";

export const LONGUEUR_MIN = 8;

/** Ce compte a un mot de passe connu sur cet appareil : plus besoin de le proposer. */
export function retenirMotDePasse() {
  try {
    localStorage.setItem("orci.mdp", "1");
    localStorage.removeItem("orci.mdp-plus-tard");
  } catch {
    // Stockage refusé : la suggestion réapparaîtra, sans gravité.
  }
}

export function motDePasseConnu() {
  try {
    return localStorage.getItem("orci.mdp") === "1" || localStorage.getItem("orci.mdp-plus-tard") === "1";
  } catch {
    return false;
  }
}

export function reporterMotDePasse() {
  try {
    localStorage.setItem("orci.mdp-plus-tard", "1");
  } catch {
    // sans importance
  }
}

export function ChampMotDePasse({ id, etiquette, valeur, changer, autoComplete, erreur, aide, autoFocus }) {
  const [visible, setVisible] = useState(false);
  const decrit = aide || erreur ? `${id}-aide` : undefined;
  return (
    <Champ
      etiquette={etiquette}
      id={id}
      erreur={erreur}
      aide={aide}
      enfant={
        <div className="champ-mdp">
          <input
            id={id}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={valeur}
            onChange={(e) => changer(e.target.value)}
            aria-invalid={erreur ? "true" : undefined}
            aria-describedby={decrit}
            autoFocus={autoFocus}
            required
          />
          <button
            type="button"
            className="champ-mdp-oeil"
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            <Icone nom={visible ? "oeil-barre" : "oeil"} taille={20} />
          </button>
        </div>
      }
    />
  );
}

/**
 * Créer ou changer le mot de passe du compte connecté.
 *   obligatoire : arrivée par un lien « choisir mon mot de passe »
 */
export function PanneauMotDePasse({ email, obligatoire = false, onFermer }) {
  const [mdp, setMdp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(false);

  async function enregistrer(e) {
    e.preventDefault();
    setErreur(null);
    const x = {};
    if (mdp.length < LONGUEUR_MIN) x.mdp = `Au moins ${LONGUEUR_MIN} caractères.`;
    else if (!/[a-zA-Z]/.test(mdp) || !/[0-9]/.test(mdp)) x.mdp = "Mélange des lettres et des chiffres.";
    if (!x.mdp && confirmation !== mdp) x.confirmation = "Les deux mots de passe ne sont pas identiques.";
    setErreurs(x);
    if (Object.keys(x).length) return;

    setEnvoi(true);
    try {
      await definirMotDePasse(mdp);
      retenirMotDePasse();
      setFait(true);
      setMdp("");
      setConfirmation("");
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (fait) {
    return (
      <section className="carte panneau-mdp">
        <Message
          type="succes"
          titre="Mot de passe enregistré"
          action={onFermer ? <Bouton variante="discret" icone="coche" onClick={onFermer}>Continuer</Bouton> : null}
        >
          La prochaine fois, connecte-toi sur <strong>/connexion</strong> avec {email ? <strong>{email}</strong> : "ton e-mail"} et ce mot de
          passe, sans attendre d'e-mail.
        </Message>
      </section>
    );
  }

  return (
    <section className="carte panneau-mdp" aria-labelledby="titre-mdp">
      <form className="formulaire" onSubmit={enregistrer} noValidate>
        <div className="panneau-mdp-tete">
          <span className="envoye-icone envoye-icone-petite" aria-hidden="true"><Icone nom="cadenas" taille={20} /></span>
          <div>
            <h2 className="titre-carte" id="titre-mdp">{obligatoire ? "Choisis ton mot de passe" : "Ton mot de passe"}</h2>
            <p className="texte-doux petit">
              {obligatoire
                ? "Une dernière étape : ce mot de passe te servira à entrer directement, sans attendre d'e-mail."
                : "Crée ou change le mot de passe qui t'ouvre ton espace directement."}
            </p>
          </div>
        </div>

        {/* Pour que le gestionnaire de mots de passe sache à quel compte l'associer. */}
        <input type="email" name="username" autoComplete="username" value={email ?? ""} readOnly hidden />

        <ChampMotDePasse
          id="nouveau-mdp"
          etiquette="Nouveau mot de passe"
          valeur={mdp}
          changer={(v) => {
            setMdp(v);
            if (erreurs.mdp) setErreurs((x) => ({ ...x, mdp: undefined }));
          }}
          autoComplete="new-password"
          erreur={erreurs.mdp}
          aide={`Au moins ${LONGUEUR_MIN} caractères, avec des lettres et des chiffres.`}
          autoFocus={obligatoire}
        />
        <ChampMotDePasse
          id="confirmation-mdp"
          etiquette="Retape-le"
          valeur={confirmation}
          changer={(v) => {
            setConfirmation(v);
            if (erreurs.confirmation) setErreurs((x) => ({ ...x, confirmation: undefined }));
          }}
          autoComplete="new-password"
          erreur={erreurs.confirmation}
        />

        {erreur ? <Message type="erreur">{erreur}</Message> : null}

        <div className="rangee">
          <Bouton type="submit" charge={envoi} icone="cadenas">Enregistrer le mot de passe</Bouton>
          {onFermer ? (
            <Bouton type="button" variante="discret" onClick={onFermer} disabled={envoi}>
              {obligatoire ? "Plus tard" : "Fermer"}
            </Bouton>
          ) : null}
        </div>
      </form>
    </section>
  );
}
