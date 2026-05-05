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
- Ne jamais commiter une URL de webhook contenant une clé secrète: utiliser une variable d'environnement comme `ZOHO_MAIL_WEBHOOK_URL`.
- Les envois email directs doivent cibler les destinataires dans `to` et mettre `DTSC_CONTACT_EMAIL` seulement en copie; ne pas envoyer les diffusions à l'adresse contact comme destinataire principal.
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
- Les constantes partagées avec le client doivent rester dans un fichier neutre sans logique serveur, par exemple `lib/session-config.ts`.
- Les pages publiques importantes doivent rester dans `app/sitemap.ts`, `app/robots.ts` et avoir des métadonnées SEO cohérentes.
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
