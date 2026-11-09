// Sert dist/ en local, avec le repli vers index.html d'une application à
// page unique : http://localhost:5173
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const port = Number(process.env.PORT || 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let fichier = path.join(dist, chemin);
  if (!fichier.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(fichier)).isFile()) throw new Error();
  } catch {
    fichier = path.join(dist, "index.html");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] || "application/octet-stream" });
  res.end(await readFile(fichier));
}).listen(port, () => console.log(`Orci : http://localhost:${port}`));
