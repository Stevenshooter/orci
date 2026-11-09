// Un routeur de quelques lignes : l'historique du navigateur, et c'est tout.

import { useEffect, useState } from "react";

export function naviguer(chemin, { remplacer = false } = {}) {
  if (remplacer) window.history.replaceState(null, "", chemin);
  else window.history.pushState(null, "", chemin);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function useAdresse() {
  const lire = () => ({ chemin: window.location.pathname, recherche: window.location.search });
  const [adresse, setAdresse] = useState(lire);
  useEffect(() => {
    const f = () => setAdresse(lire());
    window.addEventListener("popstate", f);
    window.addEventListener("hashchange", f);
    return () => {
      window.removeEventListener("popstate", f);
      window.removeEventListener("hashchange", f);
    };
  }, []);
  return adresse;
}

/** "/o/:slug" contre "/o/capcut-pro" → { slug: "capcut-pro" }, sinon null. */
export function correspond(motif, chemin) {
  const a = motif.split("/").filter(Boolean);
  const b = chemin.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Lien({ href, onClick, target, ...reste }) {
  return (
    <a
      href={href}
      target={target}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || target || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        naviguer(href);
      }}
      {...reste}
    />
  );
}
