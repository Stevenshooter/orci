// Le compte du spectateur : la porte de connexion (avant de regarder une
// vidéo, et sur la page Profil) et la page Profil elle-même.
//
// Deux chemins : Google en un clic, ou une adresse e-mail et un mot de passe,
// sans e-mail à confirmer. Si Google refuse de s'ouvrir dans le navigateur
// d'une appli, l'e-mail marche partout.

import { useEffect, useState } from "react";
import {
  comptesActifs,
  connexionEmail,
  connexionGoogle,
  deconnexionCompte,
  inscriptionEmail,
  initiales,
  motDePasseOublie,
  synchroniserCompte,
  useCompte,
  useRetourGoogle,
} from "../../lib/compte.js";
import { date, lienWhatsApp } from "../../lib/format.js";
import { Lien } from "../../lib/routeur.jsx";
import { navigateurIntegre } from "../../lib/navigateur.js";
import { Bouton, Champ, Chargement, Icone, LienBouton, Message, useDonnees, useTitre } from "../../ui.jsx";
import { BoutonPremium, chargerCatalogue, Coquille, ErreurChargement, jetonPremium, PageChargement, prixPremium, useVue } from "./commun.jsx";
import { MonAcces } from "./Perso.jsx";

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * La porte de connexion. Une fois connecté, le compte change partout (le
 * lecteur repart tout seul) : la porte n'a rien d'autre à faire.
 */
export function PorteCompte({ titre, texte }) {
  const [mode, setMode] = useState("choix"); // choix, creer, connexion, oubli
  const [f, setF] = useState({ prenom: "", email: "", motDePasse: "" });
  const [etat, setEtat] = useState({ envoi: null, erreur: null, info: null });
  const [voir, setVoir] = useState(false);
  const appli = navigateurIntegre();
  const retour = useRetourGoogle();
  const maj = (champ) => (e) => setF((x) => ({ ...x, [champ]: e.target.value }));
  const aller = (m) => {
    setMode(m);
    setEtat({ envoi: null, erreur: null, info: null });
  };

  async function google() {
    setEtat({ envoi: "google", erreur: null, info: null });
    try {
      await connexionGoogle();
    } catch (e) {
      setEtat({ envoi: null, erreur: e.message, info: null });
    }
  }

  async function envoyer(e) {
    e.preventDefault();
    const email = f.email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setEtat({ envoi: null, erreur: "Écris ton adresse e-mail.", info: null });
      return;
    }
    setEtat({ envoi: "email", erreur: null, info: null });
    try {
      if (mode === "oubli") {
        await motDePasseOublie(email);
        setEtat({ envoi: null, erreur: null, info: "C'est parti : un e-mail pour choisir un nouveau mot de passe arrive dans ta boîte." });
        return;
      }
      if (f.motDePasse.length < 6) {
        setEtat({ envoi: null, erreur: "Ton mot de passe doit faire 6 caractères au moins.", info: null });
        return;
      }
      if (mode === "creer") await inscriptionEmail(email, f.motDePasse, f.prenom);
      else await connexionEmail(email, f.motDePasse);
    } catch (err) {
      setEtat({ envoi: null, erreur: err.message, info: null });
    }
  }

  if (retour.enCours) {
    return (
      <div className="porte">
        <Chargement texte="Connexion avec Google…" />
      </div>
    );
  }

  return (
    <div className="porte">
      {titre ? <p className="porte-titre">{titre}</p> : null}
      {texte ? <p className="porte-texte">{texte}</p> : null}
      {retour.erreur ? <p className="porte-erreur" role="alert">{retour.erreur}</p> : null}

      {mode === "choix" ? (
        <div className="porte-choix">
          <button type="button" className="bouton bouton-google bouton-large" onClick={google} disabled={Boolean(etat.envoi)}>
            {etat.envoi === "google" ? <span className="roue" aria-hidden="true" /> : <LogoGoogle />}
            <span>Continuer avec Google</span>
          </button>
          <p className="porte-ou">
            <span>ou</span>
          </p>
          <Bouton variante="discret" icone="envoi" className="bouton-large" onClick={() => aller("creer")}>
            Continuer avec mon e-mail
          </Bouton>
          <p className="porte-petit">
            Déjà inscrit avec ton e-mail ?{" "}
            <button type="button" className="porte-lien" onClick={() => aller("connexion")}>
              Connecte-toi
            </button>
          </p>
          {appli ? <p className="porte-petit">Si Google ne s'ouvre pas dans {appli}, passe par ton e-mail : ça marche partout.</p> : null}
        </div>
      ) : (
        <form className="porte-formulaire" onSubmit={envoyer} noValidate>
          <p className="porte-sous-titre">
            {mode === "creer" ? "Crée ton compte" : mode === "connexion" ? "Connecte-toi" : "Mot de passe oublié"}
          </p>
          {mode === "creer" ? (
            <Champ etiquette="Prénom" id="porte-prenom" value={f.prenom} onChange={maj("prenom")} autoComplete="given-name" maxLength={40} />
          ) : null}
          <Champ
            etiquette="Adresse e-mail"
            id="porte-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={f.email}
            onChange={maj("email")}
            maxLength={254}
          />
          {mode !== "oubli" ? (
            <Champ
              etiquette="Mot de passe"
              id="porte-mdp"
              type={voir ? "text" : "password"}
              autoComplete={mode === "creer" ? "new-password" : "current-password"}
              value={f.motDePasse}
              onChange={maj("motDePasse")}
              aide={mode === "creer" ? "6 caractères au moins. Aucun e-mail à confirmer." : undefined}
            />
          ) : null}
          {mode !== "oubli" ? (
            <label className="porte-voir">
              <input type="checkbox" checked={voir} onChange={(e) => setVoir(e.target.checked)} /> Afficher le mot de passe
            </label>
          ) : null}
          <Bouton type="submit" className="bouton-large" charge={etat.envoi === "email"}>
            {mode === "creer" ? "Créer mon compte" : mode === "connexion" ? "Me connecter" : "Recevoir l'e-mail"}
          </Bouton>
          <div className="porte-liens">
            {mode === "creer" ? (
              <button type="button" className="porte-lien" onClick={() => aller("connexion")}>
                J'ai déjà un compte
              </button>
            ) : mode === "connexion" ? (
              <>
                <button type="button" className="porte-lien" onClick={() => aller("creer")}>
                  Créer un compte
                </button>
                <button type="button" className="porte-lien" onClick={() => aller("oubli")}>
                  Mot de passe oublié ?
                </button>
              </>
            ) : (
              <button type="button" className="porte-lien" onClick={() => aller("connexion")}>
                Revenir à la connexion
              </button>
            )}
            <button type="button" className="porte-lien" onClick={() => aller("choix")}>
              Continuer avec Google
            </button>
          </div>
        </form>
      )}

      {etat.erreur ? (
        <p className="porte-erreur" role="alert">
          {etat.erreur}
        </p>
      ) : null}
      {etat.info ? (
        <p className="porte-info" role="status">
          {etat.info}
        </p>
      ) : null}
    </div>
  );
}

/** La page Profil : le compte, le Premium, la déconnexion. Sans comptes branchés : « Mon accès ». */
export function Profil() {
  if (!comptesActifs()) return <MonAcces />;
  return <ProfilCompte />;
}

function ProfilCompte() {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  const compte = useCompte();
  const [infos, setInfos] = useState(null);
  useTitre("Mon profil · Orci");
  useVue(c?.premium?.id);

  useEffect(() => {
    if (!compte) {
      setInfos(null);
      return undefined;
    }
    let fini = false;
    synchroniserCompte()
      .then((r) => !fini && setInfos(r ?? { premium: null }))
      .catch(() => !fini && setInfos({ premium: null, erreur: true }));
    return () => {
      fini = true;
    };
  }, [compte?.uid]);

  if (charge && !c) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const { premium, formateur } = c;
  const jeton = jetonPremium(premium);
  const passe = infos?.premium;
  const actif = passe && passe.statut === "actif" && (!passe.fin || new Date(passe.fin).getTime() > Date.now());

  return (
    <Coquille actif="/profil" premium={premium} jeton={jeton}>
      <section className="intro">
        <h1 className="intro-titre">Mon profil</h1>
        <p className="intro-texte">Ton compte garde tes séries et ton Premium, sur tous tes téléphones.</p>
      </section>

      {compte ? (
        <>
          <section className="carte profil-carte">
            <span className="profil-avatar" aria-hidden="true">
              {initiales(compte)}
            </span>
            <div className="profil-identite">
              <p className="profil-nom">{compte.nom || "Spectateur Orci"}</p>
              {compte.email ? <p className="texte-doux petit">{compte.email}</p> : null}
              <p className="texte-doux petit">{compte.fournisseur === "google.com" ? "Connecté avec Google" : "Connecté avec ton e-mail"}</p>
            </div>
          </section>

          <section className="carte pile">
            <h2 className="titre-carte">Premium</h2>
            {!infos ? (
              <Chargement texte="On regarde ton Premium…" />
            ) : actif ? (
              <>
                <p>
                  <strong>Ton Premium est actif</strong>
                  {passe.fin ? ` jusqu'au ${date(passe.fin)}` : ""}. Toutes les suites sont ouvertes.
                </p>
                <div className="rangee">
                  <Lien className="bouton bouton-or" href="/">
                    <Icone nom="lecture" taille={18} />
                    <span>Regarder les séries</span>
                  </Lien>
                  <Lien className="bouton bouton-discret" href={`/acces/${passe.jeton}`}>
                    Mon lien d'accès
                  </Lien>
                </div>
              </>
            ) : (
              <>
                <p className="texte-doux">
                  {passe ? "Ton passe Premium est terminé." : "Pas encore de Premium sur ce compte."} Un paiement Mobile Money ouvre toutes les suites.
                </p>
                {premium ? (
                  <BoutonPremium premium={premium} depuis="/profil" className="bouton-large">
                    {passe ? "Renouveler" : "Activer le passe"} · {prixPremium(premium)}
                  </BoutonPremium>
                ) : null}
              </>
            )}
          </section>

          <div>
            <Bouton variante="discret" icone="sortie" onClick={() => deconnexionCompte()}>
              Se déconnecter
            </Bouton>
          </div>
        </>
      ) : (
        <>
          <section className="carte">
            <PorteCompte titre="Connecte-toi" texte="Retrouve tes séries, où tu en étais, et ton Premium sur tous tes téléphones." />
          </section>
          <AidePaiementSansCompte formateur={formateur} />
        </>
      )}
    </Coquille>
  );
}

function AidePaiementSansCompte({ formateur }) {
  const contact = formateur?.whatsapp
    ? lienWhatsApp(formateur.whatsapp, "Bonjour, j'ai payé le Premium Orci mais je n'ai plus mon lien d'accès.")
    : null;
  return (
    <Message type="info" titre="Tu as payé le Premium sans compte ?">
      Ouvre le lien d'accès reçu après ton paiement, puis connecte-toi : ton Premium sera rangé dans ton compte.{" "}
      {contact ? (
        <LienBouton variante="discret" icone="bulle" href={contact} target="_blank" rel="noopener noreferrer">
          Je n'ai plus mon lien
        </LienBouton>
      ) : null}
    </Message>
  );
}
