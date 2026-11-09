// L'espace du propriétaire : connexion, puis tableau de bord, acheteurs, offre
// et outils.

import { createContext, useContext, useEffect, useState } from "react";
import { Lien, naviguer } from "../lib/routeur.jsx";
import { deconnecter, fonction, lire, rpc, sessionActuelle, sessionDepuisAdresse, surSession } from "../lib/supa.js";
import { Bouton, Chargement, Icone, Message, useDonnees } from "../ui.jsx";
import Acheteurs from "./Acheteurs.jsx";
import Connexion from "./Connexion.jsx";
import Offre from "./Offre.jsx";
import Outils from "./Outils.jsx";
import Tableau from "./Tableau.jsx";

// Le lien magique est lu une seule fois : un second rendu ne doit pas le
// chercher dans une adresse déjà nettoyée.
let retourConnexion;
function lireRetourConnexion() {
  if (retourConnexion === undefined) retourConnexion = sessionDepuisAdresse();
  return retourConnexion;
}

function useSession() {
  const [s, setS] = useState(sessionActuelle);
  useEffect(() => surSession(setS), []);
  return s;
}

const ContexteAdmin = createContext(null);

/** L'offre (une seule en V1), son formateur et le mode de paiement. */
export function useAdmin() {
  return useContext(ContexteAdmin);
}

export default function Admin({ chemin }) {
  const [retour, setRetour] = useState(lireRetourConnexion);
  const session = useSession();
  const utilisateur = session?.user?.id ?? null;
  const [proprio, setProprio] = useState({ etat: "attente" });

  // Le lien magique peut aussi revenir dans un onglet déjà ouvert sur Orci :
  // seul le fragment de l'adresse change alors.
  useEffect(() => {
    const f = () => {
      if (/access_token=|error_description=/.test(window.location.hash)) setRetour(sessionDepuisAdresse());
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  useEffect(() => {
    if (!utilisateur) {
      setProprio({ etat: "attente" });
      return undefined;
    }
    let annule = false;
    setProprio({ etat: "attente" });
    rpc("revendiquer_formateur")
      .then((id) => !annule && setProprio(id ? { etat: "ok", id } : { etat: "refuse" }))
      .catch((e) => !annule && setProprio({ etat: "erreur", message: e.message }));
    return () => {
      annule = true;
    };
  }, [utilisateur]);

  useEffect(() => {
    if (session && chemin === "/admin/connexion" && proprio.etat === "ok") naviguer("/admin", { remplacer: true });
  }, [session, chemin, proprio.etat]);

  if (!session) return <Connexion retour={retour} />;

  if (proprio.etat === "attente") return <div className="page page-centree"><Chargement texte="Ouverture de ton espace…" /></div>;

  if (proprio.etat !== "ok") {
    return (
      <div className="page page-etroite">
        <Message
          type="erreur"
          titre={proprio.etat === "refuse" ? "Ce compte n'est pas le propriétaire de cet Orci." : "Ton espace n'a pas pu s'ouvrir."}
          action={<Bouton variante="discret" icone="sortie" onClick={() => deconnecter()}>Changer de compte</Bouton>}
        >
          {proprio.etat === "refuse"
            ? `Tu es connecté avec ${session.user?.email ?? "un autre compte"}. Reconnecte-toi avec l'adresse du propriétaire.`
            : proprio.message}
        </Message>
      </div>
    );
  }

  return <EspaceProprietaire chemin={chemin} email={session.user?.email} />;
}

function EspaceProprietaire({ chemin, email }) {
  const donnees = useDonnees(async () => {
    const [offres, formateurs] = await Promise.all([
      lire("offres?select=*&order=created_at.asc&limit=1"),
      lire("formateurs?select=*&limit=1"),
    ]);
    return { offre: offres[0] ?? null, formateur: formateurs[0] ?? null };
  }, []);
  const mode = useDonnees(() => fonction("paiement", { action: "mode" }).then((r) => r.mode).catch(() => "simulation"), []);

  const page = {
    "/admin": Tableau,
    "/admin/connexion": Tableau,
    "/admin/acheteurs": Acheteurs,
    "/admin/offre": Offre,
    "/admin/outils": Outils,
  }[chemin.replace(/\/+$/, "") || "/admin"];

  const onglets = [
    ["/admin", "Tableau", "graphique"],
    ["/admin/acheteurs", "Acheteurs", "personnes"],
    ["/admin/offre", "Offre", "crayon"],
    ["/admin/outils", "Outils", "engrenage"],
  ];
  const actif = chemin === "/admin/connexion" ? "/admin" : chemin.replace(/\/+$/, "");

  return (
    <ContexteAdmin.Provider value={{ ...(donnees.donnees ?? {}), recharger: donnees.recharger, mode: mode.donnees }}>
      <div className="admin">
        <header className="admin-entete">
          <div className="admin-entete-ligne">
            <Lien href="/admin" className="logo" aria-label="Orci, tableau de bord">
              <span className="logo-marque" aria-hidden="true" />
              Orci
            </Lien>
            <div className="admin-compte">
              {donnees.donnees?.offre?.slug ? (
                <a className="lien-discret" href={`/o/${donnees.donnees.offre.slug}`} target="_blank" rel="noopener noreferrer">
                  <Icone nom="oeil" taille={18} /> <span className="masque-mobile">Voir la page</span>
                </a>
              ) : null}
              <button className="lien-discret" type="button" onClick={() => deconnecter()} title={email ? `Connecté : ${email}` : undefined}>
                <Icone nom="sortie" taille={18} /> <span className="masque-mobile">Déconnexion</span>
              </button>
            </div>
          </div>
          <nav className="onglets" aria-label="Espace admin">
            {onglets.map(([href, texte, icone]) => (
              <Lien key={href} href={href} className={`onglet ${actif === href ? "actif" : ""}`} aria-current={actif === href ? "page" : undefined}>
                <Icone nom={icone} taille={18} />
                <span>{texte}</span>
              </Lien>
            ))}
          </nav>
        </header>

        {mode.donnees === "simulation" ? (
          <div className="bandeau-test bandeau-admin" role="note">
            <Icone nom="info" taille={18} />
            <span>
              Mode test : toi seul peux acheter, avec un paiement simulé. Les visiteurs lisent « Les paiements ouvrent
              bientôt ». Le vrai paiement s'activera avec Nexus Pay.
            </span>
          </div>
        ) : null}

        <main className="admin-contenu">
          {donnees.charge && !donnees.donnees ? (
            <Chargement />
          ) : donnees.erreur ? (
            <Message type="erreur" titre="Les données n'ont pas pu se charger." action={<Bouton variante="discret" onClick={() => donnees.recharger()}>Réessayer</Bouton>}>
              {donnees.erreur.message}
            </Message>
          ) : !donnees.donnees?.offre ? (
            <Message type="info" titre="Aucune offre pour l'instant.">Crée l'offre de ta formation dans la base pour commencer.</Message>
          ) : page ? (
            (() => {
              const Page = page;
              return <Page />;
            })()
          ) : (
            <Message type="info" titre="Cette page n'existe pas.">
              <Lien href="/admin">Revenir au tableau de bord</Lien>
            </Message>
          )}
        </main>
      </div>
    </ContexteAdmin.Provider>
  );
}
