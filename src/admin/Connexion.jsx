// La page de connexion du propriétaire, à l'adresse /connexion (et /admin).
//
// D'abord l'e-mail et le mot de passe : on entre tout de suite, et le téléphone
// peut les retenir. En secours, deux liens envoyés par e-mail :
//   · « Première connexion ou mot de passe oublié » : un lien pour choisir son
//     mot de passe, qui ouvre aussi l'espace ;
//   · « Recevoir un lien de connexion » : l'ancien lien magique (avec, si le
//     modèle d'e-mail l'affiche, un code à six chiffres).
//
// Sans serveur d'envoi branché, Supabase n'envoie que deux e-mails par heure :
// le mot de passe évite d'en dépendre.

import { useState } from "react";
import { connexionMotDePasse, envoyerLien, envoyerReinitialisation, verifierCode } from "../lib/supa.js";
import { Bouton, Champ, Icone, Message, useTitre } from "../ui.jsx";
import { ChampMotDePasse, retenirMotDePasse } from "./MotDePasse.jsx";

function emailRetenu() {
  try {
    return localStorage.getItem("orci.email-admin") || "";
  } catch {
    return "";
  }
}

function retenirEmail(adresse) {
  try {
    localStorage.setItem("orci.email-admin", adresse);
  } catch {
    // sans importance
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function Connexion({ retour }) {
  useTitre("Connexion · Orci");
  // "mdp" · "premiere" (lien pour choisir son mot de passe) · "lien" (lien de connexion)
  const [mode, setMode] = useState("mdp");
  const [envoye, setEnvoye] = useState(null); // mode dont l'e-mail est parti
  const [email, setEmail] = useState(emailRetenu);
  const [mdp, setMdp] = useState("");
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(retour?.erreur ?? null);
  const [erreurEmail, setErreurEmail] = useState(null);

  const adresse = email.trim().toLowerCase();

  function changerMode(m) {
    setMode(m);
    setEnvoye(null);
    setErreur(null);
    setErreurEmail(null);
    setCode("");
  }

  function emailValable() {
    if (EMAIL.test(adresse)) return true;
    setErreurEmail("Cette adresse e-mail ne semble pas valide.");
    return false;
  }

  async function seConnecter(e) {
    e.preventDefault();
    setErreur(null);
    if (!emailValable()) return;
    if (!mdp) {
      setErreur("Écris ton mot de passe.");
      return;
    }
    setEnvoi(true);
    try {
      await connexionMotDePasse(adresse, mdp);
      retenirEmail(adresse);
      retenirMotDePasse();
      // La session est posée : l'espace admin prend le relais.
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  async function envoyer(e) {
    e.preventDefault();
    setErreur(null);
    if (!emailValable()) return;
    setEnvoi(true);
    try {
      if (mode === "premiere") await envoyerReinitialisation(adresse, `${window.location.origin}/admin`);
      else await envoyerLien(adresse, `${window.location.origin}/admin`);
      retenirEmail(adresse);
      setEnvoye(mode);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  async function valider(e) {
    e.preventDefault();
    setErreur(null);
    const c = code.replace(/\D/g, "");
    if (c.length < 6) {
      setErreur("Le code compte six chiffres.");
      return;
    }
    setEnvoi(true);
    try {
      await verifierCode(adresse, c);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  const champEmail = (
    <Champ
      etiquette="Adresse e-mail"
      id="email-admin"
      name="username"
      type="email"
      inputMode="email"
      autoComplete="username"
      autoCapitalize="none"
      spellCheck={false}
      value={email}
      onChange={(e) => {
        setEmail(e.target.value);
        if (erreurEmail) setErreurEmail(null);
      }}
      erreur={erreurEmail}
      required
    />
  );

  let carte;

  if (envoye) {
    carte = (
      <form className="carte formulaire" onSubmit={valider} noValidate>
        <div className="envoye-icone"><Icone nom="envoi" taille={26} /></div>
        <h1 className="titre-carte">Regarde ta boîte mail</h1>
        <p className="texte-doux">
          Un e-mail est parti vers <strong>{adresse}</strong>
          {envoye === "premiere"
            ? ". Ouvre son lien : tu arrives dans ton espace et tu choisis ton mot de passe. Ensuite, plus besoin d'e-mail."
            : ". Ouvre son lien : ton espace s'ouvre directement."}{" "}
          Pense à regarder dans les spams. Un lien ne sert qu'une fois.
        </p>
        {envoye === "lien" ? (
          <>
            <Champ
              etiquette="Ou tape le code à 6 chiffres, s'il y en a un"
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={10}
            />
            {erreur ? <Message type="erreur">{erreur}</Message> : null}
            <Bouton type="submit" variante="violet" className="bouton-large" charge={envoi}>Valider le code</Bouton>
          </>
        ) : null}
        <button type="button" className="lien-discret connexion-retour" onClick={() => changerMode("mdp")}>
          <Icone nom="retour" taille={16} /> Revenir à la connexion
        </button>
      </form>
    );
  } else if (mode === "mdp") {
    carte = (
      <form className="carte formulaire" onSubmit={seConnecter} noValidate>
        <div>
          <h1 className="titre-carte">Connexion à ton espace</h1>
          <p className="texte-doux petit">Ton e-mail et ton mot de passe, et tu es dedans.</p>
        </div>
        {champEmail}
        <ChampMotDePasse
          id="mot-de-passe"
          etiquette="Mot de passe"
          valeur={mdp}
          changer={(v) => {
            setMdp(v);
            if (erreur) setErreur(null);
          }}
          autoComplete="current-password"
          autoFocus={Boolean(email)}
        />
        {erreur ? <Message type="erreur">{erreur}</Message> : null}
        <Bouton type="submit" className="bouton-large" charge={envoi} icone="cadenas">Se connecter</Bouton>
        <button type="button" className="lien-texte connexion-oubli" onClick={() => changerMode("premiere")}>
          Première connexion ou mot de passe oublié ?
        </button>
        <div className="connexion-separateur" role="separator"><span>ou</span></div>
        <Bouton type="button" variante="discret" className="bouton-large" icone="envoi" onClick={() => changerMode("lien")}>
          Recevoir un lien par e-mail
        </Bouton>
      </form>
    );
  } else {
    const premiere = mode === "premiere";
    carte = (
      <form className="carte formulaire" onSubmit={envoyer} noValidate>
        <div>
          <h1 className="titre-carte">{premiere ? "Choisir mon mot de passe" : "Recevoir un lien de connexion"}</h1>
          <p className="texte-doux petit">
            {premiere
              ? "Indique ton adresse : tu reçois un lien qui ouvre ton espace, où tu choisis ton mot de passe. Ensuite, tu entres directement."
              : "Indique ton adresse : tu reçois un lien qui ouvre ton espace, sans mot de passe."}
          </p>
        </div>
        {champEmail}
        {erreur ? <Message type="erreur">{erreur}</Message> : null}
        <Bouton type="submit" className="bouton-large" charge={envoi} icone="envoi">
          {premiere ? "Recevoir le lien" : "Recevoir mon lien de connexion"}
        </Bouton>
        <button type="button" className="lien-discret connexion-retour" onClick={() => changerMode("mdp")}>
          <Icone nom="retour" taille={16} /> J'ai déjà un mot de passe
        </button>
      </form>
    );
  }

  return (
    <div className="page page-etroite connexion">
      <div className="logo logo-grand">
        <span className="logo-marque" aria-hidden="true" />
        Orci
      </div>
      {carte}
      <p className="mention connexion-pied">Espace réservé au formateur. Les acheteurs n'ont pas besoin de compte.</p>
    </div>
  );
}
