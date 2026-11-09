// « Mes accès » : la page que l'acheteur garde. Son lien secret est sa clé.

import { useEffect, useState } from "react";
import { date, dateHeure, lienWhatsApp } from "../lib/format.js";
import { Lien } from "../lib/routeur.jsx";
import { fonction } from "../lib/supa.js";
import { retenirAcces } from "../lib/visiteur.js";
import { Bouton, Champ, Chargement, Copier, Icone, ICONE_OUTIL, LienBouton, Message, useDonnees, useTitre } from "../ui.jsx";

export default function Acces({ jeton }) {
  const { donnees: vue, erreur, charge, recharger, remplacer } = useDonnees(
    () => fonction("acces", { action: "voir", jeton }),
    [jeton],
  );
  useTitre(vue ? `Mes accès · ${vue.offre?.titre}` : "Mes accès");

  useEffect(() => {
    if (vue?.offre?.slug) retenirAcces(vue.offre.slug, jeton);
  }, [vue?.offre?.slug, jeton]);

  // Au retour de Telegram ou de WhatsApp, la page se met à jour d'elle-même.
  useEffect(() => {
    const f = () => {
      if (!document.hidden) recharger({ silencieux: true });
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [recharger]);

  if (charge && !vue) return <div className="page page-centree"><Chargement texte="Ouverture de tes accès…" /></div>;
  if (erreur && !vue) {
    return (
      <div className="page page-etroite">
        <Message type="erreur" titre={erreur.statut === 404 ? "Ce lien d'accès n'est pas valable." : "Tes accès n'ont pas pu s'ouvrir."}>
          {erreur.statut === 404
            ? "Vérifie que le lien est complet. Si tu l'as perdu, écris au formateur : il peut te le renvoyer."
            : erreur.message}
        </Message>
      </div>
    );
  }

  const { acheteur, offre, acces, outils } = vue;
  const actif = acces.statut === "actif";
  const besoinEmail = actif && outils.some((o) => o.type === "drive" || o.type === "meet");
  const manqueEmail = outils.some((o) => o.etat === "email");
  const formateur = offre.formateur || {};
  const adresse = `${window.location.origin}/acces/${jeton}`;
  const contact = formateur.whatsapp
    ? lienWhatsApp(formateur.whatsapp, `Bonjour, j'ai acheté « ${offre.titre} » sur Orci. J'ai besoin d'aide pour mes accès.`)
    : null;

  return (
    <div className="page page-etroite acces">
      <header className="acces-entete">
        <p className="surtitre">Mes accès</p>
        <h1>{acheteur.prenom ? `Bienvenue, ${acheteur.prenom}` : "Bienvenue"}</h1>
        <p className="acces-offre">{offre.titre}</p>
        {acces.fin && actif ? <p className="acces-fin">Accès ouvert jusqu'au {date(acces.fin)}</p> : null}
      </header>

      {!actif ? (
        <Message
          type="attention"
          titre={acces.statut === "expire" ? "Ton accès est arrivé à sa fin." : "Cet accès a été fermé."}
          action={acces.statut === "expire" && offre.slug ? <Lien className="bouton bouton-or" href={`/o/${offre.slug}/paiement`}>Renouveler mon accès</Lien> : null}
        >
          {acces.statut === "expire"
            ? `Il a pris fin le ${date(acces.fin)}.`
            : "Si c'est une erreur, écris au formateur."}
        </Message>
      ) : null}

      <section className="carte garde-lien">
        <div className="garde-lien-tete">
          <Icone nom="cadenas" taille={20} />
          <p><strong>Garde ce lien :</strong> c'est ta clé d'accès, sur n'importe quel téléphone.</p>
        </div>
        <div className="rangee">
          <Copier texte={adresse}>Copier le lien</Copier>
          <LienBouton
            variante="discret"
            icone="envoi"
            href={lienWhatsApp("", `Mes accès à « ${offre.titre} » : ${adresse}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Me l'envoyer sur WhatsApp
          </LienBouton>
        </div>
      </section>

      {besoinEmail ? (
        <AdresseGoogle jeton={jeton} email={acheteur.email} manque={manqueEmail} onVue={remplacer} />
      ) : null}

      <ul className="outils-acheteur">
        {outils.map((o) => (
          <li key={o.type}>
            <CarteOutil outil={o} jeton={jeton} onRecharger={() => recharger({ silencieux: true })} />
          </li>
        ))}
      </ul>

      {contact ? (
        <p className="acces-aide">
          Un souci ? <a href={contact} target="_blank" rel="noopener noreferrer">Écris à {formateur.nom} sur WhatsApp</a>
        </p>
      ) : null}
    </div>
  );
}

function AdresseGoogle({ jeton, email, manque, onVue }) {
  const [edition, setEdition] = useState(!email);
  const [valeur, setValeur] = useState(email || "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  async function enregistrer(e) {
    e.preventDefault();
    setErreur(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valeur.trim())) {
      setErreur("Cette adresse ne semble pas valide.");
      return;
    }
    setEnvoi(true);
    try {
      const vue = await fonction("acces", { action: "email", jeton, email: valeur.trim().toLowerCase() });
      onVue(vue);
      setEdition(false);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!edition) {
    return (
      <section className="carte adresse-google">
        <p className="adresse-google-texte">
          <Icone nom="coche" taille={18} /> Dossier et invitations envoyés à <strong>{email}</strong>
        </p>
        <button className="lien-discret" type="button" onClick={() => setEdition(true)}>Changer d'adresse</button>
      </section>
    );
  }

  return (
    <form className={`carte adresse-google ${manque ? "adresse-manquante" : ""}`} onSubmit={enregistrer} noValidate>
      <p className="titre-carte">Ton adresse Gmail</p>
      <p className="adresse-google-texte">
        Le dossier des vidéos et les invitations aux lives sont partagés avec un compte Google. Donne l'adresse Gmail que
        tu utilises sur ton téléphone.
      </p>
      <Champ
        etiquette="Adresse Gmail"
        id="email-google"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="toncompte@gmail.com"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        erreur={erreur}
      />
      <div className="rangee">
        <Bouton type="submit" charge={envoi}>Recevoir le dossier et les lives</Bouton>
        {email ? <Bouton type="button" variante="discret" onClick={() => { setEdition(false); setValeur(email); }}>Annuler</Bouton> : null}
      </div>
    </form>
  );
}

const PUCES = {
  dedans: ["succes", "Tu es dedans"],
  valide: ["succes", "Accepté"],
  partage: ["succes", "Partagé"],
  invite: ["succes", "Invité"],
  pret: ["succes", "Prêt"],
  rejoindre: ["or", "À rejoindre"],
  en_attente: ["or", "À demander"],
  email: ["or", "Adresse Gmail requise"],
  en_cours: ["neutre", "En cours"],
  bientot: ["neutre", "Bientôt"],
  erreur: ["alerte", "Retardé"],
  fini: ["neutre", "Terminé"],
};

function CarteOutil({ outil, jeton, onRecharger }) {
  const [puceType, puceTexte] = PUCES[outil.etat] || ["neutre", ""];
  return (
    <article className={`carte outil-acheteur etat-${outil.etat}`}>
      <header className="outil-tete">
        <span className={`recu-icone recu-${outil.type}`}><Icone nom={ICONE_OUTIL[outil.type]} taille={22} /></span>
        <div className="outil-tete-texte">
          <h2>{outil.titre}</h2>
          {puceTexte ? <span className={`puce puce-${puceType}`}>{puceTexte}</span> : null}
        </div>
      </header>
      <div className="outil-corps">
        <CorpsOutil outil={outil} jeton={jeton} onRecharger={onRecharger} />
      </div>
    </article>
  );
}

function CorpsOutil({ outil, jeton, onRecharger }) {
  if (outil.etat === "fini") return <p>Cet accès est terminé.</p>;

  switch (outil.type) {
    case "telegram":
      return <Telegram outil={outil} jeton={jeton} onRecharger={onRecharger} />;

    case "whatsapp":
      if (outil.etat === "bientot") return <p>Le groupe ouvre bientôt. Reviens sur cette page dans un moment.</p>;
      if (outil.etat === "valide") {
        return (
          <>
            <p>Le formateur a accepté ta demande : retrouve le groupe dans tes discussions WhatsApp.</p>
            <LienBouton variante="discret" href={outil.lien} target="_blank" rel="noopener noreferrer" icone="bulle">Ouvrir le groupe</LienBouton>
          </>
        );
      }
      return (
        <>
          <LienBouton href={outil.lien} target="_blank" rel="noopener noreferrer" icone="bulle">Demander à rejoindre</LienBouton>
          <p className="note">
            Demande depuis le WhatsApp de ton numéro de paiement : le formateur accepte les numéros qui ont payé. Il peut
            mettre un peu de temps à valider.
          </p>
        </>
      );

    case "drive":
      if (outil.etat === "bientot") return <p>Le dossier des vidéos arrive bientôt. Reviens sur cette page dans un moment.</p>;
      if (outil.etat === "email") return <p>Donne ton adresse Gmail plus haut pour recevoir le dossier.</p>;
      if (outil.etat === "en_cours") return <p>Partage en cours vers {outil.email}…</p>;
      if (outil.etat === "erreur") {
        return <p>Le partage n'a pas encore marché. Il sera retenté automatiquement dans l'heure. Si ça dure, écris au formateur.</p>;
      }
      return (
        <>
          {outil.url ? <LienBouton href={outil.url} target="_blank" rel="noopener noreferrer" icone="dossier">Ouvrir le dossier</LienBouton> : null}
          <p className="note">Partagé avec {outil.email}. Ouvre-le avec ce compte Google : Google te l'a aussi envoyé par e-mail.</p>
        </>
      );

    case "meet":
      return <Lives outil={outil} />;

    case "lien":
      if (!outil.url) return <p>Bientôt disponible.</p>;
      return <LienBouton href={outil.url} target="_blank" rel="noopener noreferrer" icone="lien">Ouvrir</LienBouton>;

    default:
      return null;
  }
}

function Telegram({ outil, jeton, onRecharger }) {
  const [lien, setLien] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  if (outil.etat === "bientot") return <p>Le groupe ouvre bientôt. Reviens sur cette page dans un moment.</p>;
  if (outil.etat === "dedans") return <p>Tu es dans le groupe : retrouve-le dans tes discussions Telegram.</p>;

  async function obtenir() {
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await fonction("acces", { action: "telegram", jeton });
      if (r.deja) onRecharger();
      else setLien(r.lien);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      {lien ? (
        <LienBouton href={lien} target="_blank" rel="noopener noreferrer" icone="avion">Ouvrir Telegram et rejoindre</LienBouton>
      ) : (
        <Bouton onClick={obtenir} charge={envoi} icone="avion">Rejoindre le groupe Telegram</Bouton>
      )}
      <p className="note">Ton lien est personnel : il ne marche qu'une fois, et pendant 24 heures. Il faut l'application Telegram.</p>
      {erreur ? <Message type="erreur">{erreur}</Message> : null}
    </>
  );
}

function Lives({ outil }) {
  const lives = outil.lives || [];
  const maintenant = Date.now();
  return (
    <>
      {outil.etat === "email" ? <p>Donne ton adresse Gmail plus haut pour recevoir les invitations aux lives.</p> : null}
      {outil.etat === "invite" ? (
        <p className="note">Les invitations arrivent sur {outil.email}, dans ton agenda Google.</p>
      ) : null}
      {lives.length ? (
        <ul className="lives">
          {lives.map((l) => {
            const debut = new Date(l.debut).getTime();
            const enDirect = maintenant >= debut - 10 * 60_000 && maintenant <= debut + (l.duree_minutes || 60) * 60_000;
            return (
              <li key={l.id} className={`live ${enDirect ? "en-direct" : ""}`}>
                <div>
                  <p className="live-titre">{enDirect ? <span className="point-direct" aria-hidden="true" /> : null}{l.titre}</p>
                  <p className="live-date"><Icone nom="horloge" taille={15} /> {dateHeure(l.debut)} · {l.duree_minutes}&nbsp;min</p>
                </div>
                {l.meet_url ? (
                  <LienBouton variante={enDirect ? "or" : "discret"} href={l.meet_url} target="_blank" rel="noopener noreferrer">
                    {enDirect ? "Rejoindre maintenant" : "Lien du live"}
                  </LienBouton>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Aucun live programmé pour l'instant. Tu seras invité dès qu'une date est fixée.</p>
      )}
    </>
  );
}
