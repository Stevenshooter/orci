// L'offre : ce que dit la page de vente, son prix, et le contact du formateur.

import { useEffect, useMemo, useState } from "react";
import { fcfa } from "../lib/format.js";
import { modifier, televerserImage } from "../lib/supa.js";
import { videoIntegree } from "../lib/video.js";
import { Bouton, Champ, Icone, Message, useTitre } from "../ui.jsx";
import { useAdmin } from "./Admin.jsx";

const MAX_PREUVES = 12;
const FORMATS_IMAGE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

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

  useEffect(() => setF(original), [original]);

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

  // Les preuves s'enregistrent aussitôt, comme l'image : elles ne passent pas
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
      setPreuve({ envoi: false, erreur: `${MAX_PREUVES} captures au plus : retires-en une d'abord.` });
      return;
    }
    const refus = fichiers.find((x) => !FORMATS_IMAGE[x.type] || x.size > 5 * 1024 * 1024);
    if (refus) {
      setPreuve({ envoi: false, erreur: `« ${refus.name} » : une image JPEG, PNG ou WebP de 5 Mo au plus.` });
      return;
    }
    setPreuve({ envoi: true, erreur: null });
    try {
      const urls = [];
      for (const [i, fichier] of fichiers.slice(0, place).entries()) {
        urls.push(await televerserImage(`offres/${offre.id}/preuves/${Date.now()}-${i}.${FORMATS_IMAGE[fichier.type]}`, fichier));
      }
      await enregistrerPreuves([...preuves, ...urls]);
      setPreuve({
        envoi: false,
        erreur: fichiers.length > place ? `Seules ${place} capture(s) ajoutée(s) : ${MAX_PREUVES} au plus.` : null,
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
        <Champ
          etiquette="Vidéo de présentation (facultatif)"
          id="video"
          type="url"
          inputMode="url"
          placeholder="https://youtu.be/…"
          value={f.video}
          onChange={maj("video")}
          erreur={erreurs.video}
          aide="Un lien YouTube (même non répertorié) ou un lien direct vers un fichier .mp4. Elle s'affiche sous l'accroche, à la place de l'image."
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
        <h2 className="titre-carte">Ils nous ont fait confiance</h2>
        <p className="texte-doux petit">
          Des captures de résultats ou de messages d'élèves, avec leur accord. Elles défilent sur la page de vente, juste
          après le bouton. {MAX_PREUVES} au plus ; sans capture, la partie ne s'affiche pas.
        </p>
        {preuves.length ? (
          <ul className="preuves-admin">
            {preuves.map((src, i) => (
              <li key={src}>
                <img src={src} alt={`Capture ${i + 1}`} loading="lazy" />
                <button type="button" className="icone-bouton" aria-label={`Retirer la capture ${i + 1}`} onClick={() => retirerPreuve(src)} disabled={preuve.envoi}>
                  <Icone nom="poubelle" taille={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className={`bouton bouton-discret ${preuve.envoi ? "en-charge" : ""}`}>
          {preuve.envoi ? <span className="roue" aria-hidden="true" /> : <Icone nom="plus" taille={18} />}
          <span>Ajouter des captures</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={ajouterPreuves} hidden disabled={preuve.envoi || preuves.length >= MAX_PREUVES} />
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
