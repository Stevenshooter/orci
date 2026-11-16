// Les mini-séries du propriétaire : le prix du Premium, les séries, et leurs
// parties. Une vidéo importée va dans un seau privé : les spectateurs ne
// reçoivent qu'un lien qui expire. Un lien YouTube ne coûte rien en bande
// passante, mais il se partage.

import { useState } from "react";
import { fcfa } from "../lib/format.js";
import { imageLisible, typeImage } from "../lib/image.js";
import { cheminStockage, inserer, lire, modifier, supprimer, supprimerFichier, televerser, televerserImage } from "../lib/supa.js";
import { videoIntegree } from "../lib/video.js";
import { Bouton, Champ, Chargement, Confirmer, Copier, Icone, Message, useDonnees, useTitre } from "../ui.jsx";
import { useAdmin } from "./Admin.jsx";

const MAX_VIDEO = 50 * 1024 * 1024;
const FORMATS_VIDEO = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const FORMATS_IMAGE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function versSlug(t) {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 50)
    .replace(/-+$/, "");
}

/** Une adresse de série libre, tirée du titre : « la-tontine-de-minuit », sinon « -2 », « -3 »… */
function slugLibre(titre, pris) {
  const base = versSlug(titre).length >= 2 ? versSlug(titre) : "serie";
  let s = base;
  for (let i = 2; pris.has(s); i++) s = `${base}-${i}`;
  return s;
}

function duree(s) {
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} min${r ? ` ${String(r).padStart(2, "0")}` : ""}` : `${r} s`;
}

/** La durée d'une vidéo, lue dans le navigateur avant l'envoi (null si illisible). */
function dureeVideo(fichier) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(fichier);
    let fini = false;
    const finir = (d) => {
      if (fini) return;
      fini = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) && d > 0 ? Math.min(36000, Math.max(1, Math.round(d))) : null);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => finir(v.duration);
    v.onerror = () => finir(null);
    setTimeout(() => finir(null), 8000);
    v.src = url;
  });
}

export default function Series() {
  useTitre("Séries · Orci");
  const { formateur } = useAdmin();
  const d = useDonnees(async () => {
    const [series, premium] = await Promise.all([
      lire("series?select=*,episodes(id,numero,titre,video,duree,gratuit)&order=created_at.desc&episodes.order=numero.asc"),
      lire("offres?select=id,slug,prix,facturation,duree_jours,publiee&series=eq.true&order=created_at.asc&limit=1"),
    ]);
    return { series, premium: premium[0] ?? null };
  }, []);
  const [ouverte, setOuverte] = useState(null); // l'id de la série ouverte, ou "nouvelle"

  if (d.charge && !d.donnees) return <Chargement />;
  if (!d.donnees) {
    return (
      <Message type="erreur" titre="Les séries n'ont pas pu se charger." action={<Bouton variante="discret" onClick={() => d.recharger()}>Réessayer</Bouton>}>
        {d.erreur?.message}
      </Message>
    );
  }

  const { series, premium } = d.donnees;
  const recharger = () => d.recharger({ silencieux: true });
  const pris = new Set(series.map((s) => s.slug));

  return (
    <div className="pile-grande series-admin">
      <div className="tete-page">
        <div>
          <h1>Tes séries</h1>
          <p className="texte-doux">La partie 1 attire sur TikTok ; la suite se débloque avec le Premium.</p>
        </div>
        <a className="bouton bouton-discret" href="/" target="_blank" rel="noopener noreferrer">
          <Icone nom="oeil" taille={18} />
          <span>Voir le site</span>
        </a>
      </div>

      <PrixPremium key={premium?.prix ?? "aucun"} premium={premium} onFait={recharger} />

      {ouverte === "nouvelle" ? (
        <section className="carte">
          <EditeurSerie
            serie={null}
            formateurId={formateur?.id}
            pris={pris}
            onFermer={() => setOuverte(null)}
            onCree={(id) => {
              setOuverte(id);
              recharger();
            }}
            onChange={recharger}
          />
        </section>
      ) : (
        <div>
          <Bouton icone="plus" onClick={() => setOuverte("nouvelle")}>Nouvelle série</Bouton>
        </div>
      )}

      {series.length ? (
        <ul className="series-liste">
          {series.map((s) => (
            <li key={s.id} className="carte">
              {ouverte === s.id ? (
                <EditeurSerie serie={s} formateurId={formateur?.id} pris={pris} onFermer={() => setOuverte(null)} onChange={recharger} />
              ) : (
                <LigneSerie serie={s} onOuvrir={() => setOuverte(s.id)} />
              )}
            </li>
          ))}
        </ul>
      ) : ouverte !== "nouvelle" ? (
        <p className="vide">Aucune série pour l'instant. Crée ta première série, puis ajoute ses parties.</p>
      ) : null}

      <section className="carte pile conseils-video">
        <h2 className="titre-carte">Bien préparer tes vidéos</h2>
        <ul className="liste-conseils">
          <li>MP4 vertical, 50 Mo au plus par partie. Exporte en 720p : une partie de 1 à 2 minutes pèse alors 5 à 15 Mo.</li>
          <li>
            Le plan gratuit de Supabase compte 1 Go de stockage et environ 5 Go de vidéos regardées par mois (à peu près
            500 parties vues). Au-delà, Supabase prévient puis peut limiter tout Orci, paiements compris : passe alors au
            plan Pro (25 $ par mois).
          </li>
          <li>Un lien YouTube « non répertorié » ne coûte rien, mais un abonné peut le copier et le partager : garde-le pour les parties gratuites.</li>
        </ul>
      </section>
    </div>
  );
}

function PrixPremium({ premium, onFait }) {
  const [prix, setPrix] = useState(premium ? String(premium.prix) : "");
  const [etat, setEtat] = useState({ envoi: false, message: null });
  if (!premium) {
    return (
      <Message type="attention" titre="L'abonnement Premium n'existe pas encore.">
        Il est créé à la mise en ligne des séries. Sans lui, les parties Premium restent fermées.
      </Message>
    );
  }
  const valeur = Number.parseInt(prix.replace(/\D/g, ""), 10);
  const valide = Number.isInteger(valeur) && valeur >= 100 && valeur <= 10_000_000;

  async function enregistrer(e) {
    e.preventDefault();
    if (!valide) return;
    setEtat({ envoi: true, message: null });
    try {
      await modifier("offres", `id=eq.${premium.id}`, { prix: valeur });
      setEtat({ envoi: false, message: { type: "succes", texte: `C'est enregistré : le Premium coûte ${fcfa(valeur)} par mois.` } });
      onFait();
    } catch (err) {
      setEtat({ envoi: false, message: { type: "erreur", texte: err.message } });
    }
  }

  return (
    <form className="carte pile" onSubmit={enregistrer} noValidate>
      <h2 className="titre-carte">Abonnement Premium</h2>
      <p className="texte-doux petit">
        Un paiement Mobile Money ouvre la suite de toutes les séries pendant {premium.duree_jours ?? 30} jours.
        {premium.publiee ? "" : " Il est hors ligne : personne ne peut l'acheter."}
      </p>
      <div className="rangee rangee-bas">
        <Champ
          etiquette="Prix par mois (FCFA)"
          id="prix-premium"
          inputMode="numeric"
          value={prix}
          onChange={(e) => setPrix(e.target.value)}
          erreur={prix && !valide ? "Entre 100 et 10 000 000 FCFA." : undefined}
        />
        <Bouton type="submit" charge={etat.envoi} disabled={!valide || valeur === premium.prix}>Enregistrer</Bouton>
      </div>
      {etat.message ? (
        <p className={`petit ${etat.message.type === "succes" ? "texte-succes" : "texte-alerte"}`} role="status">{etat.message.texte}</p>
      ) : null}
    </form>
  );
}

function LigneSerie({ serie, onOuvrir }) {
  const n = serie.episodes?.length ?? 0;
  return (
    <div className="serie-ligne">
      <span className="serie-mini">
        {serie.pochette_url ? <img src={serie.pochette_url} alt="" /> : <Icone nom="lecture" taille={20} />}
      </span>
      <span className="serie-ligne-corps">
        <strong>{serie.titre}</strong>
        <span className="texte-doux petit">
          {n} partie{n > 1 ? "s" : ""} · {serie.publiee ? <span className="texte-succes">En ligne</span> : "Brouillon"}
        </span>
      </span>
      <Bouton variante="discret" icone="crayon" onClick={onOuvrir}>Gérer</Bouton>
    </div>
  );
}

function EditeurSerie({ serie, formateurId, pris, onFermer, onCree, onChange }) {
  const nouvelle = !serie;
  const [f, setF] = useState({ titre: serie?.titre ?? "", synopsis: serie?.synopsis ?? "", publiee: serie?.publiee ?? false });
  const [etat, setEtat] = useState({ envoi: false, message: null });
  const [pochette, setPochette] = useState({ envoi: false, erreur: null });
  const lien = serie ? `${window.location.origin}/s/${serie.slug}` : null;
  const change = !serie || f.titre !== serie.titre || f.synopsis !== (serie.synopsis ?? "") || f.publiee !== serie.publiee;

  async function enregistrer(e) {
    e.preventDefault();
    const titre = f.titre.trim();
    if (!titre) {
      setEtat({ envoi: false, message: { type: "erreur", texte: "Donne un titre à ta série." } });
      return;
    }
    setEtat({ envoi: true, message: null });
    try {
      const valeurs = { titre, synopsis: f.synopsis.trim() || null, publiee: f.publiee };
      if (nouvelle) {
        const [cree] = await inserer("series", { ...valeurs, formateur_id: formateurId, slug: slugLibre(titre, pris) });
        onCree(cree.id);
        return;
      }
      await modifier("series", `id=eq.${serie.id}`, valeurs);
      setEtat({
        envoi: false,
        message: { type: "succes", texte: f.publiee ? "C'est enregistré : la série est en ligne." : "C'est enregistré. Brouillon : le public ne la voit pas." },
      });
      onChange();
    } catch (err) {
      setEtat({
        envoi: false,
        message: { type: "erreur", texte: err.code === "23505" ? "Une autre série a déjà cette adresse. Change un peu le titre." : err.message },
      });
    }
  }

  async function choisirPochette(e) {
    const brut = e.target.files?.[0];
    e.target.value = "";
    if (!brut || !serie) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(typeImage(brut))) {
      setPochette({ envoi: false, erreur: "Choisis une image JPG, PNG ou WebP." });
      return;
    }
    setPochette({ envoi: true, erreur: null });
    try {
      const fichier = await imageLisible(brut, { cote: 1600, qualite: 0.85 });
      if (fichier.size > 5 * 1024 * 1024) throw new Error("L'image dépasse 5 Mo. Réduis-la avant de l'envoyer.");
      const url = await televerserImage(`series/${serie.id}/pochette-${Date.now()}.${FORMATS_IMAGE[fichier.type] ?? "jpg"}`, fichier);
      await modifier("series", `id=eq.${serie.id}`, { pochette_url: url });
      const ancienne = cheminStockage(serie.pochette_url, "medias");
      if (ancienne) supprimerFichier("medias", ancienne);
      setPochette({ envoi: false, erreur: null });
      onChange();
    } catch (err) {
      setPochette({ envoi: false, erreur: err.message });
    }
  }

  async function supprimerSerie() {
    const fichiers = (serie.episodes ?? []).filter((p) => !p.video.startsWith("youtube:")).map((p) => p.video);
    await supprimer("series", `id=eq.${serie.id}`);
    for (const c of fichiers) supprimerFichier("episodes", c);
    const image = cheminStockage(serie.pochette_url, "medias");
    if (image) supprimerFichier("medias", image);
    onFermer();
    onChange();
  }

  return (
    <div className="pile-grande editeur-serie">
      <div className="rangee rangee-espacee">
        <h2 className="titre-carte">{nouvelle ? "Nouvelle série" : serie.titre}</h2>
        <button type="button" className="lien-discret" onClick={onFermer}>Fermer</button>
      </div>

      <form className="pile" onSubmit={enregistrer} noValidate>
        <Champ etiquette="Titre" id={`titre-${serie?.id ?? "nouvelle"}`} value={f.titre} onChange={(e) => setF((x) => ({ ...x, titre: e.target.value }))} maxLength={80} placeholder="La Tontine de Minuit" />
        <div className="champ">
          <label htmlFor={`synopsis-${serie?.id ?? "nouvelle"}`}>Résumé (facultatif)</label>
          <textarea
            id={`synopsis-${serie?.id ?? "nouvelle"}`}
            rows={3}
            maxLength={600}
            value={f.synopsis}
            onChange={(e) => setF((x) => ({ ...x, synopsis: e.target.value }))}
            placeholder="Deux phrases qui donnent envie de voir la suite."
          />
        </div>
        <label className="interrupteur">
          <input type="checkbox" checked={f.publiee} onChange={(e) => setF((x) => ({ ...x, publiee: e.target.checked }))} />
          <span className="interrupteur-piste" aria-hidden="true" />
          <span>
            <strong>{f.publiee ? "Série en ligne" : "Brouillon"}</strong>
            <span className="texte-doux petit bloc">{f.publiee ? "Elle apparaît sur l'accueil d'Orci." : "Invisible pour le public : prépare ses parties tranquillement."}</span>
          </span>
        </label>
        <div className="rangee">
          <Bouton type="submit" charge={etat.envoi} disabled={!change}>{nouvelle ? "Créer la série" : "Enregistrer"}</Bouton>
        </div>
        {etat.message ? (
          <p className={`petit ${etat.message.type === "succes" ? "texte-succes" : "texte-alerte"}`} role="status">{etat.message.texte}</p>
        ) : null}
      </form>

      {serie ? (
        <>
          {serie.publiee ? (
            <div className="pile">
              <p className="etiquette">Lien de la série</p>
              <div className="rangee">
                <code className="code-coupe">{lien}</code>
                <Copier texte={lien}>Copier</Copier>
              </div>
            </div>
          ) : null}

          <div className="pochette-admin">
            <span className="serie-mini serie-mini-grande">
              {serie.pochette_url ? <img src={serie.pochette_url} alt="Pochette de la série" /> : <Icone nom="lecture" taille={24} />}
            </span>
            <div className="pile">
              <p className="etiquette">Pochette</p>
              <p className="texte-doux petit">Image verticale (9:16), comme sur TikTok. 5 Mo au plus.</p>
              <label className={`bouton bouton-discret ${pochette.envoi ? "en-charge" : ""}`}>
                {pochette.envoi ? <span className="roue" aria-hidden="true" /> : <Icone nom="plus" taille={18} />}
                <span>{serie.pochette_url ? "Changer la pochette" : "Ajouter la pochette"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,.avif" onChange={choisirPochette} hidden disabled={pochette.envoi} />
              </label>
              {pochette.erreur ? <p className="champ-aide champ-aide-erreur">{pochette.erreur}</p> : null}
            </div>
          </div>

          <Parties serie={serie} onChange={onChange} />

          <Confirmer question={`Supprimer « ${serie.titre} » et toutes ses parties ? C'est définitif.`} libelle="Supprimer la série" onConfirmer={supprimerSerie}>
            {(ouvrir) => (
              <div>
                <Bouton variante="discret" icone="poubelle" onClick={ouvrir}>Supprimer la série</Bouton>
              </div>
            )}
          </Confirmer>
        </>
      ) : (
        <p className="texte-doux petit">Crée la série pour ajouter sa pochette et ses parties.</p>
      )}
    </div>
  );
}

function Parties({ serie, onChange }) {
  const parties = serie.episodes ?? [];
  const prochaine = parties.reduce((m, p) => Math.max(m, p.numero), 0) + 1;
  return (
    <div className="pile">
      <p className="etiquette">Parties</p>
      {parties.length ? (
        <ol className="parties-admin">
          {parties.map((p) => (
            <li key={p.id}>
              <LignePartie serie={serie} partie={p} onChange={onChange} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="texte-doux petit">Aucune partie pour l'instant.</p>
      )}
      <AjoutPartie key={prochaine} serie={serie} numero={prochaine} onAjout={onChange} />
    </div>
  );
}

function LignePartie({ serie, partie, onChange }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const youtube = partie.video.startsWith("youtube:");
  const d = duree(partie.duree);

  async function basculerGratuit() {
    setEnvoi(true);
    setErreur(null);
    try {
      await modifier("episodes", `id=eq.${partie.id}`, { gratuit: !partie.gratuit });
      onChange();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer() {
    try {
      await supprimer("episodes", `id=eq.${partie.id}`);
      if (!youtube) supprimerFichier("episodes", partie.video);
      onChange();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <div className="partie-admin">
      <span className="partie-num">{partie.numero}</span>
      <span className="partie-admin-corps">
        <strong>{partie.titre || `Partie ${partie.numero}`}</strong>
        <span className="texte-doux petit">{[youtube ? "YouTube" : "Vidéo importée", d].filter(Boolean).join(" · ")}</span>
        {erreur ? <span className="petit texte-alerte">{erreur}</span> : null}
      </span>
      <label className="interrupteur interrupteur-compact" title="Gratuite ou réservée au Premium">
        <input type="checkbox" checked={partie.gratuit} onChange={basculerGratuit} disabled={envoi} />
        <span className="interrupteur-piste" aria-hidden="true" />
        <span className="petit">{partie.gratuit ? "Gratuite" : "Premium"}</span>
      </label>
      {serie.publiee ? (
        <a className="lien-discret" href={`/s/${serie.slug}/${partie.numero}`} target="_blank" rel="noopener noreferrer" title="Regarder sur le site">
          <Icone nom="oeil" taille={18} />
        </a>
      ) : null}
      <Confirmer question={`Supprimer la partie ${partie.numero} ?`} libelle="Supprimer" onConfirmer={retirer}>
        {(ouvrir) => (
          <button type="button" className="lien-discret" onClick={ouvrir} title="Supprimer la partie" aria-label={`Supprimer la partie ${partie.numero}`}>
            <Icone nom="poubelle" taille={18} />
          </button>
        )}
      </Confirmer>
    </div>
  );
}

function AjoutPartie({ serie, numero, onAjout }) {
  const [titre, setTitre] = useState("");
  const [gratuit, setGratuit] = useState(numero === 1);
  const [lien, setLien] = useState("");
  const [envoi, setEnvoi] = useState(null); // null, { progression }, ou "lien"
  const [erreur, setErreur] = useState(null);

  async function ajouter(video, d) {
    await inserer("episodes", { serie_id: serie.id, numero, titre: titre.trim() || null, video, duree: d, gratuit });
    onAjout();
  }

  function message(err) {
    return err.code === "23505" ? `La partie ${numero} existe déjà. Recharge la page.` : err.message;
  }

  async function choisirFichier(e) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    const ext = FORMATS_VIDEO[fichier.type];
    if (!ext) {
      setErreur("Choisis une vidéo MP4, WebM ou MOV.");
      return;
    }
    if (fichier.size > MAX_VIDEO) {
      setErreur(`Cette vidéo fait ${Math.ceil(fichier.size / 1048576)} Mo : 50 Mo au plus. Exporte-la en 720p.`);
      return;
    }
    setErreur(null);
    setEnvoi({ progression: 0 });
    const chemin = `${serie.id}/${numero}-${Date.now()}.${ext}`;
    try {
      const d = await dureeVideo(fichier);
      await televerser("episodes", chemin, fichier, { progression: (p) => setEnvoi({ progression: p }) });
      try {
        await ajouter(chemin, d);
      } catch (err) {
        supprimerFichier("episodes", chemin);
        throw err;
      }
    } catch (err) {
      setEnvoi(null);
      setErreur(message(err));
    }
  }

  async function ajouterLien(e) {
    e.preventDefault();
    const v = videoIntegree(lien);
    const id = v?.type === "youtube" ? /\/embed\/([^?/#]+)/.exec(v.src)?.[1] : null;
    if (!id) {
      setErreur("Colle un lien YouTube valide : youtube.com/watch?v=…, youtu.be/… ou youtube.com/shorts/…");
      return;
    }
    setErreur(null);
    setEnvoi("lien");
    try {
      await ajouter(`youtube:${id}`, null);
    } catch (err) {
      setEnvoi(null);
      setErreur(message(err));
    }
  }

  const occupe = Boolean(envoi);
  return (
    <div className="ajout-partie pile">
      <p className="ajout-partie-titre">Ajouter la partie {numero}</p>
      <Champ etiquette="Titre (facultatif)" id={`titre-partie-${serie.id}`} value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={80} placeholder={`Partie ${numero}`} />
      <label className="interrupteur">
        <input type="checkbox" checked={gratuit} onChange={(e) => setGratuit(e.target.checked)} disabled={occupe} />
        <span className="interrupteur-piste" aria-hidden="true" />
        <span>
          <strong>{gratuit ? "Partie gratuite" : "Partie Premium"}</strong>
          <span className="texte-doux petit bloc">{gratuit ? "Tout le monde peut la regarder." : "Réservée aux abonnés Premium."}</span>
        </span>
      </label>
      <div className="rangee">
        <label className={`bouton bouton-or ${occupe && envoi !== "lien" ? "en-charge" : ""}`}>
          {occupe && envoi !== "lien" ? <span className="roue" aria-hidden="true" /> : <Icone nom="plus" taille={18} />}
          <span>Importer la vidéo</span>
          <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={choisirFichier} hidden disabled={occupe} />
        </label>
      </div>
      {envoi && typeof envoi === "object" ? (
        <div className="envoi-video" role="status">
          <progress value={envoi.progression} max={1} />
          <span>Envoi : {Math.round(envoi.progression * 100)} % — garde cette page ouverte.</span>
        </div>
      ) : null}
      <form className="rangee rangee-bas" onSubmit={ajouterLien} noValidate>
        <Champ
          etiquette="ou un lien YouTube"
          id={`lien-partie-${serie.id}`}
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          placeholder="https://youtu.be/…"
          inputMode="url"
          autoComplete="off"
        />
        <Bouton type="submit" variante="discret" charge={envoi === "lien"} disabled={!lien.trim() || occupe}>Ajouter</Bouton>
      </form>
      {erreur ? <p className="champ-aide champ-aide-erreur" role="alert">{erreur}</p> : null}
    </div>
  );
}
