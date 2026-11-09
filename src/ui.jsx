// Les briques d'interface partagées par la page de vente et l'espace admin.

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Icônes : des formes génériques, jamais les logos des marques.
// ---------------------------------------------------------------------------

const TRACES = {
  dossier: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2h8.6A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z",
  camera: "M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 16.5zM15 10.5l6-3.5v10l-6-3.5",
  avion: "M21 3 3 10.5l7 2.5m11-10-8 18-3-8m11-10L10 13",
  bulle: "M4 19.5 5.3 15A7.5 7.5 0 1 1 8.6 18z",
  lien: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  coche: "M5 12.5 10 17.5 19 7",
  horloge: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  copier: "M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16M4 9.5A1.5 1.5 0 0 1 5.5 8h9A1.5 1.5 0 0 1 16 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5z",
  fleche: "M5 12h14m-6-6 6 6-6 6",
  retour: "M19 12H5m6-6-6 6 6 6",
  cadenas: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13A1.5 1.5 0 0 1 20 12.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-7A1.5 1.5 0 0 1 5.5 11z",
  alerte: "M12 9v4m0 4h.01M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20.3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5m0-8h.01",
  telephone: "M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zm3 15h2",
  cadeau: "M4 11h16v9.5a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5zM3 7.5h18V11H3zM12 7.5V21M12 7.5S10.5 3 8 3.5 7 7.5 12 7.5zm0 0s1.5-4.5 4-4 1 4-4 4z",
  graphique: "M4 20V10m6 10V4m6 16v-7m6 7H2",
  personnes: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm10 9v-1.5a3.5 3.5 0 0 0-2.5-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  crayon: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  engrenage: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  sortie: "M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4m-4 4h10",
  oeil: "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  plus: "M12 5v14M5 12h14",
  poubelle: "M4 7h16M9 7V4.5h6V7m-8 0 1 13h8l1-13",
  rafraichir: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  etoile: "m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
  envoi: "M4 12h12m-5-6 6 6-6 6M20 5v14",
};

export function Icone({ nom, taille = 20, className = "", titre }) {
  const d = TRACES[nom] || TRACES.info;
  return (
    <svg
      className={`icone ${className}`}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titre ? undefined : "true"}
      role={titre ? "img" : undefined}
    >
      {titre ? <title>{titre}</title> : null}
      <path d={d} />
    </svg>
  );
}

export const ICONE_OUTIL = { drive: "dossier", meet: "camera", telegram: "avion", whatsapp: "bulle", lien: "lien" };

// ---------------------------------------------------------------------------

export function Bouton({ variante = "or", charge = false, icone, children, className = "", disabled, ...reste }) {
  return (
    <button
      className={`bouton bouton-${variante} ${charge ? "en-charge" : ""} ${className}`}
      disabled={disabled || charge}
      aria-busy={charge || undefined}
      {...reste}
    >
      {charge ? <span className="roue" aria-hidden="true" /> : icone ? <Icone nom={icone} taille={18} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function LienBouton({ variante = "or", icone, children, className = "", ...reste }) {
  return (
    <a className={`bouton bouton-${variante} ${className}`} {...reste}>
      {icone ? <Icone nom={icone} taille={18} /> : null}
      <span>{children}</span>
    </a>
  );
}

export function Champ({ etiquette, aide, erreur, id, className = "", enfant, ...reste }) {
  const ident = id || `champ-${etiquette?.toString().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className={`champ ${erreur ? "champ-erreur" : ""} ${className}`}>
      {etiquette ? <label htmlFor={ident}>{etiquette}</label> : null}
      {enfant ?? <input id={ident} aria-invalid={erreur ? "true" : undefined} aria-describedby={aide || erreur ? `${ident}-aide` : undefined} {...reste} />}
      {erreur ? (
        <p className="champ-aide champ-aide-erreur" id={`${ident}-aide`}>{erreur}</p>
      ) : aide ? (
        <p className="champ-aide" id={`${ident}-aide`}>{aide}</p>
      ) : null}
    </div>
  );
}

export function Message({ type = "info", titre, children, action }) {
  const icone = { info: "info", erreur: "alerte", succes: "coche", attention: "alerte" }[type];
  return (
    <div className={`message message-${type}`} role={type === "erreur" ? "alert" : "status"}>
      <Icone nom={icone} taille={20} className="message-icone" />
      <div className="message-corps">
        {titre ? <p className="message-titre">{titre}</p> : null}
        {children ? <div className="message-texte">{children}</div> : null}
        {action ? <div className="message-action">{action}</div> : null}
      </div>
    </div>
  );
}

export function Chargement({ texte = "Chargement…" }) {
  return (
    <div className="chargement" role="status">
      <span className="roue roue-grande" aria-hidden="true" />
      <span>{texte}</span>
    </div>
  );
}

export function Copier({ texte, children = "Copier", variante = "discret", className = "" }) {
  const [copie, setCopie] = useState(false);
  const minuteur = useRef();
  useEffect(() => () => clearTimeout(minuteur.current), []);
  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
    } catch {
      const zone = document.createElement("textarea");
      zone.value = texte;
      zone.setAttribute("readonly", "");
      zone.style.position = "fixed";
      zone.style.opacity = "0";
      document.body.appendChild(zone);
      zone.select();
      document.execCommand("copy");
      zone.remove();
    }
    setCopie(true);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setCopie(false), 1800);
  }
  return (
    <Bouton type="button" variante={variante} icone={copie ? "coche" : "copier"} onClick={copier} className={className}>
      {copie ? "Copié" : children}
    </Bouton>
  );
}

/** Une demande de confirmation dans la page, sans boîte de dialogue du navigateur. */
export function Confirmer({ question, libelle = "Confirmer", variante = "danger", onConfirmer, children, charge }) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) return children(() => setOuvert(true));
  return (
    <div className="confirmer" role="group" aria-label={question}>
      <p>{question}</p>
      <div className="rangee">
        <Bouton
          variante={variante}
          charge={charge}
          onClick={async () => {
            try {
              await onConfirmer();
            } finally {
              setOuvert(false);
            }
          }}
        >
          {libelle}
        </Bouton>
        <Bouton variante="discret" onClick={() => setOuvert(false)} disabled={charge}>Annuler</Bouton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chargement de données
// ---------------------------------------------------------------------------

export function useDonnees(charger, deps) {
  const [etat, setEtat] = useState({ donnees: undefined, erreur: null, charge: true });
  const dernier = useRef(0);
  const recharger = useCallback(async ({ silencieux = false } = {}) => {
    const n = ++dernier.current;
    if (!silencieux) setEtat((e) => ({ ...e, charge: true, erreur: null }));
    try {
      const donnees = await charger();
      if (n === dernier.current) setEtat({ donnees, erreur: null, charge: false });
      return donnees;
    } catch (erreur) {
      if (n === dernier.current) setEtat((e) => ({ ...e, erreur, charge: false }));
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    recharger();
  }, [recharger]);
  return { ...etat, recharger, remplacer: (donnees) => setEtat({ donnees, erreur: null, charge: false }) };
}

export function useTitre(titre) {
  useEffect(() => {
    if (titre) document.title = titre;
  }, [titre]);
}
