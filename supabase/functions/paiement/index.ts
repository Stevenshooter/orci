// paiement — ouvrir un paiement, suivre son statut, recevoir les notifications
// NelsiusPay, et (en mode test) simuler.
//
// Appelée par la page de paiement, sans compte : verify_jwt = false. Rien ici ne
// fait confiance au navigateur pour le prix ; il est relu dans `offres`.
//
// LA RÉFÉRENCE NE SUFFIT PAS À OUVRIR LES ACCÈS. Elle s'affiche à l'écran, se
// recopie, part en capture dans un groupe WhatsApp. Le navigateur qui ouvre le
// paiement reçoit donc une « clé » (la référence signée par un secret de la
// base) : lui seul récupère le lien d'accès une fois le paiement reçu.
//
// EN MODE TEST, SEUL LE PROPRIÉTAIRE « ACHÈTE ». Sinon n'importe quel visiteur
// s'offrirait la formation d'un clic sur « Paiement réussi », ou avec un numéro
// de test du bac à sable NelsiusPay.
//
// Actions (POST JSON) :
//   creer   { offre, nom, telephone, operateur, email?, source? } → { reference, cle, mode, test, url }
//   statut  { reference, cle?, annule? }                           → { statut, jeton?, detenteur, test, … }
//   simuler { reference, resultat: "paye" | "echec" }              → { statut }  (commande de test, propriétaire)
//   mode                                                           → { mode, test, … }
//
// Notification NelsiusPay (POST, corps { event, data }, en-tête X-Nelsius-Signature) :
// l'adresse de cette fonction se colle dans NelsiusPay → Paramètres → Webhooks.

import {
  admin,
  aleatoire,
  egal,
  emailValide,
  erreur,
  json,
  preflight,
  proprietaire,
  siteUrl,
  telephoneNormalise,
  texte,
  urlFonction,
} from "../_shared/base.ts";
import { appliquerStatut, CHAMPS_SUIVI, type CommandeSuivie, verifierChezFournisseur } from "../_shared/commande.ts";
import { lireEtat, nelsiusReel, nelsiusSignatureConfiguree, signatureNelsius, simulerNelsius } from "../_shared/nelsius.ts";
import { creerPaiement, modePaiement, paiementDeTest } from "../_shared/paiement.ts";
import { signature } from "../_shared/signature.ts";

const OPERATEURS = new Set(["mtn", "orange"]);

function cleDe(reference: string): Promise<string> {
  return signature(`commande:${reference}`);
}

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;
  if (req.method !== "POST") return erreur("Méthode non permise", 405);

  // Le corps est lu brut : la signature d'une notification se calcule dessus.
  const brut = await req.text();
  let corps: Record<string, unknown> = {};
  try {
    const c = brut ? JSON.parse(brut) : {};
    if (c && typeof c === "object") corps = c as Record<string, unknown>;
  } catch {
    // Corps illisible : traité comme vide.
  }

  try {
    if (req.headers.has("x-nelsius-signature") || (typeof corps.event === "string" && corps.action === undefined)) {
      return await notification(brut, corps, req.headers.get("x-nelsius-signature"));
    }
    switch (corps.action) {
      case "creer":
        return await creer(req, corps);
      case "statut":
        return await statut(corps);
      case "simuler":
        return await simuler(req, corps);
      case "mode":
        return await mode(req);
      default:
        return erreur("Action inconnue");
    }
  } catch (e) {
    console.error("[paiement]", e);
    return erreur(e instanceof Error ? e.message : "Erreur interne", 500);
  }
});

async function mode(req: Request): Promise<Response> {
  const m = await modePaiement();
  const reponse: Record<string, unknown> = { mode: m, test: paiementDeTest(m) };
  // Le propriétaire voit aussi de quoi régler NelsiusPay.
  if (await proprietaire(req)) {
    reponse.webhook = urlFonction("paiement");
    reponse.signature = nelsiusSignatureConfiguree();
    reponse.cle = m === "nelsius" ? (nelsiusReel() ? "reelle" : "test") : null;
  }
  return json(reponse);
}

async function creer(req: Request, corps: Record<string, unknown>): Promise<Response> {
  const slug = texte(corps.offre, 60);
  const nom = texte(corps.nom, 80).replace(/\s+/g, " ");
  const telephone = telephoneNormalise(texte(corps.telephone, 30));
  const choix = texte(corps.operateur, 20).toLowerCase();
  // Avec NelsiusPay, l'acheteur choisit son moyen (Mobile Money, carte, PayPal)
  // sur la page sécurisée : l'opérateur n'est exigé qu'en simulation.
  const operateur = OPERATEURS.has(choix) ? choix : null;
  const emailBrut = texte(corps.email, 254);
  const email = emailBrut ? emailValide(emailBrut) : null;
  const source = texte(corps.source, 60).toLowerCase().replace(/[^a-z0-9_.-]/g, "") || null;
  const mode = await modePaiement();

  if (nom.length < 2) return erreur("Écris ton nom complet.");
  if (!telephone) return erreur("Ce numéro ne semble pas valide : 9 chiffres au Cameroun, ou avec l'indicatif.");
  if (mode === "simulation" && !operateur) return erreur("Choisis ton opérateur.");
  if (emailBrut && !email) return erreur("Cette adresse e-mail ne semble pas valide.");

  const { data: offre } = await admin()
    .from("offres")
    .select("id, titre, prix, devise, formateur_id, publiee")
    .eq("slug", slug)
    .maybeSingle();
  if (!offre || !offre.publiee) return erreur("Cette offre n'existe pas ou n'est plus en vente.", 404);

  const test = paiementDeTest(mode);
  if (test) {
    const moi = await proprietaire(req);
    if (!moi || moi.formateurId !== offre.formateur_id) {
      return erreur("Les paiements ne sont pas encore ouverts pour cette formation.", 403);
    }
  }

  // Garde-fou : cinq tentatives par numéro et par quart d'heure.
  const { data: connu } = await admin().from("acheteurs").select("id").eq("telephone", telephone).maybeSingle();
  if (connu) {
    const { count } = await admin()
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("acheteur_id", connu.id)
      .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
    if ((count ?? 0) >= 5) return erreur("Trop de tentatives. Réessaie dans quelques minutes.", 429);
  }

  // L'e-mail n'est écrit que s'il est donné : ne pas effacer celui d'un acheteur
  // qui revient sans le retaper.
  const champs: Record<string, unknown> = { telephone, nom };
  if (email) champs.email = email;
  const { data: acheteur, error: eA } = await admin()
    .from("acheteurs")
    .upsert(champs, { onConflict: "telephone" })
    .select("id")
    .single();
  if (eA || !acheteur) throw new Error(`Acheteur non enregistré : ${eA?.message}`);

  const reference = `ORC-${aleatoire(6).toUpperCase()}`;

  const { data: commande, error: eC } = await admin()
    .from("commandes")
    .insert({
      reference,
      offre_id: offre.id,
      formateur_id: offre.formateur_id,
      acheteur_id: acheteur.id,
      montant: offre.prix,
      devise: offre.devise,
      operateur,
      fournisseur: mode,
      test,
      source,
    })
    .select("id")
    .single();
  if (eC || !commande) throw new Error(`Commande non enregistrée : ${eC?.message}`);

  const site = await siteUrl(req);
  try {
    const r = await creerPaiement(mode, {
      reference,
      montant: offre.prix,
      devise: offre.devise,
      description: offre.titre,
      telephone,
      operateur: operateur ?? "",
      nom,
      email,
      retourUrl: `${site}/paiement/${reference}`,
      annulationUrl: `${site}/paiement/${reference}?annule=1`,
    });
    await admin()
      .from("commandes")
      .update({ fournisseur_reference: r.fournisseurReference, meta: { creation: r.brut } })
      .eq("id", commande.id);
    return json({ reference, cle: await cleDe(reference), mode, test, url: r.url });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await admin().from("commandes").update({ statut: "echec", meta: { erreur: m } }).eq("id", commande.id);
    return erreur(`Le paiement n'a pas pu démarrer : ${m}`, 502);
  }
}

// La page d'attente interroge toutes les trois secondes : NelsiusPay n'est
// relu qu'une fois toutes les huit secondes par commande.
const dernierCoup = new Map<string, number>();
const ECART = 8_000;

async function statut(corps: Record<string, unknown>): Promise<Response> {
  const reference = texte(corps.reference, 40);
  const { data: c } = await admin()
    .from("commandes")
    .select(`${CHAMPS_SUIVI}, test, operateur, offres(titre, slug, formateurs(nom, whatsapp))`)
    .eq("reference", reference)
    .maybeSingle();
  if (!c) return erreur("Commande introuvable.", 404);

  const cle = texte(corps.cle, 80);
  const detenteur = cle.length > 0 && egal(cle, await cleDe(reference));

  let etat = c.statut as string;
  let jeton: string | null = null;
  let applique = false;

  if (etat === "en_cours" && c.fournisseur === "nelsius") {
    const avant = dernierCoup.get(reference) ?? 0;
    const abandon = detenteur && corps.annule === true;
    if (abandon || Date.now() - avant > ECART) {
      dernierCoup.set(reference, Date.now());
      if (dernierCoup.size > 500) dernierCoup.clear();
      try {
        const r = await verifierChezFournisseur(c as CommandeSuivie);
        if (r) {
          etat = r.statut;
          jeton = r.jeton;
          applique = true;
        }
      } catch (e) {
        console.error(`[paiement] ${reference} : statut NelsiusPay illisible :`, e instanceof Error ? e.message : e);
      }
      // L'acheteur est revenu par « annuler » et rien n'a été payé : on le dit
      // tout de suite. Une notification « payé » plus tardive l'emporterait.
      if (abandon && etat === "en_cours") {
        etat = (await appliquerStatut(c.id, "annule", { annule_par: "acheteur" })).statut;
      }
    }
  }

  // Déjà payé : rejouer est sans effet sur l'accès, et rend son jeton.
  if (etat === "paye" && !applique) {
    const r = await appliquerStatut(c.id, "paye");
    etat = r.statut;
    jeton = r.jeton;
  }
  if (!detenteur) jeton = null;

  // deno-lint-ignore no-explicit-any
  const o = (c as any).offres;
  return json({
    statut: etat,
    jeton,
    detenteur,
    mode: c.fournisseur,
    test: c.test,
    montant: c.montant,
    devise: c.devise,
    operateur: c.operateur,
    offre: o ? { titre: o.titre, slug: o.slug } : null,
    formateur: o?.formateurs ?? null,
  });
}

async function simuler(req: Request, corps: Record<string, unknown>): Promise<Response> {
  const moi = await proprietaire(req);
  if (!moi) return erreur("Connecte-toi à l'espace admin sur cet appareil pour simuler un paiement.", 401);

  const reference = texte(corps.reference, 40);
  const voulu = corps.resultat === "paye" ? "paye" : "echec";
  const { data: c } = await admin()
    .from("commandes")
    .select(`${CHAMPS_SUIVI}, test, formateur_id`)
    .eq("reference", reference)
    .maybeSingle();
  if (!c || !c.test || c.formateur_id !== moi.formateurId) return erreur("Commande introuvable.", 404);

  if (c.fournisseur === "simulation") {
    if ((await modePaiement()) !== "simulation") return erreur("Le mode test est coupé.", 403);
    const r = await appliquerStatut(c.id, voulu, { simulation: voulu });
    return json({ statut: r.statut });
  }

  if (c.fournisseur === "nelsius") {
    if (nelsiusReel()) return erreur("La clé NelsiusPay posée est réelle : plus de simulation possible.", 403);
    await simulerNelsius(c.fournisseur_reference || c.reference, voulu);
    const r = await verifierChezFournisseur(c as CommandeSuivie);
    return json({ statut: r?.statut ?? c.statut });
  }

  return erreur("Ce paiement ne se simule pas.", 400);
}

/**
 * Une notification NelsiusPay. Son contenu ne décide de rien : elle déclenche
 * la relecture du statut chez NelsiusPay. Signée et vérifiée, elle sert de repli
 * si NelsiusPay ne répond pas à cet instant.
 */
async function notification(brut: string, corps: Record<string, unknown>, sig: string | null): Promise<Response> {
  const valide = await signatureNelsius(brut, sig);
  if (valide === false) return erreur("Signature invalide", 401);

  const evenement = texte(corps.event, 60);
  const data = corps.data && typeof corps.data === "object" ? corps.data : {};
  const recu = lireEtat(data);

  let c: CommandeSuivie | null = null;
  if (recu.reference) {
    const { data: x } = await admin().from("commandes").select(CHAMPS_SUIVI).eq("reference", recu.reference).maybeSingle();
    c = x as CommandeSuivie | null;
  }
  if (!c && recu.transactionCode) {
    const { data: x } = await admin()
      .from("commandes")
      .select(CHAMPS_SUIVI)
      .eq("fournisseur_reference", recu.transactionCode)
      .maybeSingle();
    c = x as CommandeSuivie | null;
  }
  // Inconnue ou d'un autre fournisseur : on accuse réception, sinon NelsiusPay
  // rejouerait la notification sans fin.
  if (!c || c.fournisseur !== "nelsius") {
    console.warn(`[paiement] notification ${evenement || "?"} ignorée : ${recu.reference ?? recu.transactionCode ?? "sans référence"}`);
    return json({ recu: true });
  }

  if (valide === null) console.warn("[paiement] notification NelsiusPay non signée : pose NELSIUS_WEBHOOK_SECRET.");

  const r = await verifierChezFournisseur(c, valide === true ? recu : undefined);
  return json({ recu: true, statut: r?.statut ?? c.statut });
}
