// Le tableau de bord : ce que la page de vente rapporte, d'où viennent les
// acheteurs, et ce qui attend le formateur.

import { useState } from "react";
import { dateCourte, fcfa, nombre, pourcent } from "../lib/format.js";
import { Lien } from "../lib/routeur.jsx";
import { fonction, lire, rpc } from "../lib/supa.js";
import { Bouton, Chargement, Confirmer, Copier, Icone, Message, useDonnees, useTitre } from "../ui.jsx";
import { useAdmin } from "./Admin.jsx";

const PERIODES = [7, 30, 90];
const SOURCES_RAPIDES = [
  ["tiktok", "TikTok"],
  ["whatsapp", "WhatsApp"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["telegram", "Telegram"],
];

export default function Tableau() {
  useTitre("Tableau de bord · Orci");
  const { offre } = useAdmin();
  const [jours, setJours] = useState(30);
  const stats = useDonnees(() => rpc("stats_tableau", { p_jours: jours }), [jours]);
  const preparation = useDonnees(async () => {
    const [outils, lives] = await Promise.all([
      lire(`outils?select=type,config,actif&offre_id=eq.${offre.id}`),
      lire(`lives?select=id&offre_id=eq.${offre.id}&debut=gte.${new Date().toISOString()}`),
    ]);
    return { outils, lives: lives.length };
  }, [offre.id]);

  const s = stats.donnees;

  return (
    <div className="pile-grande">
      <div className="tete-page">
        <div>
          <h1>Tableau de bord</h1>
          <p className="texte-doux">{offre.titre}</p>
        </div>
        <div className="segments" role="group" aria-label="Période">
          {PERIODES.map((p) => (
            <button key={p} type="button" className={`segment ${jours === p ? "actif" : ""}`} aria-pressed={jours === p} onClick={() => setJours(p)}>
              {p}&nbsp;j
            </button>
          ))}
        </div>
      </div>

      {preparation.donnees ? <MiseEnPlace outils={preparation.donnees.outils} lives={preparation.donnees.lives} /> : null}

      {stats.erreur ? (
        <Message type="erreur" titre="Les chiffres n'ont pas pu se charger." action={<Bouton variante="discret" onClick={() => stats.recharger()}>Réessayer</Bouton>}>
          {stats.erreur.message}
        </Message>
      ) : !s ? (
        <Chargement />
      ) : (
        <Chiffres s={s} recharger={stats.recharger} charge={stats.charge} />
      )}

      <Partage slug={offre.slug} />
    </div>
  );
}

function Chiffres({ s, recharger, charge }) {
  const ventes = s.ventes - s.ventes_test;
  const revenu = s.revenu - s.revenu_test;
  const aFaire = s.a_faire || {};

  return (
    <div className={`pile-grande ${charge ? "en-rechargement" : ""}`}>
      <div className="tuiles">
        <Tuile etiquette="Revenu" valeur={fcfa(revenu)} detail={`${nombre(ventes)} vente${ventes > 1 ? "s" : ""}`} accent />
        <Tuile etiquette="Visiteurs" valeur={nombre(s.visiteurs)} detail={`${nombre(s.vues)} vue${s.vues > 1 ? "s" : ""} de la page`} />
        <Tuile etiquette="Conversion" valeur={pourcent(ventes, s.visiteurs)} detail="des visiteurs achètent" />
        <Tuile etiquette="Paiements lancés" valeur={nombre(s.tentatives)} detail={`${pourcent(s.ventes, s.tentatives)} aboutissent`} />
        <Tuile etiquette="Membres actifs" valeur={nombre(s.membres_actifs)} detail={s.membres_finis ? `${nombre(s.membres_finis)} accès terminés` : "accès en cours"} />
      </div>

      {s.ventes_test > 0 ? <DonneesTest nombre={s.ventes_test} montant={s.revenu_test} recharger={recharger} /> : null}

      {aFaire.whatsapp_a_valider || aFaire.whatsapp_a_retirer || aFaire.erreurs ? (
        <section className="carte">
          <h2 className="titre-carte">À faire</h2>
          <ul className="a-faire">
            {aFaire.whatsapp_a_valider ? (
              <li>
                <Icone nom="bulle" />
                <span>{aFaire.whatsapp_a_valider} acheteur{aFaire.whatsapp_a_valider > 1 ? "s" : ""} à accepter dans le groupe WhatsApp</span>
                <Lien href="/admin/acheteurs?filtre=whatsapp" className="bouton bouton-discret">Voir</Lien>
              </li>
            ) : null}
            {aFaire.whatsapp_a_retirer ? (
              <li>
                <Icone nom="sortie" />
                <span>{aFaire.whatsapp_a_retirer} membre{aFaire.whatsapp_a_retirer > 1 ? "s" : ""} à retirer du groupe WhatsApp</span>
                <Lien href="/admin/acheteurs?filtre=retirer" className="bouton bouton-discret">Voir</Lien>
              </li>
            ) : null}
            {aFaire.erreurs ? (
              <li>
                <Icone nom="alerte" />
                <span>{aFaire.erreurs} livraison{aFaire.erreurs > 1 ? "s" : ""} en erreur (retentées chaque heure)</span>
                <Lien href="/admin/acheteurs?filtre=erreurs" className="bouton bouton-discret">Voir</Lien>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <div className="graphes">
        <Barres
          titre="Visiteurs par jour"
          serie={s.serie || []}
          valeur={(p) => p.visiteurs}
          bulle={(p) => `${nombre(p.visiteurs)} visiteur${p.visiteurs > 1 ? "s" : ""}`}
          classe="barre-violet"
        />
        <Barres
          titre="Ventes par jour"
          serie={s.serie || []}
          valeur={(p) => p.ventes}
          bulle={(p) => `${nombre(p.ventes)} vente${p.ventes > 1 ? "s" : ""} · ${fcfa(p.revenu)}`}
          classe="barre-or"
          note={s.ventes_test ? "Achats de test compris" : null}
        />
      </div>

      <details className="carte details-chiffres">
        <summary>Voir les chiffres jour par jour</summary>
        <div className="tableau-defile">
          <table className="tableau">
            <thead>
              <tr><th scope="col">Jour</th><th scope="col">Visiteurs</th><th scope="col">Ventes</th><th scope="col">Revenu</th></tr>
            </thead>
            <tbody>
              {[...(s.serie || [])].reverse().map((p) => (
                <tr key={p.jour}>
                  <th scope="row">{dateCourte(p.jour)}</th>
                  <td>{nombre(p.visiteurs)}</td>
                  <td>{nombre(p.ventes)}</td>
                  <td>{fcfa(p.revenu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="carte">
        <h2 className="titre-carte">D'où viennent les acheteurs</h2>
        {s.sources?.length ? (
          <div className="tableau-defile">
            <table className="tableau">
              <thead>
                <tr><th scope="col">Source</th><th scope="col">Visiteurs</th><th scope="col">Ventes</th><th scope="col" className="masque-mobile">Conversion</th><th scope="col">Revenu</th></tr>
              </thead>
              <tbody>
                {s.sources.map((x) => (
                  <tr key={x.source}>
                    <th scope="row">{x.source === "direct" ? "Accès direct" : x.source}</th>
                    <td>{nombre(x.visiteurs)}</td>
                    <td>{nombre(x.ventes)}</td>
                    <td className="masque-mobile">{pourcent(x.ventes, x.visiteurs)}</td>
                    <td>{fcfa(x.revenu)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="texte-doux">Pas encore de visite sur la période. Partage tes liens ci-dessous pour savoir d'où viennent tes acheteurs.</p>
        )}
      </section>
    </div>
  );
}

function Tuile({ etiquette, valeur, detail, accent }) {
  return (
    <div className={`tuile ${accent ? "tuile-accent" : ""}`}>
      <p className="tuile-etiquette">{etiquette}</p>
      <p className="tuile-valeur">{valeur}</p>
      {detail ? <p className="tuile-detail">{detail}</p> : null}
    </div>
  );
}

function Barres({ titre, serie, valeur, bulle, classe, note }) {
  const [survol, setSurvol] = useState(null);
  const max = Math.max(1, ...serie.map(valeur));
  const total = serie.reduce((t, p) => t + valeur(p), 0);
  const point = survol != null ? serie[survol] : null;
  const n = serie.length || 1;

  return (
    <figure className="carte graphe">
      <figcaption className="graphe-titre">
        <span>{titre}</span>
        <span className="graphe-total">{nombre(total)} au total</span>
      </figcaption>
      <div className="graphe-zone" onMouseLeave={() => setSurvol(null)}>
        <div className="graphe-axe" aria-hidden="true">
          <span>{nombre(max)}</span>
          <span>0</span>
        </div>
        <div className="graphe-barres" role="list" aria-label={`${titre} : ${nombre(total)} sur ${serie.length} jours`}>
          {serie.map((p, i) => {
            const v = valeur(p);
            return (
              <button
                key={p.jour}
                type="button"
                role="listitem"
                className={`graphe-colonne ${survol === i ? "survol" : ""}`}
                onMouseEnter={() => setSurvol(i)}
                onFocus={() => setSurvol(i)}
                onBlur={() => setSurvol(null)}
                aria-label={`${dateCourte(p.jour)} : ${bulle(p)}`}
              >
                <span className={`graphe-barre ${classe}`} style={{ height: v ? `max(3px, ${(100 * v) / max}%)` : 0 }} />
              </button>
            );
          })}
        </div>
        {point ? (
          <div className="graphe-bulle" style={{ left: `calc(2.5rem + (100% - 2.5rem) * ${(survol + 0.5) / n})` }} role="status">
            <strong>{dateCourte(point.jour)}</strong>
            <span>{bulle(point)}</span>
          </div>
        ) : null}
      </div>
      <div className="graphe-dates" aria-hidden="true">
        <span>{serie[0] ? dateCourte(serie[0].jour) : ""}</span>
        <span>{serie.length ? dateCourte(serie[serie.length - 1].jour) : ""}</span>
      </div>
      {note ? <p className="graphe-note">{note}</p> : null}
    </figure>
  );
}

function DonneesTest({ nombre: n, montant, recharger }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);

  async function effacer() {
    setEnvoi(true);
    setErreur(null);
    try {
      // D'abord sortir les acheteurs de test des groupes et du dossier, puis
      // effacer les lignes : une ligne supprimée ne retire personne de Telegram.
      await fonction("expirations", { action: "nettoyer_tests" }, { admin: true });
      const effacees = await rpc("effacer_donnees_test");
      setFait(effacees);
      recharger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="carte carte-test">
      <div className="carte-test-texte">
        <p className="titre-carte">Achats de test</p>
        <p className="texte-doux">
          {n} achat{n > 1 ? "s" : ""} de test ({fcfa(montant)}) sur la période. Ils ne comptent pas dans le revenu. Avant de
          lancer la vente, efface-les : leurs accès sont refermés et les lignes supprimées.
        </p>
        {fait != null ? <p className="texte-succes">{fait} paiement{fait > 1 ? "s" : ""} de test effacé{fait > 1 ? "s" : ""}.</p> : null}
        {erreur ? <Message type="erreur">{erreur}</Message> : null}
      </div>
      <Confirmer question="Effacer tous les achats de test et fermer leurs accès ?" libelle="Oui, effacer" onConfirmer={effacer} charge={envoi}>
        {(ouvrir) => <Bouton variante="discret" icone="poubelle" onClick={ouvrir}>Effacer les données de test</Bouton>}
      </Confirmer>
    </section>
  );
}

function MiseEnPlace({ outils, lives }) {
  const par = Object.fromEntries(outils.filter((o) => o.actif).map((o) => [o.type, o]));
  const etapes = [];
  if (par.telegram) etapes.push(["Relier le groupe Telegram", Boolean(par.telegram.config?.chat_id)]);
  if (par.whatsapp) etapes.push(["Coller le lien du groupe WhatsApp", Boolean(par.whatsapp.config?.lien)]);
  if (par.drive) etapes.push(["Créer le dossier Drive des vidéos", Boolean(par.drive.config?.dossier_id)]);
  if (par.meet) etapes.push(["Programmer un live Google Meet", lives > 0]);
  const restantes = etapes.filter(([, ok]) => !ok);
  if (!restantes.length) return null;

  return (
    <section className="carte mise-en-place">
      <div className="mise-en-place-tete">
        <h2 className="titre-carte">Mise en place</h2>
        <span className="puce puce-or">{etapes.length - restantes.length}/{etapes.length}</span>
      </div>
      <ul className="liste-etapes">
        {etapes.map(([texte, ok]) => (
          <li key={texte} className={ok ? "ok" : ""}>
            <Icone nom={ok ? "coche" : "horloge"} taille={18} />
            <span>{texte}</span>
          </li>
        ))}
      </ul>
      <Lien href="/admin/outils" className="bouton bouton-violet">Configurer les outils</Lien>
    </section>
  );
}

function Partage({ slug }) {
  const base = `${window.location.origin}/o/${slug}`;
  return (
    <section className="carte">
      <h2 className="titre-carte">Liens de ta page de vente</h2>
      <p className="texte-doux">Un lien par réseau : le tableau saura d'où viennent tes visiteurs et tes ventes.</p>
      <ul className="liens-partage">
        <li>
          <span className="lien-partage-nom">Page</span>
          <code>{base}</code>
          <Copier texte={base} />
        </li>
        {SOURCES_RAPIDES.map(([src, nom]) => (
          <li key={src}>
            <span className="lien-partage-nom">{nom}</span>
            <code>{`${base}?source=${src}`}</code>
            <Copier texte={`${base}?source=${src}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
