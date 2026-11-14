// Rendre une image lisible par tous les téléphones avant de l'envoyer.
//
// L'AVIF est léger, mais les iPhone d'avant iOS 16.4 ne savent pas l'afficher :
// il est converti ici, dans le navigateur du formateur, en WebP (ou en PNG si
// le navigateur ne sait pas écrire le WebP). Les autres formats passent tels
// quels.

/** Le type d'un fichier, deviné par son extension quand le système ne le donne pas. */
export function typeImage(fichier) {
  if (fichier.type) return fichier.type;
  if (/\.avif$/i.test(fichier.name)) return "image/avif";
  return "";
}

export async function imageLisible(fichier, { cote = 2000, qualite = 0.9 } = {}) {
  if (typeImage(fichier) !== "image/avif") return fichier;

  let image;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    throw new Error(`« ${fichier.name} » : ce navigateur ne sait pas lire l'AVIF. Ouvre Orci dans Chrome, ou convertis l'image en JPEG.`);
  }

  // Une capture géante n'a pas besoin de plus de 2000 pixels de côté.
  const echelle = Math.min(1, cote / Math.max(image.width, image.height));
  const largeur = Math.max(1, Math.round(image.width * echelle));
  const hauteur = Math.max(1, Math.round(image.height * echelle));
  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  toile.getContext("2d").drawImage(image, 0, 0, largeur, hauteur);
  image.close?.();

  const blob = await new Promise((resolve) => toile.toBlob(resolve, "image/webp", qualite));
  if (!blob) throw new Error(`« ${fichier.name} » : la conversion de l'AVIF a échoué. Convertis l'image en JPEG.`);
  const extension = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], fichier.name.replace(/\.avif$/i, "") + `.${extension}`, { type: blob.type });
}
