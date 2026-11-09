// Les outils : relier Telegram, WhatsApp, Google Drive et Google Meet, une fois
// pour toutes. Ensuite, Orci livre et reprend les accès tout seul.

import { useEffect, useState } from "react";
import { dateHeure } from "../lib/format.js";
import { naviguer, useAdresse } from "../lib/routeur.jsx";
import { fonction, inserer, lire, modifier } from "../lib/supa.js";
import { Bouton, Champ, Chargement, Confirmer, Copier, Icone, ICONE_OUTIL, LienBouton, Message, useDonnees, useTitre } from "../ui.jsx";
import { useAdmin } from "./Admin.jsx";

const RETOURS_GOOGLE = {
  ok: ["succes", "Ton compte Google est connecté."],
  refus: ["attention", "Tu as refusé l'autorisation chez Google. Rien n'a été connecté."],
  expire: ["attention", "La demande a expiré. Clique à nouveau sur « Connecter mon compte Google »."],
  "sans-refresh": ["erreur", "Google n'a pas donné d'accès durable. Retire Orci des applications de ton compte Google, puis reconnecte-le."],
  erreur: ["erreur", "La connexion à Google a échoué. Vérifie l'ID client, le code secret et l'URI de redirection, puis réessaie."],
};

export default function Outils() {
  useTitre("Outils · Orci");
  const { offre } = useAdmin();
  const { recherche } = useAdresse();
  const [retourGoogle] = useState(() => new URLSearchParams(recherche).get("google"));

  useEffect(() => {
    if (retourGoogle) naviguer("/admin/outils", { remplacer: true });
  }, [retourGoogle]);

  const outils = useDonnees(() => lire(`outils?select=*&offre_id=eq.${offre.id}&order=ordre`), [offre.id]);
  const google = useDonnees(() => fonction("google", { action: "etat" }, { admin: true }), []);

  if (outils.charge && !outils.donnees) return <Chargement />;
  if (outils.erreur && !outils.donnees) return <Message type="erreur" titre="Les outils n'ont pas pu se charger.">{outils.erreur.message}</Message>;

  const par = Object.fromEntries((outils.donnees || []).map((o) => [o.type, o]));
  const recharger = () => outils.recharger({ silencieux: true });
  const avecGoogle = par.drive || par.meet;
  const [typeRetour, texteRetour] = RETOURS_GOOGLE[retourGoogle] || [];

  return (
    <div className="pile-grande">
      <div className="tete-page">
        <div>
          <h1>Outils</h1>
          <p className="texte-doux">Relie-les une fois : Orci donne l'accès à chaque acheteur, et le reprend quand il se termine.</p>
        </div>
      </div>

      {texteRetour ? <Message type={typeRetour}>{texteRetour}</Message> : null}

      {par.telegram ? <OutilTelegram outil={par.telegram} recharger={recharger} /> : null}
      {par.whatsapp ? <OutilWhatsApp outil={par.whatsapp} recharger={recharger} /> : null}
      {avecGoogle ? <CompteGoogle etat={google} /> : null}
      {par.drive ? <OutilDrive outil={par.drive} google={google.donnees} recharger={recharger} /> : null}
      {par.meet ? <OutilMeet outil={par.meet} google={google.donnees} offre={offre} recharger={recharger} /> : null}
      {par.lien ? (
        <OutilLien outil={par.lien} recharger={recharger} />
      ) : (
        <AjouterLien offre={offre} recharger={recharger} ordre={(outils.donnees || []).length + 1} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CadreOutil({ outil, titre, recharger, children, etat }) {
  return (
    <section className={`carte outil-admin ${outil.actif ? "" : "inactif"}`}>
      <header className="outil-tete">
        <span className={`recu-icone recu-${outil.type}`}><Icone nom={ICONE_OUTIL[outil.type]} taille={22} /></span>
        <div>
          <h2>{titre}</h2>
          <p className="texte-doux petit">Sur la page : « {outil.titre} »</p>
        </div>
        {etat ? <span className={`puce puce-${etat[0]}`}>{etat[1]}</span> : null}
      </header>
      <div className="pile">{children}</div>
      <Reglages outil={outil} recharger={recharger} />
    </section>
  );
}

function Reglages({ outil, recharger }) {
  const [titre, setTitre] = useState(outil.titre);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  useEffect(() => setTitre(outil.titre), [outil.titre]);

  async function enregistrer(champs) {
    setEnvoi(true);
    setErreur(null);
    try {
      await modifier("outils", `id=eq.${outil.id}`, champs);
      await recharger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <details className="avance">
      <summary>Réglages de l'outil</summary>
      <div className="pile">
        <Champ etiquette="Nom affiché aux acheteurs" id={`titre-${outil.id}`} value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={80} />
        <div className="rangee">
          <Bouton variante="discret" charge={envoi} disabled={titre.trim().length < 2 || titre === outil.titre} onClick={() => enregistrer({ titre: titre.trim() })}>
            Enregistrer le nom
          </Bouton>
          <Bouton variante="discret" charge={envoi} onClick={() => enregistrer({ actif: !outil.actif })}>
            {outil.actif ? "Ne plus proposer cet outil" : "Proposer à nouveau cet outil"}
          </Bouton>
        </div>
        {erreur ? <Message type="erreur">{erreur}</Message> : null}
      </div>
    </details>
  );
}

function Etape({ numero, titre, fait, children }) {
  return (
    <div className={`etape ${fait ? "fait" : ""}`}>
      <span className="etape-numero" aria-hidden="true">{fait ? <Icone nom="coche" taille={16} /> : numero}</span>
      <div className="etape-corps">
        <p className="etape-titre">{titre}</p>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

function OutilTelegram({ outil, recharger }) {
  const chatId = outil.config?.chat_id;
  // Relu quand le groupe change : l'état comprend les droits du bot dans le groupe.
  const etat = useDonnees(() => fonction("telegram", { action: "etat" }, { admin: true }), [chatId]);
  const [jeton, setJeton] = useState("");
  const [code, setCode] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [changer, setChanger] = useState(false);

  const e = etat.donnees;
  const bot = e?.bot;
  const configure = Boolean(e?.configure && bot);

  // Le code attend son message dans le groupe : on regarde toutes les 4 s.
  useEffect(() => {
    if (!code || chatId) return undefined;
    const t = setInterval(recharger, 4000);
    return () => clearInterval(t);
  }, [code, chatId, recharger]);
  useEffect(() => {
    if (chatId) setCode(null);
  }, [chatId]);

  async function agir(nom, f) {
    setEnvoi(nom);
    setErreur(null);
    try {
      await f();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(null);
    }
  }

  const installer = () =>
    agir("installer", async () => {
      await fonction("telegram", { action: "installer", jeton: jeton.trim() }, { admin: true });
      setJeton("");
      setChanger(false);
      await etat.recharger();
    });

  const genererCode = () =>
    agir("code", async () => {
      const r = await fonction("telegram", { action: "code", outil_id: outil.id }, { admin: true });
      setCode(r);
    });

  const droits = e?.droits;
  const pret = configure && chatId && droits?.admin && droits?.inviter && droits?.bannir;

  return (
    <CadreOutil
      outil={outil}
      titre="Groupe Telegram"
      recharger={recharger}
      etat={pret ? ["succes", "Prêt"] : chatId ? ["or", "À vérifier"] : ["neutre", "À relier"]}
    >
      <p className="texte-doux">
        Chaque acheteur reçoit un lien d'entrée valable pour lui seul, 24 heures. Quand son accès se termine, le bot le
        sort du groupe.
      </p>

      {etat.charge && !e ? <Chargement texte="Vérification du bot…" /> : null}

      <Etape numero="1" titre="Crée ton bot" fait={configure && !changer}>
        {configure && !changer ? (
          <>
            <p>Bot <strong>@{bot}</strong> branché sur Orci.</p>
            {e.webhook === false ? <Message type="attention">Le bot ne reçoit plus les messages{e.derniere_erreur ? ` : ${e.derniere_erreur}` : ""}. Recolle son jeton.</Message> : null}
            <button type="button" className="lien-discret" onClick={() => setChanger(true)}>Changer de bot</button>
          </>
        ) : (
          <>
            <ol className="consignes">
              <li>Dans Telegram, ouvre <strong>@BotFather</strong> et envoie <code>/newbot</code>.</li>
              <li>Donne-lui un nom (par exemple « Accès Motivation Family »), puis un identifiant qui finit par <code>bot</code>.</li>
              <li>BotFather te répond avec un jeton qui ressemble à <code>123456789:AA…</code>. Colle-le ici.</li>
            </ol>
            <Champ etiquette="Jeton du bot" id="jeton-bot" value={jeton} onChange={(ev) => setJeton(ev.target.value)} autoComplete="off" spellCheck={false} placeholder="123456789:AA…" />
            <div className="rangee">
              <Bouton onClick={installer} charge={envoi === "installer"} disabled={jeton.trim().length < 20}>Brancher le bot</Bouton>
              {changer ? <Bouton variante="discret" onClick={() => setChanger(false)}>Annuler</Bouton> : null}
            </div>
          </>
        )}
      </Etape>

      <Etape numero="2" titre="Fais de lui un administrateur du groupe" fait={Boolean(droits?.admin && droits?.inviter && droits?.bannir)}>
        <p>
          Dans ton groupe : <strong>Ajouter des membres</strong> → cherche {bot ? <strong>@{bot}</strong> : "ton bot"}. Puis{" "}
          <strong>Administrateurs</strong> → <strong>Ajouter un administrateur</strong> → ton bot, avec les droits{" "}
          <strong>Inviter des utilisateurs</strong> et <strong>Bannir des utilisateurs</strong>.
        </p>
        {chatId && droits && !(droits.admin && droits.inviter && droits.bannir) ? (
          <Message type="attention" titre="Il manque des droits au bot.">
            {!droits.admin ? "Le bot n'est pas administrateur du groupe." : !droits.inviter ? "Il lui manque « Inviter des utilisateurs »." : "Il lui manque « Bannir des utilisateurs »."}
          </Message>
        ) : null}
      </Etape>

      <Etape numero="3" titre="Relie le groupe à Orci" fait={Boolean(chatId)}>
        {chatId ? (
          <p>Relié au groupe <strong>« {outil.config?.chat_titre || "sans nom"} »</strong>.</p>
        ) : null}
        {code ? (
          <div className="code-liaison">
            <p>Envoie ce message dans le groupe (valable 2 heures) :</p>
            <div className="rangee">
              <code className="code-gros">{code.bot ? `/lier@${code.bot} ${code.code}` : `/lier ${code.code}`}</code>
              <Copier texte={code.bot ? `/lier@${code.bot} ${code.code}` : `/lier ${code.code}`} />
            </div>
            {!chatId ? <p className="texte-doux petit"><span className="roue" aria-hidden="true" /> En attente du message…</p> : null}
          </div>
        ) : (
          <Bouton variante={chatId ? "discret" : "or"} onClick={genererCode} charge={envoi === "code"} disabled={!configure}>
            {chatId ? "Relier un autre groupe" : "Obtenir mon code de liaison"}
          </Bouton>
        )}
      </Etape>

      {erreur ? <Message type="erreur">{erreur}</Message> : null}
      {configure ? (
        <div className="rangee">
          <Bouton variante="discret" icone="rafraichir" onClick={() => { etat.recharger(); recharger(); }}>Vérifier à nouveau</Bouton>
        </div>
      ) : null}
    </CadreOutil>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

function OutilWhatsApp({ outil, recharger }) {
  const [lien, setLien] = useState(outil.config?.lien ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [ok, setOk] = useState(false);
  useEffect(() => setLien(outil.config?.lien ?? ""), [outil.config?.lien]);

  async function enregistrer(e) {
    e.preventDefault();
    setErreur(null);
    setOk(false);
    const l = lien.trim();
    if (l && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/.test(l)) {
      setErreur("Colle le lien d'invitation du groupe : il commence par https://chat.whatsapp.com/");
      return;
    }
    setEnvoi(true);
    try {
      const [frais] = await lire(`outils?select=config&id=eq.${outil.id}`);
      const config = { ...(frais?.config ?? {}) };
      if (l) config.lien = l;
      else delete config.lien;
      await modifier("outils", `id=eq.${outil.id}`, { config });
      await recharger();
      setOk(true);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <CadreOutil outil={outil} titre="Groupe WhatsApp" recharger={recharger} etat={outil.config?.lien ? ["succes", "Prêt"] : ["neutre", "À relier"]}>
      <p className="texte-doux">
        WhatsApp ne laisse aucun service gérer un groupe à ta place : c'est toi qui acceptes les demandes. Orci te dit
        qui a payé, et qui retirer quand un accès se termine.
      </p>
      <ol className="consignes">
        <li>Dans le groupe : <strong>Paramètres du groupe</strong> → <strong>Approuver les nouveaux participants</strong> : activé.</li>
        <li>Puis <strong>Inviter via un lien</strong> → <strong>Copier le lien</strong>, et colle-le ici.</li>
        <li>Les acheteurs demandent à entrer ; accepte ceux que la page <strong>Acheteurs</strong> marque « à accepter ».</li>
      </ol>
      <form className="pile" onSubmit={enregistrer} noValidate>
        <Champ etiquette="Lien d'invitation du groupe" id="lien-whatsapp" type="url" placeholder="https://chat.whatsapp.com/…" value={lien} onChange={(e) => setLien(e.target.value)} />
        <div className="rangee">
          <Bouton type="submit" charge={envoi} disabled={lien.trim() === (outil.config?.lien ?? "")}>Enregistrer le lien</Bouton>
          {ok ? <span className="texte-succes">Enregistré.</span> : null}
        </div>
        {erreur ? <Message type="erreur">{erreur}</Message> : null}
      </form>
      <p className="texte-doux petit">
        Garde ce lien pour toi : un acheteur qui le partage n'entre pas sans ton accord, puisque tu approuves chaque
        demande.
      </p>
    </CadreOutil>
  );
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

function CompteGoogle({ etat }) {
  const e = etat.donnees;
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [modifierIds, setModifierIds] = useState(false);
  const [envoi, setEnvoi] = useState(null);
  const [erreur, setErreur] = useState(null);

  async function agir(nom, f) {
    setEnvoi(nom);
    setErreur(null);
    try {
      await f();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(null);
      return;
    }
    setEnvoi(null);
  }

  const enregistrerIds = (ev) => {
    ev.preventDefault();
    return agir("ids", async () => {
      await fonction("google", { action: "identifiants", client_id: clientId.trim(), client_secret: secret.trim() }, { admin: true });
      setClientId("");
      setSecret("");
      setModifierIds(false);
      await etat.recharger();
    });
  };

  const connecter = () =>
    agir("connecter", async () => {
      const r = await fonction("google", { action: "connecter" }, { admin: true });
      window.location.assign(r.url);
      // On quitte la page : le bouton reste en chargement.
      await new Promise(() => {});
    });

  const oublier = () =>
    agir("oublier", async () => {
      await fonction("google", { action: "oublier" }, { admin: true });
      await etat.recharger();
    });

  if (etat.charge && !e) return <section className="carte"><Chargement texte="Vérification de Google…" /></section>;
  if (etat.erreur && !e) return <Message type="erreur" titre="L'état de Google n'a pas pu se lire.">{etat.erreur.message}</Message>;

  const pret = e.identifiants && e.connecte && e.drive && e.agenda;

  return (
    <section className="carte outil-admin">
      <header className="outil-tete">
        <span className="recu-icone recu-google"><Icone nom="cadenas" taille={22} /></span>
        <div>
          <h2>Compte Google</h2>
          <p className="texte-doux petit">Pour partager le dossier Drive et inviter aux lives Meet en ton nom.</p>
        </div>
        <span className={`puce puce-${pret ? "succes" : "neutre"}`}>{pret ? "Connecté" : "À connecter"}</span>
      </header>

      <Etape numero="1" titre="Crée ton application Google" fait={e.identifiants && !modifierIds}>
        {e.identifiants && !modifierIds ? (
          <>
            <p>Application Google enregistrée.</p>
            <button type="button" className="lien-discret" onClick={() => setModifierIds(true)}>Remplacer l'ID client et le code secret</button>
          </>
        ) : (
          <form className="pile" onSubmit={enregistrerIds} noValidate>
            <ol className="consignes">
              <li>Ouvre <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a> et crée un projet « Orci ».</li>
              <li><strong>API et services</strong> → <strong>Bibliothèque</strong> : active <strong>Google Drive API</strong> et <strong>Google Calendar API</strong>.</li>
              <li><strong>Écran de consentement OAuth</strong> : type <strong>Externe</strong>, puis <strong>Publier l'application</strong>. Restée en test, elle perdrait l'accès au bout de 7 jours.</li>
              <li><strong>Identifiants</strong> → <strong>Créer des identifiants</strong> → <strong>ID client OAuth</strong> → <strong>Application Web</strong>. Dans <strong>URI de redirection autorisés</strong>, colle :</li>
            </ol>
            <div className="rangee">
              <code className="code-bloc">{e.redirect_uri}</code>
              <Copier texte={e.redirect_uri} />
            </div>
            <Champ etiquette="ID client" id="client-id" value={clientId} onChange={(ev) => setClientId(ev.target.value)} autoComplete="off" spellCheck={false} placeholder="…apps.googleusercontent.com" />
            <Champ etiquette="Code secret du client" id="client-secret" type="password" value={secret} onChange={(ev) => setSecret(ev.target.value)} autoComplete="off" />
            <div className="rangee">
              <Bouton type="submit" charge={envoi === "ids"} disabled={!clientId.trim() || !secret.trim()}>Enregistrer</Bouton>
              {modifierIds ? <Bouton type="button" variante="discret" onClick={() => setModifierIds(false)}>Annuler</Bouton> : null}
            </div>
          </form>
        )}
      </Etape>

      <Etape numero="2" titre="Connecte ton compte Google" fait={e.connecte}>
        {e.connecte ? (
          <>
            <p>Connecté avec <strong>{e.email || "ton compte Google"}</strong>.</p>
            {!e.drive || !e.agenda ? (
              <Message type="attention" titre="Il manque une autorisation.">
                {!e.drive ? "Drive n'a pas été autorisé. " : ""}
                {!e.agenda ? "L'agenda n'a pas été autorisé. " : ""}
                Reconnecte ton compte et coche toutes les cases demandées.
              </Message>
            ) : null}
            <div className="rangee">
              {!e.drive || !e.agenda ? <Bouton onClick={connecter} charge={envoi === "connecter"}>Reconnecter</Bouton> : null}
              <Confirmer question="Déconnecter Google ? Les nouveaux acheteurs ne recevront plus le dossier ni les invitations." libelle="Déconnecter" onConfirmer={oublier} charge={envoi === "oublier"}>
                {(ouvrir) => <Bouton variante="discret" onClick={ouvrir}>Déconnecter</Bouton>}
              </Confirmer>
            </div>
          </>
        ) : (
          <>
            <p>
              Google affichera peut-être « Application non validée » : clique sur <strong>Paramètres avancés</strong>, puis
              sur <strong>Accéder à Orci</strong>. C'est normal, c'est ta propre application. Coche toutes les autorisations.
            </p>
            <Bouton onClick={connecter} charge={envoi === "connecter"} disabled={!e.identifiants}>Connecter mon compte Google</Bouton>
          </>
        )}
      </Etape>

      {erreur ? <Message type="erreur">{erreur}</Message> : null}
    </section>
  );
}

function OutilDrive({ outil, google, recharger }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const dossier = outil.config?.dossier_url;
  const pretGoogle = google?.connecte && google?.drive;

  async function creer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await fonction("google", { action: "dossier", outil_id: outil.id }, { admin: true });
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <CadreOutil outil={outil} titre="Dossier Google Drive" recharger={recharger} etat={dossier ? ["succes", "Prêt"] : ["neutre", "À créer"]}>
      <p className="texte-doux">
        Orci crée un dossier dans ton Drive. Tu y ranges tes vidéos ; chaque acheteur le reçoit en lecture seule sur son
        Gmail, et le perd quand son accès se termine. Orci ne voit que ce dossier, rien d'autre de ton Drive.
      </p>
      {dossier ? (
        <>
          <div className="rangee">
            <LienBouton variante="discret" icone="dossier" href={dossier} target="_blank" rel="noopener noreferrer">Ouvrir le dossier dans Drive</LienBouton>
          </div>
          <p className="texte-doux petit">Dépose tes vidéos et fichiers dans ce dossier, directement depuis Drive.</p>
        </>
      ) : (
        <Bouton onClick={creer} charge={envoi} disabled={!pretGoogle} icone="plus">Créer le dossier de la formation</Bouton>
      )}
      {!pretGoogle && !dossier ? <p className="texte-doux petit">Connecte d'abord ton compte Google, plus haut.</p> : null}
      {erreur ? <Message type="erreur">{erreur}</Message> : null}
    </CadreOutil>
  );
}

function versLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function OutilMeet({ outil, google, offre, recharger }) {
  const lives = useDonnees(() => lire(`lives?select=*&offre_id=eq.${offre.id}&order=debut`), [offre.id]);
  const demain = new Date(Date.now() + 86400000);
  demain.setHours(19, 0, 0, 0);
  const [titre, setTitre] = useState("");
  const [debut, setDebut] = useState(versLocal(demain));
  const [duree, setDuree] = useState("60");
  const [envoi, setEnvoi] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [succes, setSucces] = useState(null);
  const pretGoogle = google?.connecte && google?.agenda;

  const aVenir = (lives.donnees || []).filter((l) => new Date(l.debut).getTime() + l.duree_minutes * 60000 > Date.now());
  const passes = (lives.donnees || []).filter((l) => new Date(l.debut).getTime() + l.duree_minutes * 60000 <= Date.now());

  async function programmer(e) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    const d = new Date(debut);
    if (titre.trim().length < 2) return setErreur("Donne un titre au live.");
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return setErreur("Choisis une date à venir.");
    setEnvoi("creer");
    try {
      const r = await fonction("google", { action: "live", offre_id: offre.id, titre: titre.trim(), debut: d.toISOString(), duree: Number(duree) }, { admin: true });
      setTitre("");
      setSucces(r.invites ? `Live programmé : ${r.invites} acheteur${r.invites > 1 ? "s" : ""} invité${r.invites > 1 ? "s" : ""}.` : "Live programmé. Les acheteurs seront invités dès qu'ils donnent leur Gmail.");
      await lives.recharger({ silencieux: true });
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(null);
    }
  }

  async function supprimerLive(id) {
    setEnvoi(id);
    setErreur(null);
    try {
      await fonction("google", { action: "supprimer_live", live_id: id }, { admin: true });
      await lives.recharger({ silencieux: true });
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <CadreOutil outil={outil} titre="Lives Google Meet" recharger={recharger} etat={aVenir.length ? ["succes", `${aVenir.length} à venir`] : ["neutre", "Aucun live"]}>
      <p className="texte-doux">
        Chaque live devient un événement de ton agenda avec son lien Meet. Les acheteurs y sont invités sur leur Gmail ;
        ceux dont l'accès se termine sont retirés des lives à venir.
      </p>

      {aVenir.length ? (
        <ul className="lives">
          {aVenir.map((l) => (
            <li key={l.id} className="live">
              <div>
                <p className="live-titre">{l.titre}</p>
                <p className="live-date"><Icone nom="horloge" taille={15} /> {dateHeure(l.debut)} · {l.duree_minutes}&nbsp;min</p>
              </div>
              <div className="rangee">
                {l.meet_url ? <LienBouton variante="discret" className="bouton-petit" href={l.meet_url} target="_blank" rel="noopener noreferrer">Meet</LienBouton> : null}
                <Confirmer question="Annuler ce live ? Les invités sont prévenus par Google." libelle="Annuler le live" onConfirmer={() => supprimerLive(l.id)} charge={envoi === l.id}>
                  {(ouvrir) => <button type="button" className="icone-bouton" aria-label={`Annuler le live ${l.titre}`} onClick={ouvrir}><Icone nom="poubelle" taille={16} /></button>}
                </Confirmer>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="pile programmer-live" onSubmit={programmer} noValidate>
        <p className="etiquette">Programmer un live</p>
        <Champ etiquette="Titre" id="titre-live" placeholder="Séance 1 : les bases" value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} />
        <div className="grille-2">
          <Champ etiquette="Date et heure" id="debut-live" type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} />
          <Champ
            etiquette="Durée"
            id="duree-live"
            enfant={
              <select id="duree-live" value={duree} onChange={(e) => setDuree(e.target.value)}>
                {[30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? " 30" : ""}`}</option>)}
              </select>
            }
          />
        </div>
        <div className="rangee">
          <Bouton type="submit" charge={envoi === "creer"} disabled={!pretGoogle} icone="camera">Programmer le live</Bouton>
        </div>
        {!pretGoogle ? <p className="texte-doux petit">Connecte d'abord ton compte Google, plus haut.</p> : null}
        {succes ? <Message type="succes">{succes}</Message> : null}
        {erreur ? <Message type="erreur">{erreur}</Message> : null}
      </form>

      {passes.length ? <p className="texte-doux petit">{passes.length} live{passes.length > 1 ? "s" : ""} passé{passes.length > 1 ? "s" : ""}.</p> : null}
    </CadreOutil>
  );
}

// ---------------------------------------------------------------------------
// Lien libre
// ---------------------------------------------------------------------------

function OutilLien({ outil, recharger }) {
  const [url, setUrl] = useState(outil.config?.url ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  useEffect(() => setUrl(outil.config?.url ?? ""), [outil.config?.url]);

  async function enregistrer(e) {
    e.preventDefault();
    setErreur(null);
    const u = url.trim();
    if (u && !/^https:\/\/\S+\.\S+/.test(u)) return setErreur("Une adresse qui commence par https://");
    setEnvoi(true);
    try {
      await modifier("outils", `id=eq.${outil.id}`, { config: { ...(outil.config ?? {}), url: u || undefined } });
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <CadreOutil outil={outil} titre="Lien" recharger={recharger} etat={outil.config?.url ? ["succes", "Prêt"] : ["neutre", "Vide"]}>
      <p className="texte-doux">Un lien de plus, ouvert dès le paiement : une page, une playlist, un document.</p>
      <form className="pile" onSubmit={enregistrer} noValidate>
        <Champ etiquette="Adresse" id="url-lien" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="rangee">
          <Bouton type="submit" charge={envoi} disabled={url.trim() === (outil.config?.url ?? "")}>Enregistrer</Bouton>
        </div>
        {erreur ? <Message type="erreur">{erreur}</Message> : null}
      </form>
    </CadreOutil>
  );
}

function AjouterLien({ offre, recharger, ordre }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  async function ajouter() {
    setEnvoi(true);
    setErreur(null);
    try {
      await inserer("outils", { offre_id: offre.id, type: "lien", titre: "Ressources de la formation", config: {}, ordre });
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <section className="carte ajouter-outil">
      <div>
        <p className="titre-carte">Un lien en plus ?</p>
        <p className="texte-doux">Une page, une playlist, un document : ouvert à chaque acheteur dès le paiement.</p>
      </div>
      <Bouton variante="discret" icone="plus" onClick={ajouter} charge={envoi}>Ajouter un lien</Bouton>
      {erreur ? <Message type="erreur">{erreur}</Message> : null}
    </section>
  );
}
