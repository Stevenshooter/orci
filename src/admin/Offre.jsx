// L'offre : ce que dit la page de vente, son prix, et le contact du formateur.

import { useEffect, useMemo, useRef, useState } from "react";
import { fcfa } from "../lib/format.js";
import { imageLisible, typeImage } from "../lib/image.js";
import { cheminStockage, modifier, supprimerFichier, televerser, televerserImage } from "../lib/supa.js";
import { videoIntegree } from "../lib/video.js";
import { Bouton, Champ, Icone, Message, useTitre } from "../ui.jsx";
import { useAdmin } from "./Admin.jsx";

const MAX_PREUVES = 12;
const FORMATS_IMAGE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// La vidéo de présentation : 50 Mo, le plafond du plan gratuit de Supabase.
const FORMATS_VIDEO = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const MAX_VIDEO = 50 * 1024 * 1024;

function versFormulaire(offre, formateur) {
  return {
    titre: offre.titre ?? "",
    sous_titre: offre.sous_titre ?? "",
    description: offre.description ?? "",
    image_url: offre.image_url ?? "",
    prix: String(offre.prix ?? ""),
    prix_barre: offre.prix_barre ? String(offre.prix_barre) : "",
    facturation: offre.facturation ?? "unique",
    duree_jours: offre.duree_jours ? String(offre.duree_jours) : "",
    programme: Array.isArray(offre.programme) ? offre.programme.map((p) => ({ titre: p.titre ?? "", texte: p.texte ?? "" })) : [],
    bonus: Array.isArray(offre.bonus) ? [...offre.bonus] : [],
    duree: offre.infos?.duree ?? "",
    public: offre.infos?.public ?? "",
    video: offre.infos?.video ?? "",
    publiee: Boolean(offre.publiee),
    slug: offre.slug ?? "",
    nom: formateur?.nom ?? "",
    whatsapp: formateur?.whatsapp ?? "",
  };
}

function entier(v) {
  const n = Number(String(v).replace(/\s|\u00a0/g, ""));
  return Number.isInteger(n) ? n : NaN;
}

function verifier(f) {
  const e = {};
  if (f.titre.trim().length < 3 || f.titre.trim().length > 120) e.titre = "Entre 3 et 120 caractères.";
  if (f.sous_titre.length > 240) e.sous_titre = "240 caractères au plus.";
  if (f.description.length > 4000) e.description = "4 000 caractères au plus.";
  if (f.video.trim() && !videoIntegree(f.video)) e.video = "Colle un lien YouTube, ou un lien direct (https) vers un fichier .mp4.";
  const prix = entier(f.prix);
  if (!(prix >= 100 && prix <= 10_000_000)) e.prix = "Un montant entier entre 100 et 10 000 000 FCFA.";
  if (f.prix_barre.trim()) {
    const b = entier(f.prix_barre);
    if (!(b > 0)) e.prix_barre = "Un montant entier, ou laisse vide.";
  }
  if (f.facturation === "mensuel" || f.duree_jours.trim()) {
    const d = entier(f.duree_jours);
    if (!(d >= 1 && d <= 3650)) e.duree_jours = f.facturation === "mensuel" ? "Un abonnement a une durée : 30 jours en général." : "Entre 1 et 3 650 jours, ou laisse vide pour un accès à vie.";
  }
  if (!/^[a-z0-9-]{2,60}$/.test(f.slug)) e.slug = "Lettres minuscules, chiffres et tirets seulement.";
  if (f.nom.trim().length < 2) e.nom = "Le nom affiché sur la page.";
  const wa = f.whatsapp.replace(/\D/g, "");
  if (wa && !/^[0-9]{8,15}$/.test(wa)) e.whatsapp = "Le numéro complet avec l'indicatif, par exemple 237690000000.";
  return e;
}

export default function Offre() {
  useTitre("Offre · Orci");
  const { offre, formateur, recharger } = useAdmin();
  const original = useMemo(() => versFormulaire(offre, formateur), [offre, formateur]);
  const [f, setF] = useState(original);
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);
  const [image, setImage] = useState({ envoi: false, erreur: null });

  // Quand la base change (image, vidéo ou témoignages enregistrés aussitôt),
  // les saisies en cours sont gardées : seuls les champs changés en base
  // sont repris.
  const precedent = useRef(original);
  useEffect(() => {
    const avant = precedent.current;
    precedent.current = original;
    setF((x) => {
      if (JSON.stringify(x) === JSON.stringify(avant)) return original;
      const suite = { ...x };
      for (const k of Object.keys(original)) {
        if (JSON.stringify(original[k]) !== JSON.stringify(avant[k])) suite[k] = original[k];
      }
      return suite;
    });
  }, [original]);

  const modifie = JSON.stringify(f) !== JSON.stringify(original);
  const maj = (champ) => (e) => setF((x) => ({ ...x, [champ]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function enregistrer(e) {
    e?.preventDefault();
    setMessage(null);
    const err = verifier(f);
    setErreurs(err);
    if (Object.keys(err).length) {
      setMessage({ type: "erreur", texte: "Corrige les champs signalés." });
      return;
    }
    setEnvoi(true);
    try {
      await modifier("offres", `id=eq.${offre.id}`, {
        titre: f.titre.trim(),
        sous_titre: f.sous_titre.trim() || null,
        description: f.description.trim() || null,
        image_url: f.image_url || null,
        prix: entier(f.prix),
        prix_barre: f.prix_barre.trim() ? entier(f.prix_barre) : null,
        facturation: f.facturation,
        duree_jours: f.duree_jours.trim() ? entier(f.duree_jours) : null,
        programme: f.programme.filter((p) => p.titre.trim()).map((p) => ({ titre: p.titre.trim(), texte: p.texte.trim() })),
        bonus: f.bonus.map((b) => b.trim()).filter(Boolean),
        infos: {
          ...(offre.infos || {}),
          duree: f.duree.trim() || undefined,
          public: f.public.trim() || undefined,
          video: f.video.trim() || undefined,
        },
        publiee: f.publiee,
        slug: f.slug,
      });
      if (formateur) {
        await modifier("formateurs", `id=eq.${formateur.id}`, {
          nom: f.nom.trim(),
          whatsapp: f.whatsapp.replace(/\D/g, "") || null,
        });
      }
      // Une vidéo importée, puis retirée ou remplacée par un lien : son fichier
      // ne sert plus, il ne doit pas occuper le stockage.
      const ancienne = cheminStockage(original.video, "videos");
      if (ancienne && f.video.trim() !== original.video) supprimerFichier("videos", ancienne);
      await recharger({ silencieux: true });
      setMessage({ type: "succes", texte: "C'est enregistré : la page de vente est à jour." });
    } catch (err) {
      setMessage({
        type: "erreur",
        texte: err.code === "23505" ? "Cette adresse de page est déjà prise. Choisis-en une autre." : err.message,
      });
    } finally {
      setEnvoi(false);
    }
  }

  async function choisirImage(e) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(fichier.type)) {
      setImage({ envoi: false, erreur: "Une image JPEG, PNG ou WebP." });
      return;
    }
    if (fichier.size > 5 * 1024 * 1024) {
      setImage({ envoi: false, erreur: "L'image dépasse 5 Mo. Réduis-la avant de l'envoyer." });
      return;
    }
    setImage({ envoi: true, erreur: null });
    try {
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[fichier.type];
      const url = await televerserImage(`offres/${offre.id}/${Date.now()}.${ext}`, fichier);
      await modifier("offres", `id=eq.${offre.id}`, { image_url: url });
      setF((x) => ({ ...x, image_url: url }));
      await recharger({ silencieux: true });
      setImage({ envoi: false, erreur: null });
    } catch (err) {
      setImage({ envoi: false, erreur: err.message });
    }
  }

  // La vidéo importée de l'ordinateur s'enregistre aussitôt, comme l'image.
  const [video, setVideo] = useState({ envoi: false, progression: 0, erreur: null });
  const apercu = videoIntegree(f.video);

  // Fermer l'onglet pendant l'envoi le couperait : le navigateur prévient.
  useEffect(() => {
    if (!video.envoi) return undefined;
    const retenir = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [video.envoi]);

  async function choisirVideo(e) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    if (!FORMATS_VIDEO[fichier.type]) {
      setVideo({ envoi: false, progression: 0, erreur: "Une vidéo MP4 (conseillé), WebM ou MOV." });
      return;
    }
    if (fichier.size > MAX_VIDEO) {
      setVideo({
        envoi: false,
        progression: 0,
        erreur: `Cette vidéo fait ${Math.ceil(fichier.size / 1048576)} Mo : 50 Mo au plus. Raccourcis-la, ou exporte-la en 720p.`,
      });
      return;
    }
    setVideo({ envoi: true, progression: 0, erreur: null });
    const ancienne = cheminStockage(offre.infos?.video, "videos");
    try {
      const url = await televerser("videos", `offres/${offre.id}/presentation-${Date.now()}.${FORMATS_VIDEO[fichier.type]}`, fichier, {
        progression: (p) => setVideo((v) => ({ ...v, progression: p })),
      });
      await modifier("offres", `id=eq.${offre.id}`, { infos: { ...(offre.infos || {}), video: url } });
      await recharger({ silencieux: true });
      setVideo({ envoi: false, progression: 0, erreur: null });
      if (ancienne) supprimerFichier("videos", ancienne);
    } catch (err) {
      setVideo({ envoi: false, progression: 0, erreur: err.message });
    }
  }

  // Les témoignages s'enregistrent aussitôt, comme l'image : ils ne passent pas
  // par le bouton « Enregistrer ».
  const preuves = Array.isArray(offre.infos?.preuves) ? offre.infos.preuves : [];
  const [preuve, setPreuve] = useState({ envoi: false, erreur: null });

  async function enregistrerPreuves(liste) {
    await modifier("offres", `id=eq.${offre.id}`, { infos: { ...(offre.infos || {}), preuves: liste } });
    await recharger({ silencieux: true });
  }

  async function ajouterPreuves(e) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!fichiers.length) return;
    const place = MAX_PREUVES - preuves.length;
    if (place <= 0) {
      setPreuve({ envoi: false, erreur: `${MAX_PREUVES} témoignages au plus : retires-en un d'abord.` });
      return;
    }
    const refus = fichiers.find((x) => !FORMATS_IMAGE[typeImage(x)] && typeImage(x) !== "image/avif");
    if (refus) {
      setPreuve({ envoi: false, erreur: `« ${refus.name} » : une image JPEG, PNG, WebP ou AVIF.` });
      return;
    }
    setPreuve({ envoi: true, erreur: null });
    try {
      // Les AVIF deviennent des WebP : tous les téléphones savent les afficher.
      const prets = [];
      for (const x of fichiers.slice(0, place)) prets.push(await imageLisible(x));
      const lourd = prets.find((x) => x.size > 5 * 1024 * 1024);
      if (lourd) throw new Error(`« ${lourd.name} » dépasse 5 Mo. Réduis l'image avant de l'envoyer.`);
      const urls = [];
      for (const [i, fichier] of prets.entries()) {
        urls.push(await televerserImage(`offres/${offre.id}/preuves/${Date.now()}-${i}.${FORMATS_IMAGE[fichier.type]}`, fichier));
      }
      await enregistrerPreuves([...preuves, ...urls]);
      setPreuve({
        envoi: false,
        erreur: fichiers.length > place ? `Seuls ${place} témoignage(s) ajouté(s) : ${MAX_PREUVES} au plus.` : null,
      });
    } catch (err) {
      setPreuve({ envoi: false, erreur: err.message });
    }
  }

  async function retirerPreuve(src) {
    setPreuve({ envoi: true, erreur: null });
    try {
      await enregistrerPreuves(preuves.filter((x) => x !== src));
      setPreuve({ envoi: false, erreur: null });
    } catch (err) {
      setPreuve({ envoi: false, erreur: err.message });
    }
  }

  const setProgramme = (i, champ, v) => setF((x) => ({ ...x, programme: x.programme.map((p, j) => (j === i ? { ...p, [champ]: v } : p)) }));
  const deplacer = (i, d) =>
    setF((x) => {
      const p = [...x.programme];
      const j = i + d;
      if (j < 0 || j >= p.length) return x;
      [p[i], p[j]] = [p[j], p[i]];
      return { ...x, programme: p };
    });

  return (
    <form className="pile-grande offre" onSubmit={enregistrer} noValidate>
      <div className="tete-page">
        <div>
          <h1>Ton offre</h1>
          <p className="texte-doux">Ce que tes visiteurs lisent sur la page de vente.</p>
        </div>
        <a className="bouton bouton-discret" href={`/o/${offre.slug}`} target="_blank" rel="noopener noreferrer">
          <Icone nom="oeil" taille={18} /><span>Voir la page</span>
        </a>
      </div>

      <section className="carte pile">
        <label className="interrupteur">
          <input type="checkbox" checked={f.publiee} onChange={maj("publiee")} />
          <span className="interrupteur-piste" aria-hidden="true" />
          <span>
            <strong>{f.publiee ? "La page de vente est en ligne" : "La page de vente est hors ligne"}</strong>
            <span className="texte-doux petit bloc">{f.publiee ? "Tout le monde peut acheter." : "Personne ne peut l'ouvrir ni acheter."}</span>
          </span>
        </label>
      </section>

      <section className="carte pile">
        <h2 className="titre-carte">Présentation</h2>
        <Champ etiquette="Titre" id="titre" value={f.titre} onChange={maj("titre")} erreur={erreurs.titre} maxLength={120} />
        <Champ
          etiquette="Accroche"
          id="sous_titre"
          value={f.sous_titre}
          onChange={maj("sous_titre")}
          erreur={erreurs.sous_titre}
          maxLength={240}
          aide="La grande phrase en haut de la page : la promesse. Entoure un mot d'astérisques pour le mettre en doré, par exemple : vidéos *professionnelles*. Sinon, c'est le mot le plus long."
        />
        <div className="video-offre">
          <div className="video-offre-apercu">
            {apercu?.type === "fichier" ? (
              <video src={`${apercu.src}#t=0.1`} controls playsInline preload="metadata" />
            ) : apercu?.type === "youtube" ? (
              <iframe src={apercu.src} title="Aperçu de la vidéo de présentation" loading="lazy" allowFullScreen />
            ) : (
              <div className="image-vide"><Icone nom="camera" taille={28} /></div>
            )}
          </div>
          <div className="pile">
            <p className="etiquette">Vidéo de présentation</p>
            <p className="texte-doux petit">
              Elle s'affiche sous ton accroche. MP4 conseillé, 50 Mo au plus : 1 à 2 minutes en 720p suffisent, et
              ménagent la bande passante de ton compte Supabase gratuit.
            </p>
            <label className={`bouton bouton-discret ${video.envoi ? "en-charge" : ""}`}>
              {video.envoi ? <span className="roue" aria-hidden="true" /> : <Icone nom="plus" taille={18} />}
              <span>{apercu?.type === "fichier" ? "Changer la vidéo" : "Importer une vidéo depuis l'ordinateur"}</span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={choisirVideo} hidden disabled={video.envoi} />
            </label>
            {video.envoi ? (
              <div className="envoi-video" role="status">
                <progress value={video.progression} max={1} />
                <span>Envoi : {Math.round(video.progression * 100)} % — garde cette page ouverte.</span>
              </div>
            ) : null}
            {f.video && !video.envoi ? (
              <button type="button" className="lien-discret" onClick={() => setF((x) => ({ ...x, video: "" }))}>Retirer la vidéo</button>
            ) : null}
            {video.erreur ? <p className="champ-aide champ-aide-erreur">{video.erreur}</p> : null}
          </div>
        </div>
        <Champ
          etiquette="Ou un lien YouTube (facultatif)"
          id="video"
          type="url"
          inputMode="url"
          placeholder="https://youtu.be/…"
          value={apercu?.type === "fichier" ? "" : f.video}
          onChange={maj("video")}
          erreur={erreurs.video}
          aide="À la place d'une vidéo importée. YouTube, même non répertorié, ne consomme pas la bande passante de ton compte."
        />
        <Champ
          etiquette="Description détaillée (facultatif)"
          id="description"
          erreur={erreurs.description}
          enfant={<textarea id="description" rows={6} value={f.description} onChange={maj("description")} maxLength={4000} />}
        />
        <div className="image-offre">
          {f.image_url ? <img src={f.image_url} alt="Image de la page de vente" /> : <div className="image-vide"><Icone nom="camera" taille={28} /></div>}
          <div className="pile">
            <p className="etiquette">Image de la page</p>
            <p className="texte-doux petit">Format paysage conseillé, 5 Mo au plus.</p>
            <label className={`bouton bouton-discret ${image.envoi ? "en-charge" : ""}`}>
              {image.envoi ? <span className="roue" aria-hidden="true" /> : <Icone nom="plus" taille={18} />}
              <span>{f.image_url ? "Changer l'image" : "Ajouter une image"}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choisirImage} hidden disabled={image.envoi} />
            </label>
            {f.image_url ? (
              <button type="button" className="lien-discret" onClick={() => setF((x) => ({ ...x, image_url: "" }))}>Retirer l'image</button>
            ) : null}
            {image.erreur ? <p className="champ-aide champ-aide-erreur">{image.erreur}</p> : null}
          </div>
        </div>
      </section>

      <section className="carte pile">
        <h2 className="titre-carte">Témoignages clients</h2>
        <p className="texte-doux petit">
          Des captures de messages ou de résultats de tes élèves, avec leur accord. Elles défilent toutes seules sur ta
          page de vente, sous « Ils nous ont fait confiance », juste après le bouton. JPEG, PNG, WebP ou AVIF (converti
          automatiquement pour tous les téléphones), {MAX_PREUVES} au plus ; sans témoignage, cette partie ne s'affiche pas.
        </p>
        {preuves.length ? (
          <ul className="preuves-admin">
            {preuves.map((src, i) => (
              <li key={src}>
                <img src={src} alt={`Témoignage ${i + 1}`} loading="lazy" />
                <button type="button" className="icone-bouton" aria-label={`Retirer le témoignage ${i + 1}`} onClick={() => retirerPreuve(src)} disabled={preuve.envoi}>
                  <Icone nom="poubelle" taille={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className={`bouton bouton-discret ${preuve.envoi ? "en-charge" : ""}`}>
          {preuve.envoi ? <span className="roue" aria-hidden="true" /> : <Icone nom="plus" taille={18} />}
          <span>Ajouter des témoignages</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,.avif"
            multiple
            onChange={ajouterPreuves}
            hidden
            disabled={preuve.envoi || preuves.length >= MAX_PREUVES}
          />
        </label>
        {preuve.erreur ? <p className="champ-aide champ-aide-erreur">{preuve.erreur}</p> : null}
      </section>

      <section className="carte pile">
        <h2 className="titre-carte">Prix</h2>
        <div className="grille-2">
          <Champ etiquette="Prix (FCFA)" id="prix" inputMode="numeric" value={f.prix} onChange={maj("prix")} erreur={erreurs.prix} aide={entier(f.prix) >= 100 ? fcfa(entier(f.prix)) : undefined} />
          <Champ etiquette="Prix barré (facultatif)" id="prix_barre" inputMode="numeric" value={f.prix_barre} onChange={maj("prix_barre")} erreur={erreurs.prix_barre} aide="L'ancien prix, affiché barré." />
        </div>
        <div className="grille-2">
          <Champ
            etiquette="Paiement"
            id="facturation"
            enfant={
              <select id="facturation" value={f.facturation} onChange={maj("facturation")}>
                <option value="unique">Paiement unique</option>
                <option value="mensuel">Abonnement mensuel</option>
              </select>
            }
          />
          <Champ
            etiquette="Durée de l'accès (jours)"
            id="duree_jours"
            inputMode="numeric"
            placeholder={f.facturation === "mensuel" ? "30" : "Vide = à vie"}
            value={f.duree_jours}
            onChange={maj("duree_jours")}
            erreur={erreurs.duree_jours}
            aide={f.facturation === "mensuel" ? "Chaque paiement prolonge l'accès de cette durée." : "Laisse vide pour un accès à vie."}
          />
        </div>
      </section>

      <section className="carte pile">
        <h2 className="titre-carte">Au programme</h2>
        <ol className="editeur-liste">
          {f.programme.map((p, i) => (
            <li key={i} className="editeur-element">
              <span className="programme-numero">{String(i + 1).padStart(2, "0")}</span>
              <div className="pile">
                <input aria-label={`Étape ${i + 1} : titre`} placeholder="Titre de l'étape" value={p.titre} onChange={(e) => setProgramme(i, "titre", e.target.value)} maxLength={120} />
                <input aria-label={`Étape ${i + 1} : détail`} placeholder="Ce qu'on y apprend" value={p.texte} onChange={(e) => setProgramme(i, "texte", e.target.value)} maxLength={300} />
              </div>
              <div className="editeur-boutons">
                <button type="button" className="icone-bouton" aria-label="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}>↑</button>
                <button type="button" className="icone-bouton" aria-label="Descendre" disabled={i === f.programme.length - 1} onClick={() => deplacer(i, 1)}>↓</button>
                <button type="button" className="icone-bouton" aria-label="Supprimer" onClick={() => setF((x) => ({ ...x, programme: x.programme.filter((_, j) => j !== i) }))}>
                  <Icone nom="poubelle" taille={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <Bouton type="button" variante="discret" icone="plus" onClick={() => setF((x) => ({ ...x, programme: [...x.programme, { titre: "", texte: "" }] }))}>
          Ajouter une étape
        </Bouton>
      </section>

      <section className="carte pile">
        <h2 className="titre-carte">En bonus</h2>
        <ul className="editeur-liste">
          {f.bonus.map((b, i) => (
            <li key={i} className="editeur-element editeur-simple">
              <Icone nom="cadeau" taille={18} />
              <input aria-label={`Bonus ${i + 1}`} value={b} maxLength={160} onChange={(e) => setF((x) => ({ ...x, bonus: x.bonus.map((y, j) => (j === i ? e.target.value : y)) }))} />
              <button type="button" className="icone-bouton" aria-label="Supprimer" onClick={() => setF((x) => ({ ...x, bonus: x.bonus.filter((_, j) => j !== i) }))}>
                <Icone nom="poubelle" taille={16} />
              </button>
            </li>
          ))}
        </ul>
        <Bouton type="button" variante="discret" icone="plus" onClick={() => setF((x) => ({ ...x, bonus: [...x.bonus, ""] }))}>Ajouter un bonus</Bouton>
      </section>

      <section className="carte pile">
        <h2 className="titre-carte">Infos pratiques</h2>
        <div className="grille-2">
          <Champ etiquette="Durée de la formation" id="duree" placeholder="4 jours" value={f.duree} onChange={maj("duree")} maxLength={60} />
          <Champ etiquette="Pour qui" id="public" placeholder="Débutants comme confirmés" value={f.public} onChange={maj("public")} maxLength={160} />
        </div>
      </section>

      <section className="carte pile">
        <h2 className="titre-carte">Toi, le formateur</h2>
        <div className="grille-2">
          <Champ etiquette="Nom affiché" id="nom-formateur" value={f.nom} onChange={maj("nom")} erreur={erreurs.nom} maxLength={80} />
          <Champ
            etiquette="WhatsApp de contact"
            id="whatsapp-formateur"
            inputMode="tel"
            value={f.whatsapp}
            onChange={maj("whatsapp")}
            erreur={erreurs.whatsapp}
            aide="Avec l'indicatif, sans le +. Les acheteurs t'écrivent ici."
          />
        </div>
        <details className="avance">
          <summary>Adresse de la page</summary>
          <Champ
            etiquette="Fin de l'adresse"
            id="slug"
            value={f.slug}
            onChange={(e) => setF((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
            erreur={erreurs.slug}
            aide={`${window.location.origin}/o/${f.slug} — les liens déjà partagés ne marcheront plus si tu la changes.`}
            maxLength={60}
          />
        </details>
      </section>

      {message ? <Message type={message.type}>{message.texte}</Message> : null}

      {modifie || envoi ? (
        <div className="barre-enregistrer visible">
          <span>Modifications non enregistrées</span>
          <div className="rangee">
            <Bouton type="button" variante="discret" disabled={envoi} onClick={() => { setF(original); setErreurs({}); setMessage(null); }}>Annuler</Bouton>
            <Bouton type="submit" charge={envoi}>Enregistrer</Bouton>
          </div>
        </div>
      ) : null}
    </form>
  );
}
