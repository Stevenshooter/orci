// Connexion du propriétaire par e-mail : un lien magique, ou un code à six
// chiffres si le modèle d'e-mail de Supabase l'affiche.

import { useState } from "react";
import { envoyerLien, verifierCode } from "../lib/supa.js";
import { Bouton, Champ, Icone, Message, useTitre } from "../ui.jsx";

export default function Connexion({ retour }) {
  useTitre("Connexion · Orci");
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("orci.email-admin") || "";
    } catch {
      return "";
    }
  });
  const [envoye, setEnvoye] = useState(false);
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(retour?.erreur ?? null);

  async function demander(e) {
    e.preventDefault();
    setErreur(null);
    const adresse = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      setErreur("Cette adresse e-mail ne semble pas valide.");
      return;
    }
    setEnvoi(true);
    try {
      await envoyerLien(adresse, `${window.location.origin}/admin`);
      try {
        localStorage.setItem("orci.email-admin", adresse);
      } catch {
        // sans importance
      }
      setEnvoye(true);
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
      await verifierCode(email.trim().toLowerCase(), c);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <div className="page page-etroite connexion">
      <div className="logo logo-grand">
        <span className="logo-marque" aria-hidden="true" />
        Orci
      </div>

      {!envoye ? (
        <form className="carte formulaire" onSubmit={demander} noValidate>
          <h1 className="titre-carte">Ton espace formateur</h1>
          <p className="texte-doux">Entre ton adresse e-mail : tu reçois un lien pour te connecter, sans mot de passe.</p>
          <Champ
            etiquette="Adresse e-mail"
            id="email-admin"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {erreur ? <Message type="erreur">{erreur}</Message> : null}
          <Bouton type="submit" className="bouton-large" charge={envoi} icone="envoi">Recevoir mon lien de connexion</Bouton>
        </form>
      ) : (
        <form className="carte formulaire" onSubmit={valider} noValidate>
          <div className="envoye-icone"><Icone nom="envoi" taille={26} /></div>
          <h1 className="titre-carte">Regarde ta boîte mail</h1>
          <p className="texte-doux">
            Un e-mail est parti vers <strong>{email}</strong>. Clique sur son lien depuis cet appareil : ton espace s'ouvre
            directement. Pense à regarder dans les spams.
          </p>
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
          <button type="button" className="lien-discret" onClick={() => { setEnvoye(false); setCode(""); setErreur(null); }}>
            Changer d'adresse ou renvoyer le lien
          </button>
        </form>
      )}
    </div>
  );
}
