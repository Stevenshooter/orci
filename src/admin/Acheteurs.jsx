// Les acheteurs : qui est dedans, ce qui reste à faire à la main (WhatsApp),
// et les paiements restés en route, à relancer.

import { useMemo, useState } from "react";
import { date, depuis, fcfa, lienWhatsApp, prenom, telephone } from "../lib/format.js";
import { useAdresse } from "../lib/routeur.jsx";
import { fonction, rpc } from "../lib/supa.js";
import { Bouton, Chargement, Confirmer, Copier, Icone, ICONE_OUTIL, LienBouton, Message, useDonnees, useTitre } from "../ui.jsx";
import { useAdmin } from "./Admin.jsx";

const NOM_OUTIL = { telegram: "Telegram", whatsapp: "WhatsApp", drive: "Drive", meet: "Meet", lien: "Lien" };

const ETAT_LIVRAISON = {
  telegram: { a_faire: ["neutre", "pas encore entré"], fait: ["succes", "dans le groupe"] },
  whatsapp: { a_faire: ["or", "à accepter"], fait: ["succes", "accepté"], a_retirer: ["alerte", "à retirer"] },
  drive: { a_faire: ["neutre", "en attente du Gmail"], fait: ["succes", "partagé"] },
  meet: { a_faire: ["neutre", "en attente du Gmail"], fait: ["succes", "invité"] },
  lien: { fait: ["succes", "ouvert"] },
};

function etatLivraison(l) {
  if (l.statut === "erreur") return ["alerte", "erreur"];
  if (l.statut === "retire") return ["neutre", "retiré"];
  return ETAT_LIVRAISON[l.type]?.[l.statut] ?? ["neutre", l.statut];
}

const FILTRES = [
  ["tous", "Tous"],
  ["whatsapp", "WhatsApp à accepter"],
  ["retirer", "À retirer"],
  ["erreurs", "Erreurs"],
  ["test", "Test"],
];

function filtrer(m, filtre) {
  switch (filtre) {
    case "whatsapp":
      return m.statut === "actif" && m.livraisons.some((l) => l.type === "whatsapp" && l.statut === "a_faire");
    case "retirer":
      return m.livraisons.some((l) => l.statut === "a_retirer");
    case "erreurs":
      return m.livraisons.some((l) => l.statut === "erreur");
    case "test":
      return Boolean(m.commande?.test);
    default:
      return true;
  }
}

export default function Acheteurs() {
  useTitre("Acheteurs · Orci");
  const { offre } = useAdmin();
  const { recherche } = useAdresse();
  const [filtre, setFiltre] = useState(() => new URLSearchParams(recherche).get("filtre") || "tous");
  const [texte, setTexte] = useState("");
  const liste = useDonnees(() => rpc("liste_acheteurs"), []);

  const membres = liste.donnees?.membres ?? [];
  const relances = liste.donnees?.relances ?? [];
  const comptes = useMemo(() => Object.fromEntries(FILTRES.map(([id]) => [id, membres.filter((m) => filtrer(m, id)).length])), [membres]);
  const visibles = useMemo(() => {
    const t = texte.trim().toLowerCase();
    const chiffres = t.replace(/\D/g, "");
    return membres.filter((m) => {
      if (!filtrer(m, filtre)) return false;
      if (!t) return true;
      const a = m.acheteur || {};
      return (
        a.nom?.toLowerCase().includes(t) ||
        a.email?.toLowerCase().includes(t) ||
        (chiffres.length >= 3 && a.telephone?.includes(chiffres))
      );
    });
  }, [membres, filtre, texte]);

  if (liste.charge && !liste.donnees) return <Chargement />;
  if (liste.erreur && !liste.donnees) {
    return <Message type="erreur" titre="La liste n'a pas pu se charger." action={<Bouton variante="discret" onClick={() => liste.recharger()}>Réessayer</Bouton>}>{liste.erreur.message}</Message>;
  }

  return (
    <div className="pile-grande">
      <div className="tete-page">
        <div>
          <h1>Acheteurs</h1>
          <p className="texte-doux">{membres.length} accès · {relances.length} paiement{relances.length > 1 ? "s" : ""} à relancer</p>
        </div>
        <Bouton variante="discret" icone="rafraichir" onClick={() => liste.recharger({ silencieux: true })}>Actualiser</Bouton>
      </div>

      <div className="filtres">
        <div className="puces-filtre" role="group" aria-label="Filtrer">
          {FILTRES.map(([id, nom]) => (
            <button
              key={id}
              type="button"
              className={`puce-filtre ${filtre === id ? "actif" : ""}`}
              aria-pressed={filtre === id}
              onClick={() => setFiltre(id)}
              disabled={id !== "tous" && !comptes[id] && filtre !== id}
            >
              {nom} <span className="compte">{comptes[id]}</span>
            </button>
          ))}
        </div>
        <input
          className="recherche"
          type="search"
          placeholder="Nom, numéro ou e-mail"
          aria-label="Rechercher un acheteur"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
        />
      </div>

      {filtre === "whatsapp" && comptes.whatsapp ? (
        <Message type="info" titre="Accepter dans le groupe WhatsApp">
          Ouvre les demandes d'adhésion du groupe, accepte les numéros listés ici, puis clique « Accepté » sous chacun.
        </Message>
      ) : null}

      {visibles.length ? (
        <ul className="membres">
          {visibles.map((m) => (
            <li key={m.id}>
              <CarteMembre membre={m} recharger={() => liste.recharger({ silencieux: true })} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide">{membres.length ? "Personne ne correspond à ce filtre." : "Pas encore d'acheteur. Ils apparaîtront ici dès le premier paiement."}</p>
      )}

      {relances.length ? (
        <section className="pile">
          <h2>Paiements à relancer</h2>
          <p className="texte-doux">Ils ont lancé un paiement sans le terminer ces 30 derniers jours. Un message suffit souvent.</p>
          <ul className="relances">
            {relances.map((r) => (
              <li key={r.reference} className="carte relance">
                <div>
                  <p className="membre-nom">{r.nom} {r.test ? <span className="puce puce-neutre">test</span> : null}</p>
                  <p className="texte-doux">
                    {telephone(r.telephone)} · {fcfa(r.montant)} · {r.statut === "en_cours" ? "pas validé" : r.statut === "echec" ? "refusé" : r.statut} · {depuis(r.le)}
                  </p>
                </div>
                <LienBouton
                  variante="discret"
                  icone="bulle"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={lienWhatsApp(
                    r.telephone,
                    `Bonjour ${prenom(r.nom)}, j'ai vu que ton paiement pour « ${r.offre} » n'est pas passé. Je peux t'aider ? Le lien : ${window.location.origin}/o/${offre.slug}`,
                  )}
                >
                  Relancer
                </LienBouton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CarteMembre({ membre: m, recharger }) {
  const [action, setAction] = useState(null);
  const [erreur, setErreur] = useState(null);
  const a = m.acheteur || {};
  const lienAcces = `${window.location.origin}/acces/${m.jeton}`;

  async function agir(nom, f) {
    setAction(nom);
    setErreur(null);
    try {
      await f();
      await recharger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setAction(null);
    }
  }

  const marquer = (l, statut) => agir(`${l.id}-${statut}`, () => rpc("marquer_livraison", { p_livraison: l.id, p_statut: statut }));
  const erreurs = m.livraisons.filter((l) => l.statut === "erreur");

  return (
    <article className={`carte membre statut-${m.statut}`}>
      <header className="membre-tete">
        <div>
          <p className="membre-nom">
            {a.nom}
            {m.commande?.test ? <span className="puce puce-neutre">test</span> : null}
            {m.statut !== "actif" ? <span className="puce puce-alerte">{m.statut === "expire" ? "expiré" : "révoqué"}</span> : null}
          </p>
          <p className="texte-doux">
            <a href={lienWhatsApp(a.telephone)} target="_blank" rel="noopener noreferrer">{telephone(a.telephone)}</a>
            {a.email ? <> · {a.email}</> : null}
          </p>
          <p className="texte-doux petit">
            Depuis le {date(m.depuis)}
            {m.fin ? ` · jusqu'au ${date(m.fin)}` : ""}
            {m.commande?.source ? ` · via ${m.commande.source}` : ""}
            {m.commande?.montant ? ` · ${fcfa(m.commande.montant)}` : ""}
          </p>
        </div>
      </header>

      <ul className="livraisons">
        {m.livraisons.map((l) => {
          const [type, texte] = etatLivraison(l);
          return (
            <li key={l.id} className="livraison">
              <span className="livraison-outil"><Icone nom={ICONE_OUTIL[l.type]} taille={16} /> {NOM_OUTIL[l.type]}</span>
              <span className={`puce puce-${type}`}>{texte}</span>
              {l.type === "whatsapp" && l.statut === "a_faire" && m.statut === "actif" ? (
                <Bouton variante="or" className="bouton-petit" icone="coche" charge={action === `${l.id}-fait`} onClick={() => marquer(l, "fait")}>Accepté</Bouton>
              ) : null}
              {l.statut === "a_retirer" ? (
                <Bouton variante="discret" className="bouton-petit" icone="sortie" charge={action === `${l.id}-retire`} onClick={() => marquer(l, "retire")}>Retiré du groupe</Bouton>
              ) : null}
            </li>
          );
        })}
      </ul>

      {erreurs.length ? (
        <div className="membre-erreurs">
          {erreurs.map((l) => (
            <p key={l.id} className="texte-alerte petit"><strong>{NOM_OUTIL[l.type]} :</strong> {l.erreur}</p>
          ))}
          <Bouton variante="discret" className="bouton-petit" icone="rafraichir" charge={action === "rejouer"} onClick={() => agir("rejouer", () => fonction("expirations", { action: "rejouer", acces_id: m.id }, { admin: true }))}>
            Réessayer maintenant
          </Bouton>
        </div>
      ) : null}

      {erreur ? <Message type="erreur">{erreur}</Message> : null}

      <footer className="membre-actions">
        <Copier texte={lienAcces} className="bouton-petit">Lien d'accès</Copier>
        <LienBouton
          variante="discret"
          className="bouton-petit"
          icone="bulle"
          target="_blank"
          rel="noopener noreferrer"
          href={lienWhatsApp(a.telephone, `Bonjour ${prenom(a.nom)}, voici ton lien d'accès à la formation : ${lienAcces}\nGarde-le bien, c'est ta clé.`)}
        >
          Lui envoyer
        </LienBouton>
        {m.statut === "actif" ? (
          <Confirmer
            question={`Fermer l'accès de ${a.nom} ? Il sort de Telegram, perd le dossier Drive et les lives.`}
            libelle="Révoquer"
            charge={action === "revoquer"}
            onConfirmer={() => agir("revoquer", () => fonction("expirations", { action: "revoquer", acces_id: m.id }, { admin: true }))}
          >
            {(ouvrir) => <Bouton variante="discret" className="bouton-petit bouton-texte-alerte" icone="cadenas" onClick={ouvrir}>Révoquer</Bouton>}
          </Confirmer>
        ) : null}
      </footer>
    </article>
  );
}
