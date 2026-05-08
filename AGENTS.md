# AGENTS.md

## Projet

Application Next.js App Router pour DTSC Platform, déployée sur Vercel avec Neon PostgreSQL, Prisma, TypeScript et OpenAI côté serveur.

## Garde-fous obligatoires

- Avant tout push, vérifier au minimum `git diff --check` et `git diff --cached --check`.
- Sur Windows PowerShell, lire les routes dynamiques Next.js avec `-LiteralPath`, par exemple:
  `Get-Content -LiteralPath app\api\support\tickets\[id]\route.ts`.
- Ne pas utiliser `Array.includes(session.role)` avec un tableau typé étroit comme `[UserRole.ADMIN, UserRole.SUPPORT]`.
  TypeScript infère alors `"ADMIN" | "SUPPORT"` et Vercel peut échouer si `session.role` est `UserRole`.
  Préférer une fonction explicite:
  `role === UserRole.ADMIN || role === UserRole.SUPPORT`.
- Après modification de `prisma/schema.prisma`, ajouter une migration SQL dans `prisma/migrations/.../migration.sql`.
- Les migrations Vercel sont exécutées par `pnpm prisma migrate deploy && pnpm build`.
- Ne jamais exposer `OPENAI_API_KEY`, `AUTH_SECRET`, `DATABASE_URL` ou mots de passe dans du code client.
- Toute route API mutante publique ou sensible doit avoir une protection d'origine, une validation Zod et, si elle peut être abusée, un rate limiting.
- `rateLimit()` dans `lib/rate-limit.ts` est asynchrone: toujours l'appeler avec `await`.
- Si `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` ne sont pas configurés, le rate limit retombe sur un fallback mémoire non suffisant pour forte charge.
- Ne pas réactiver le bootstrap admin en production après création du compte initial: `DEFAULT_ADMIN_BOOTSTRAP_ENABLED` doit rester `false`.
- Les headers de sécurité sont centralisés dans `next.config.ts`; toute nouvelle intégration externe nécessitant `connect-src` doit y être ajoutée explicitement.
- Ne jamais commiter une URL de webhook contenant une clé secrète: utiliser une variable d'environnement comme `ZOHO_MAIL_WEBHOOK_URL`.
- Les diffusions email doivent protéger les adresses: `to` doit cibler `DTSC_CONTACT_EMAIL`, les vrais destinataires doivent passer en `bcc`, et le contenu ne doit jamais afficher la liste des emails.
- Les routes de diffusion admin ne doivent jamais renvoyer la liste complète des emails au client; renvoyer `recipientCount` et journaliser les causes dans `ApiLog`.
- Les erreurs de diffusion admin doivent remonter un `message` exploitable côté UI au lieu d'un simple message générique.
- Si un modèle de diffusion contient `{user}`, envoyer des mails personnalisés individuellement avec un seul destinataire en CCI par envoi; un mail groupé ne peut pas personnaliser le nom par destinataire.
- Le payload Zoho Flow doit fournir des champs string compatibles Send Mail: `fromAddress`, `replyTo`, `toText`, `ccText`, `bccText`, `subject`, `bodyHtml`.
- Quand les variables `ZOHO_MAIL_*` API sont configurées, privilégier l'API Zoho Mail directe avant les fallbacks Zoho Flow/webhook.
- Les emails riches collés par l'admin doivent être nettoyés côté serveur avant envoi: retirer scripts, iframes, handlers `on*` et URLs `javascript:`.
- Les modules Administration visibles par `MANAGER` et `SUPPORT` doivent passer par `AppSetting.adminRoleAccess`; `ADMIN` garde toujours tous les blocs.
- Le module Entreprise remplace la navigation Documents. `/documents` doit rester une redirection vers `/company` tant que des anciens liens existent.
- Le contexte Entreprise du chatbot doit rester strictement isolé par `userId` et ne jamais mélanger les profils, activités ou documents de deux utilisateurs.
- Toute création de champ Entreprise doit être reflétée dans `lib/company-context.ts`, les validateurs Zod, Prisma, la migration SQL, le dashboard et la documentation.
- Les paiements MaishaPay doivent rester côté serveur: ne jamais exposer `MAISHAPAY_PUBLIC_API_KEY`, `MAISHAPAY_SECRET_API_KEY` ni `MAISHAPAY_CALLBACK_SECRET` au client.
- Le checkout MaishaPay payant doit exiger un `walletId`, mais le plan gratuit ne doit pas bloquer sur cette valeur.
- Les callbacks paiement doivent être idempotents autant que possible et journalisés dans `WebhookEvent`, `ApiLog` et/ou `AuditLog`.
- Les factures HTML/PDF doivent échapper les données utilisateur avant interpolation.
- Les routes d'upload documentaire doivent vérifier la session, la limite du plan actif, la taille, le type MIME et ne jamais envoyer de fichier brut à un composant client.
- Si les clés MaishaPay sont absentes, les plans payants doivent rester en maintenance explicite sans casser le plan gratuit.
- Supabase Storage doit rester strictement serveur: ne jamais exposer `SUPABASE_STORAGE_SERVICE_ROLE_KEY` côté client.
- L'extraction PDF doit rester côté serveur et respecter les limites de taille/type avant parsing.
- Le RAG documentaire doit rester isolé par `userId`: un utilisateur ne doit jamais récupérer les chunks d'un autre utilisateur.
- Si `pgvector` est utilisé, ajouter la migration `CREATE EXTENSION IF NOT EXISTS vector` et documenter le modèle d'embedding/dimension retenu.
- Les actions admin doivent toujours vérifier la session côté serveur et le rôle `ADMIN`.
- Les actions support de résolution de tickets doivent autoriser uniquement `ADMIN` et `SUPPORT`.
- Les nouveaux modules privés doivent être ajoutés dans `middleware.ts` pour éviter l'accès sans session.
- Pour les enums Prisma (`UserRole`, `UserStatus`), utiliser les valeurs importées depuis `@prisma/client` dans les requêtes Prisma plutôt que des chaînes libres.
- Les graphiques admin doivent rester bornés dans leur conteneur: utiliser `overflow-hidden`/`overflow-x-auto`, une hauteur fixe et calculer les barres sur un maximum relatif.
- Les composants serveur qui passent des données Prisma à un composant client doivent transmettre des objets JSON simples, pas des objets `Date` bruts.
- Les props passées aux composants doivent être utilisées ou supprimées: `pnpm build` échoue sur `@typescript-eslint/no-unused-vars`.
- Les limites d'usage chat doivent être validées côté API, pas uniquement côté UI.
- Les réponses `429 DAILY_LIMIT_REACHED` de `/api/chat` doivent inclure un `usage.resetAt` ISO pour afficher l'heure exacte de réinitialisation côté UI.
- Ne pas importer un module `"use client"` dans un composant serveur uniquement pour partager des constantes: extraire les constantes dans un fichier sans directive client.
- Les confirmations, erreurs et messages importants doivent passer par une boîte de dialogue applicative, pas par `alert`, `confirm` ou `prompt`.
- RBAC annonces/notifications: seul `ADMIN` modifie ou supprime les annonces; `ADMIN` modifie ou supprime tous les commentaires; un utilisateur peut seulement modifier son propre commentaire dans la fenêtre configurée; chaque utilisateur peut supprimer ou vider ses propres notifications.
- Les blocs de données qui peuvent grandir doivent utiliser la barre réutilisable `ListControls` avec `useSmartList` pour recherche accent-insensible et pagination côté UI.
- Toute évolution fonctionnelle importante doit être reflétée dans `DTSC_SYSTEM_PROMPT` dans `lib/openai.ts`, en distinguant clairement les fonctionnalités actives de la roadmap.
- Toute évolution fonctionnelle, API, schéma Prisma, variable d'environnement, intégration externe, règle de sécurité, workflow CI/CD ou comportement admin/client doit être documentée dans le même travail.
- Mettre à jour en priorité `docs/TECHNICAL_DOCUMENTATION.md` pour les détails techniques, puis `README.md` pour les changements utiles à l'installation, au déploiement ou à l'utilisation.
- Si une modification ajoute ou change une API, documenter la route, la méthode HTTP, le niveau d'accès, le payload attendu, la réponse et les variables d'environnement nécessaires.
- Si une modification ajoute ou change une intégration externe, documenter les secrets requis, le flux d'authentification, les endpoints appelés, les fallbacks et les règles de sécurité.
- Les constantes partagées avec le client doivent rester dans un fichier neutre sans logique serveur, par exemple `lib/session-config.ts`.
- Les pages publiques importantes doivent rester dans `app/sitemap.ts`, `app/robots.ts` et avoir des métadonnées SEO cohérentes.
- Les contenus publics administrables doivent passer par `PublicPublication`, des routes API `ADMIN` uniquement, une validation Zod et une journalisation `AuditLog`.
- Les onglets de la landing page doivent correspondre à des routes publiques dédiées; l'état actif doit se baser sur le `pathname`, pas sur un scroll de sections.
- Le contexte client du chatbot ne doit pas divulguer les détails internes de l'application (frameworks, schéma DB, routes API, variables, middleware, secrets). Il doit rester orienté services DTSC et fonctionnalités utiles aux clients.
- Les textes JSX avec apostrophes doivent utiliser `&apos;` si ce sont des noeuds texte directs.
- Les contenus publics sourcés doivent garder des liens vérifiables.

## Validation locale

Dans cet environnement Codex Windows, `pnpm` peut être absent. Si `pnpm build` ne peut pas être lancé localement, le signal bloquant devient:

- `git diff --check`
- `git diff --cached --check`
- inspection des imports inutilisés et des erreurs TypeScript évidentes
- lecture des logs Vercel après push

Quand `pnpm` est disponible, lancer:

```bash
pnpm build
```

## UI chatbot

Les réponses assistant sont rendues avec `Streamdown` et stylées via `.dtsc-assistant-markdown` dans `app/globals.css`.
Conserver une hiérarchie visible pour:

- `h1`, `h2`, `h3`
- listes ordonnées et non ordonnées
- citations
- tableaux
- code inline et blocs de code
