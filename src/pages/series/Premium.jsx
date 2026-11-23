// La page Premium : la promesse, la formule, ce qui change par rapport au
// gratuit, et les réponses aux questions qu'on se pose avant de payer.

import { useState } from "react";
import { fcfa } from "../../lib/format.js";
import { Lien } from "../../lib/routeur.jsx";
import { Icone, Message, useDonnees, useTitre } from "../../ui.jsx";
import { BoutonPremium, chargerCatalogue, Coquille, ErreurChargement, jetonPremium, joursPremium, PageChargement, useVue } from "./commun.jsx";

export default function PagePremium() {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  useTitre("Premium · toutes les suites des mini-séries · Orci");
  useVue(c?.premium?.id);

  if (charge && !c) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const { series, premium } = c;
  const jeton = jetonPremium(premium);
  const affiches = series.map((s) => s.pochette_url).filter(Boolean).slice(0, 6);

  return (
    <Coquille actif="/premium" premium={premium} jeton={jeton}>
      <section className={`premium-heros ${affiches.length ? "" : "premium-heros-nu"}`}>
        {affiches.length ? (
          <div className="premium-mosaique" aria-hidden="true">
            {affiches.map((src) => (
              <img key={src} src={src} alt="" />
            ))}
          </div>
        ) : null}
        <p className="premium-label">
          <Icone nom="ticket" taille={18} /> Orci Premium
        </p>
        <h1 className="premium-titre">
          Tu as vu le début.
          <br />
          <em>Regarde toute la suite.</em>
        </h1>
        <p className="premium-texte">Toutes les parties de toutes les séries, dès leur sortie. Un seul passe, payé en Mobile Money.</p>
      </section>

      {!premium ? (
        <Message type="info" titre="Le Premium ouvre très bientôt." />
      ) : jeton ? (
        <section className="carte-passe">
          <h2>Ton passe Premium</h2>
          <p className="texte-doux">Ton lien d'accès ouvre toutes les suites. Garde-le : c'est ta clé sur n'importe quel téléphone.</p>
          <Lien className="bouton bouton-or bouton-large" href={`/acces/${jeton}`}>
            Voir mon accès
          </Lien>
          <Lien className="bouton bouton-discret bouton-large" href="/">
            Regarder les séries
          </Lien>
        </section>
      ) : (
        <CartePasse premium={premium} />
      )}

      {premium ? (
        <>
          <section className="premium-bloc">
            <h2>Une partie de plus. Puis une autre.</h2>
            <p>
              Enchaîne les parties sans attendre, passe d'une série à l'autre, et reprends où tu t'étais arrêté. Ton lien d'accès te suit sur
              tous tes téléphones.
            </p>
          </section>
          <Comparaison premium={premium} />
          <Questions premium={premium} />
        </>
      ) : null}

      <Lien className="bouton bouton-discret premium-catalogue" href="/explorer">
        Découvrir les séries
      </Lien>
    </Coquille>
  );
}

function CartePasse({ premium }) {
  const jours = joursPremium(premium);
  const prix = fcfa(premium.prix);
  return (
    <section className="carte-passe" aria-label="Le passe Premium">
      <div className="carte-passe-tete">
        <h2>Un passe, toutes les suites</h2>
        <span>Passe Premium</span>
      </div>
      <p className="carte-passe-etiquette">Ta formule</p>
      <div className="formule formule-choisie">
        <span className="formule-radio" aria-hidden="true" />
        <span className="formule-nom">
          <strong>{premium.facturation === "mensuel" ? "Mensuel" : "Passe"}</strong>
          <span>{jours} jours</span>
        </span>
        <strong className="formule-prix">{prix}</strong>
      </div>
      <p className="carte-passe-resume">
        {premium.facturation === "mensuel" ? "Mensuel" : "Passe"} · {prix} pour {jours} jours
      </p>
      <p className="texte-doux petit">Un seul paiement, sans renouvellement automatique.</p>
      <ul className="liste-coches">
        <li>
          <Icone nom="coche" taille={18} /> Toutes les séries, toutes les parties
        </li>
        <li>
          <Icone nom="coche" taille={18} /> Chaque nouvelle partie dès sa sortie
        </li>
        <li>
          <Icone nom="coche" taille={18} /> Aucun renouvellement automatique
        </li>
      </ul>
      <BoutonPremium premium={premium} depuis="/premium" className="bouton-large">
        Activer pour {prix}
      </BoutonPremium>
      <p className="carte-passe-note">Ton passe démarre dès la confirmation du paiement.</p>
      <p className="carte-passe-note">
        <Icone nom="telephone" taille={16} /> Paiement par Mobile Money
      </p>
    </section>
  );
}

function Comparaison({ premium }) {
  const jours = joursPremium(premium);
  const lignes = [
    ["Parties", "Les parties gratuites", "Toutes les parties"],
    ["Nouvelles parties", "Seulement les gratuites", "Dès leur sortie"],
    ["Durée", "Sans limite", `${jours} jours, renouvelables`],
    ["Prix", "Gratuit", `${fcfa(premium.prix)} / ${jours} jours`],
  ];
  return (
    <section className="premium-bloc" aria-label="Gratuit ou Premium">
      <h2>Gratuit ou Premium ?</h2>
      <div className="comparaison" role="table">
        <div className="comparaison-ligne comparaison-entete" role="row">
          <span role="columnheader">Ce que tu as</span>
          <span role="columnheader">Gratuit</span>
          <span role="columnheader">Premium</span>
        </div>
        {lignes.map(([quoi, gratuit, payant]) => (
          <div className="comparaison-ligne" role="row" key={quoi}>
            <span role="rowheader">{quoi}</span>
            <span role="cell">{gratuit}</span>
            <span role="cell">
              <strong>{payant}</strong>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Questions({ premium }) {
  const jours = joursPremium(premium);
  const [ouverte, setOuverte] = useState(0);
  const questions = [
    ["Quand commence mon passe ?", `Dès la confirmation du paiement, pour ${jours} jours. Si ton passe est encore actif, les nouveaux jours s'ajoutent à la fin.`],
    ["Est-ce un abonnement automatique ?", "Non. Tu paies une fois et tu renouvelles quand tu veux. Aucun prélèvement automatique."],
    ["Quelles séries sont incluses ?", "Toutes les séries d'Orci, et chaque nouvelle partie dès sa sortie."],
    ["Comment je paie ?", "Avec Mobile Money, sur la page de paiement sécurisée. Selon ton pays, la carte bancaire et PayPal sont aussi proposés."],
    [
      "Et si je change de téléphone ?",
      "Juste après le paiement, tu reçois ton lien d'accès. Garde-le (envoie-le toi sur WhatsApp) : il ouvre ton Premium sur n'importe quel téléphone.",
    ],
  ];
  return (
    <section className="premium-bloc" aria-label="Questions fréquentes">
      <h2>Les réponses à tes questions</h2>
      <div className="questions">
        {questions.map(([q, r], i) => (
          <details key={q} open={ouverte === i} onToggle={(e) => e.currentTarget.open && setOuverte(i)}>
            <summary>{q}</summary>
            <p>{r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
