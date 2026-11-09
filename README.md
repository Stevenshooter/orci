# Orci

Une page de vente, un paiement Mobile Money, et des accès livrés tout seuls.
Orci ne stocke pas la formation : les vidéos restent dans **Google Drive**, les
lives sur **Google Meet**, la communauté dans **Telegram** et **WhatsApp**. Orci
encaisse, ouvre les accès de chaque acheteur, les referme à la fin, et compte.

## Ce que fait chaque outil

| Outil | Livraison | Fin d'accès |
| --- | --- | --- |
| Telegram | Lien d'entrée personnel (1 personne, 24 h) créé au clic de l'acheteur ; le bot reconnaît son entrée | Le bot le sort du groupe |
| Google Drive | Le dossier « Orci — formation » est partagé en lecture sur son Gmail | Le partage est retiré |
| Google Meet | Invitation aux lives à venir, dans son agenda | Retiré des lives à venir |
| WhatsApp | L'acheteur demande à rejoindre ; le formateur accepte (pas d'API de groupe) | Marqué « à retirer » pour le formateur |
| Lien | Ouvert dès le paiement | — |

Les accès expirés et les livraisons en erreur sont repris **chaque heure** par
`pg_cron`, qui appelle la fonction `expirations`.

## Architecture

```
src/                 le site (React, esbuild) — page de vente, paiement, « Mes accès », espace admin
supabase/migrations  le schéma, les politiques RLS, les fonctions SQL, la passe horaire
supabase/functions   paiement · acces · telegram · google · expirations (Deno)
```

- **Acheteurs sans compte** : la page `/acces/<jeton>` est leur clé (48 caractères aléatoires).
- **Propriétaire** : connexion par lien e-mail. Le premier compte connecté devient propriétaire.
- **Secrets** : générés par la base dans le schéma `prive` (jamais exposé par l'API).
  Le jeton du bot Telegram et les identifiants Google se collent dans l'espace admin.
- **Paiement** : mode `simulation` tant que Nexus Pay n'est pas branché
  (`supabase/functions/_shared/paiement.ts`). En mode test, seul le propriétaire
  connecté peut « acheter » ; un visiteur lit « Les paiements ouvrent bientôt ».
  Les achats de test sont marqués et s'effacent depuis le tableau de bord.
- **Référence ≠ accès** : le navigateur qui lance un paiement reçoit une clé
  (la référence signée par un secret de la base). Sans elle, connaître la
  référence d'une commande payée ne rend pas son lien d'accès.

## Développer

```bash
npm install
npm run dev          # construit dans dist/ et sert sur http://localhost:5173
npm run build        # construction de production
```

Le site parle directement au projet Supabase indiqué dans `src/config.js`.

## Mettre en ligne

**Supabase** (une fois) :

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy paiement acces telegram google expirations
```

puis, dans l'éditeur SQL :

```sql
select public.definir_reglage('functions_url', 'https://<ref>.supabase.co/functions/v1');
select public.definir_reglage('site_url', 'https://<ton-site>');
```

Dans **Authentication → URL Configuration**, mets l'adresse du site dans
**Site URL** : c'est là que revient le lien de connexion.

**Vercel** : importer le dépôt, rien à régler (`vercel.json` s'en charge).

## Brancher les outils (espace admin → Outils)

1. **Telegram** : crée un bot avec @BotFather, colle son jeton, fais-le
   administrateur du groupe (inviter + bannir), puis envoie `/lier CODE` dans le groupe.
2. **WhatsApp** : active « Approuver les nouveaux participants », colle le lien d'invitation.
3. **Google** : crée un client OAuth « Application Web » (API Drive et Calendar
   activées, écran de consentement publié), avec l'URI de redirection affichée
   dans Orci ; colle l'ID et le secret, connecte ton compte, crée le dossier.

## Reste à faire

- Brancher **Nexus Pay** (création de transaction, notification, vérification).
- Plusieurs formateurs : le schéma est prêt (`formateurs`, `commission`), l'interface non.
