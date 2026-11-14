// Construit le site dans dist/ : un seul passage d'esbuild, puis index.html.
//
//   node scripts/build.mjs          production (minifié)
//   node scripts/build.mjs --dev    lisible, avec cartes de source
//
// L'aperçu des liens partagés (WhatsApp, Facebook…) ne lit pas le JavaScript :
// le titre, la description et l'image de l'offre sont donc écrits dans
// index.html au moment de la construction. Après avoir changé l'offre, un
// nouveau déploiement rafraîchit cet aperçu.

import { createRequire } from "node:module";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(racine, "dist");
const dev = process.argv.includes("--dev");

const config = await readFile(path.join(racine, "src/config.js"), "utf8");
const SUPABASE_URL = /SUPABASE_URL = "([^"]+)"/.exec(config)?.[1];
const SUPABASE_CLE = /SUPABASE_CLE = "([^"]+)"/.exec(config)?.[1];

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });

const resultat = await esbuild.build({
  absWorkingDir: racine,
  entryPoints: ["src/main.jsx"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: "dist/assets",
  entryNames: "[name]-[hash]",
  chunkNames: "[name]-[hash]",
  assetNames: "[name]-[hash]",
  target: ["es2020", "chrome80", "firefox78", "safari15"],
  jsx: "automatic",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  metafile: true,
  legalComments: "none",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  nodePaths: (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean),
  logLevel: "warning",
});

const sorties = Object.entries(resultat.metafile.outputs);
const entree = sorties.find(([, o]) => o.entryPoint === "src/main.jsx");
if (!entree) throw new Error("Point d'entrée introuvable dans la sortie d'esbuild");
const js = "/" + path.relative(dist, path.join(racine, entree[0])).split(path.sep).join("/");
const css = entree[1].cssBundle ? "/" + path.relative(dist, path.join(racine, entree[1].cssBundle)).split(path.sep).join("/") : null;

// ---------------------------------------------------------------------------
// Aperçu des liens : l'offre publiée, si la base répond.
// ---------------------------------------------------------------------------

function echapper(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function offrePubliee() {
  if (!SUPABASE_URL || !SUPABASE_CLE || process.env.ORCI_SANS_APERCU) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/offre_publique`, {
      method: "POST",
      headers: { apikey: SUPABASE_CLE, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const offre = await offrePubliee();
// Les astérisques marquent le mot doré de la page : pas dans les aperçus de partage.
const sansAccent = (t) => String(t ?? "").replace(/\*/g, "");
if (offre) offre.titre = sansAccent(offre.titre);
const titre = offre ? `${offre.titre} · ${offre.formateur?.nom ?? "Orci"}` : "Orci";
const description = sansAccent(offre?.sous_titre) || "Paiement Mobile Money et accès immédiat à la formation.";
const prix = offre
  ? `${String(offre.prix).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA${offre.facturation === "mensuel" ? " / mois" : ""}`
  : null;
const meta = [
  `<title>${echapper(titre)}</title>`,
  `<meta name="description" content="${echapper(description)}" />`,
  `<meta property="og:type" content="website" />`,
  `<meta property="og:title" content="${echapper(prix ? `${offre.titre} — ${prix}` : titre)}" />`,
  `<meta property="og:description" content="${echapper(description)}" />`,
  offre?.image_url ? `<meta property="og:image" content="${echapper(offre.image_url)}" />` : "",
  `<meta name="twitter:card" content="${offre?.image_url ? "summary_large_image" : "summary"}" />`,
]
  .filter(Boolean)
  .join("\n    ");

let html = await readFile(path.join(racine, "index.html"), "utf8");
html = html
  .replace("<!--ORCI_META-->", meta)
  .replace("<!--ORCI_CSS-->", css ? `<link rel="stylesheet" href="${css}" />` : "")
  .replace("<!--ORCI_JS-->", `<script type="module" src="${js}"></script>`);
await writeFile(path.join(dist, "index.html"), html);

if (existsSync(path.join(racine, "public"))) await cp(path.join(racine, "public"), dist, { recursive: true });

const poids = sorties
  .filter(([f]) => !f.endsWith(".map"))
  .map(([f, o]) => `  ${path.relative(dist, path.join(racine, f))}  ${(o.bytes / 1024).toFixed(1)} Ko`)
  .join("\n");
console.log(`Orci construit dans dist/${offre ? ` (aperçu : « ${offre.titre} »)` : " (aperçu générique)"}\n${poids}`);
