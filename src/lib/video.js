// La vidéo de présentation de la page de vente : un lien YouTube (intégré sans
// cookies de suivi) ou un lien direct vers un fichier vidéo.

const FICHIER = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

/** { type: "youtube" | "fichier", src } ou null si le lien n'est pas lisible. */
export function videoIntegree(lien) {
  const brut = String(lien ?? "").trim();
  if (!brut) return null;
  let url;
  try {
    url = new URL(brut);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const hote = url.hostname.replace(/^(www\.|m\.)/, "");
  let id = null;
  if (hote === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (hote === "youtube.com" || hote === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  if (id !== null) {
    return /^[A-Za-z0-9_-]{6,20}$/.test(id)
      ? { type: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` }
      : null;
  }

  if (FICHIER.test(url.pathname)) return { type: "fichier", src: url.href };
  return null;
}
