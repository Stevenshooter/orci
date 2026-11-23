// « Ma liste » et « Mon accès » : ce qui appartient au spectateur. Orci n'a
// pas de compte : la liste vit sur le téléphone, et le lien d'accès Premium
// est la clé.

import { useEffect, useState } from "react";
import { lienWhatsApp } from "../../lib/format.js";
import { Lien, naviguer } from "../../lib/routeur.jsx";
import { maListe } from "../../lib/visiteur.js";
import { Icone, LienBouton, useDonnees, useTitre } from "../../ui.jsx";
import {
  aReprendre,
  BoutonPremium,
  chargerCatalogue,
  Coquille,
  ErreurChargement,
  GrilleAffiches,
  jetonPremium,
  PageChargement,
  prixPremium,
  Reprendre,
  useVue,
} from "./commun.jsx";

export function MaListe() {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  const [liste] = useState(maListe);
  useTitre("Ma liste · Orci");
  useVue(c?.premium?.id);

  if (charge && !c) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const { series, premium } = c;
  const jeton = jetonPremium(premium);
  const gardees = liste.map((slug) => series.find((s) => s.slug === slug)).filter(Boolean);
  const reprendre = aReprendre(series);

  return (
    <Coquille actif="/ma-liste" premium={premium} jeton={jeton}>
      <section className="intro">
        <h1 className="intro-titre">Ma liste</h1>
        <p className="intro-texte">Les séries que tu gardes pour plus tard, sur ce téléphone.</p>
      </section>

      {reprendre.length ? <Reprendre items={reprendre} /> : null}

      <section className="bloc" aria-label="Gardées pour plus tard">
        <h2 className="titre-bloc">Gardées pour plus tard</h2>
        {gardees.length ? (
          <GrilleAffiches series={gardees} />
        ) : (
          <div className="vide vide-action">
            <p>
              Ta liste est vide. Sur la page d'une série, touche le signet <Icone nom="signet" taille={16} /> pour la garder ici.
            </p>
            <Lien className="bouton bouton-discret" href="/explorer">
              Explorer les séries
            </Lien>
          </div>
        )}
      </section>
    </Coquille>
  );
}

export function MonAcces() {
  const { donnees: c, erreur, charge, recharger } = useDonnees(chargerCatalogue, []);
  useTitre("Mon accès · Orci");
  const jeton = c ? jetonPremium(c.premium) : null;

  // Le lien d'accès est connu sur ce téléphone : on l'ouvre directement.
  useEffect(() => {
    if (jeton) naviguer(`/acces/${jeton}`, { remplacer: true });
  }, [jeton]);

  if ((charge && !c) || jeton) return <PageChargement />;
  if (!c) return <ErreurChargement erreur={erreur} recharger={recharger} />;

  const { premium, formateur } = c;
  const contact = formateur?.whatsapp
    ? lienWhatsApp(formateur.whatsapp, "Bonjour, j'ai payé le Premium Orci mais je n'ai plus mon lien d'accès.")
    : null;

  return (
    <Coquille actif="/mon-acces" premium={premium} jeton={null}>
      <section className="intro">
        <h1 className="intro-titre">Mon accès</h1>
        <p className="intro-texte">Orci n'a ni compte ni mot de passe : ton lien d'accès est ta clé.</p>
      </section>

      <section className="carte pile acces-aide-carte">
        <h2 className="titre-carte">Tu as déjà payé le Premium ?</h2>
        <p className="texte-doux">
          Ouvre le lien d'accès reçu juste après ton paiement. Il débloque toutes les suites sur ce téléphone, et sur tous ceux où tu l'ouvres.
        </p>
        {contact ? (
          <LienBouton variante="discret" icone="bulle" href={contact} target="_blank" rel="noopener noreferrer">
            Je n'ai plus mon lien
          </LienBouton>
        ) : null}
      </section>

      {premium ? (
        <section className="carte pile acces-aide-carte">
          <h2 className="titre-carte">Pas encore Premium ?</h2>
          <p className="texte-doux">Un seul paiement Mobile Money, et toutes les suites s'ouvrent. Sans renouvellement automatique.</p>
          <BoutonPremium premium={premium} depuis="/" className="bouton-large">
            Activer le passe · {prixPremium(premium)}
          </BoutonPremium>
          <Lien className="lien-discret" href="/premium">
            Tout savoir sur le Premium
          </Lien>
        </section>
      ) : null}
    </Coquille>
  );
}
