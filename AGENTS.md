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
- Les permissions métier internes doivent utiliser le poste officiel `DtscPosition` relié au dossier `HrcfoEmployee`, pas un texte libre. Les codes `CEO`, `COO`, `HR_CFO`, `SCO`, `CTO`, `MPO` et `LA` sont centralisés dans `lib/business-roles.ts`.
- `SCO` signifie Supply Chain Officer: achats, fournisseurs, stocks, inventaires, matériels, actifs et logistique. Ne pas l'assimiler au commercial; les droits SCO doivent dépendre du poste officiel `SCO` ou d'une implication explicite dans l'objet.
- `MPO` signifie Management & Projects Officer: portefeuille projets, cadrage, cahiers de charges, livrables, risques et coordination numérique. Ne pas l'assimiler au marketing.
- `LA` signifie Legal Advisor: dossiers juridiques, contrats, conventions, modèles, conformité, litiges, demandes juridiques et archivage confidentiel. Les documents `CEO_ONLY` ou `LA_CEO_ONLY` ne doivent être exposés qu'au poste LA, au CEO ou à un admin autorisé.
- La section Administration `CEO` et ses routes doivent passer par `requireAdminBlockAccess("ceo")`, valider avec `ceoSchemas`, journaliser `ApiLog`/`AuditLog` et consommer les données HR & CFO, COO et SCO sans les dupliquer inutilement.
- La Vue CEO consolidée doit conserver ses filtres `ceoStart`/`ceoEnd` dans l'URL et filtrer les métriques finance, RH, COO et SCO sans modifier les données source.
- Les objectifs et supervisions CEO assignés doivent apparaître dans `/activities` pour les collaborateurs concernés. Les commentaires utilisent `CooComment` avec `CEO_OBJECTIVE` ou `CEO_SUPERVISION` et doivent vérifier l'accès côté serveur.
- Les routes des sous-modules Administration HR & CFO et SCO doivent utiliser `requireAdminBlockAccess("hrCfo")` ou `requireAdminBlockAccess("sco")`, valider avec Zod, journaliser `ApiLog`/`AuditLog` et rester strictement internes.
- Les routes Administration MPO et CTO doivent utiliser `requireAdminBlockAccess("mpo")` ou `requireAdminBlockAccess("cto")`, valider avec `mpoSchemas`/`ctoSchemas`, journaliser `ApiLog`/`AuditLog`, et notifier uniquement les collaborateurs impliqués ou postes critiques concernés.
- Les routes Administration LA doivent utiliser `requireAdminBlockAccess("la")`, valider avec `laSchemas`, journaliser `ApiLog`/`AuditLog`, enrichir les collaborateurs/départements depuis les référentiels HR & CFO et notifier uniquement les postes LA/CEO ou collaborateurs impliqués.
- Les règles financières HR & CFO critiques doivent rester côté serveur dans `lib/hr-cfo-finance.ts`: création de budget avec solde disponible, transaction d'entrée/sortie, consommation budgétaire, génération de facture, paie et transaction d'abonnement. Ne jamais se contenter d'une validation frontend pour les soldes, budgets, comptes ou paies.
- Les statuts financiers impactants doivent rester centralisés dans `lib/hr-cfo-finance.ts`; `Brouillon` n'impacte jamais les comptes/budgets/KPIs, `Annulé` retire l'impact, et le libellé exact `capital de départ` augmente le compte sans entrer dans le chiffre d'affaires.
- Les paiements d'abonnement confirmés doivent créer une transaction d'entrée idempotente sur le compte financier `Banque`, jamais sur un compte arbitraire côté client.
- Le montant brut de paie doit provenir du dossier RH du collaborateur; le compte consommé vient du budget sélectionné. Le collaborateur ne doit voir dans `/activities` que ses propres paies et bulletins.
- Les commentaires opérationnels transversaux (`CooComment`) et partages de workflows (`CooWorkflowShare`) doivent vérifier l'appartenance ou le rôle côté API avant lecture/écriture.
- Les demandes collaboratives de `/activities` doivent utiliser `CollaboratorRequest`, rester visibles uniquement par le demandeur, le destinataire ou un admin autorisé, notifier le destinataire et rattacher les échanges à `CooComment` avec `entityType = COLLAB_REQUEST`.
- Les filtres de dates HR & CFO, SCO, COO et Activités DTSC doivent filtrer les listes et KPIs visibles sans modifier les données source.
- Les collaborateurs HR & CFO doivent référencer des `User` non-`CLIENT`; ne jamais créer, modifier ou supprimer un compte utilisateur depuis le dossier collaborateur. Les départements et comptes financiers doivent passer par leurs référentiels dédiés.
- Les champs opérationnels visibles comme `Responsable`, `Demandeur` ou `Assigné à` dans HR & CFO/SCO doivent être des combobox alimentées par les collaborateurs enregistrés, pas des champs texte libres.
- Les demandes d'achat SCO doivent sélectionner le fournisseur retenu depuis les fournisseurs enregistrés; ne pas réintroduire un champ fournisseur libre pour cette décision.
- Les stocks, inventaires, actifs et équipements SCO doivent pouvoir se rattacher au référentiel `MaterialItem` pour garder une traçabilité cohérente des biens matériels DTSC.
- Les éléments SCO doivent conserver la traçabilité transversale (`sourceSection`, `sourceItemId`, `relatedBudgetId`, `relatedProjectId`, `relatedTechnicalProjectId`, `relatedTaskId`, `relatedMissionId`) sans dupliquer les budgets HR & CFO ni les tâches COO.
- Les commentaires transversaux SCO/MPO/CTO/LA doivent utiliser `CooComment` avec contrôle d'accès côté serveur; les collaborateurs ne voient que les objets qui les concernent, sauf poste de supervision autorisé. Les commentaires LA doivent respecter le niveau de confidentialité du document ou dossier concerné.
- Les routes et écrans COO doivent passer par `requireAdminBlockAccess("coo")`, `cooSchemas`, `AuditLog` et `ApiLog`; les tâches, opérations, réunions, workflows, blocages et rapports doivent rester reliés aux départements et collaborateurs référencés.
- Les utilisateurs liés à `HrcfoEmployee.userId` doivent voir leurs activités internes dans `/activities`; ce module ne doit pas apparaître pour un utilisateur sans dossier collaborateur actif.
- Les pièces justificatives opérationnelles HR & CFO/SCO/COO ne doivent pas être saisies en texte libre: utiliser un input fichier, valider taille/type/RBAC côté serveur, stocker dans Supabase Storage via service role et servir via une route privée.
- Les factures et bulletins de paie doivent avoir des boutons UI explicites de téléchargement/impression; les données interpolées dans HTML/PDF doivent rester échappées.
- Une transaction validée ne doit pas être supprimée ou modifiée par un raccourci CRUD générique sans logique de contrepassation documentée; préférer une annulation métier journalisée.
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
- Les handlers React ne doivent pas garder de paramètres inutilisés (`event`, `_`, etc.): ESLint Vercel échoue sur `@typescript-eslint/no-unused-vars`.
- Les effets React doivent avoir des dépendances complètes ou des callbacks stabilisés avec `useCallback`; ne pas ignorer `react-hooks/exhaustive-deps` dans les composants client sensibles.
- Dans les composants client, ne pas passer directement `body?.record` ou une propriété JSON optionnelle à une fonction typée dans un callback d'état React: TypeScript peut perdre le narrowing pendant `pnpm build`. Stocker d'abord la valeur dans une constante locale (`const savedRecord = body?.record`) puis tester cette constante.
- Les objets de labels/enums partagés comme `lib/labels.ts` ne doivent jamais contenir deux fois la même clé: TypeScript échoue sur Vercel avec "An object literal cannot have multiple properties with the same name". Avant commit, inspecter les ajouts de labels pour fusionner les clés existantes au lieu de les répéter.
- Les limites d'usage chat doivent être validées côté API, pas uniquement côté UI.
- Les réponses `429 DAILY_LIMIT_REACHED` de `/api/chat` doivent inclure un `usage.resetAt` ISO pour afficher l'heure exacte de réinitialisation côté UI.
- Ne pas importer un module `"use client"` dans un composant serveur uniquement pour partager des constantes: extraire les constantes dans un fichier sans directive client.
- Les confirmations, erreurs et messages importants doivent passer par une boîte de dialogue applicative, pas par `alert`, `confirm` ou `prompt`.
- RBAC annonces/notifications: seul `ADMIN` modifie ou supprime les annonces; `ADMIN` modifie ou supprime tous les commentaires; un utilisateur peut seulement modifier son propre commentaire dans la fenêtre configurée; chaque utilisateur peut supprimer ou vider ses propres notifications.
- Les blocs de données qui peuvent grandir doivent utiliser la barre réutilisable `ListControls` avec `useSmartList` pour recherche accent-insensible et pagination côté UI.
- Les layouts publics mobiles doivent rester `overflow-x-hidden` avec des conteneurs `min-w-0`; vérifier en particulier le header public, le logo et les CTA pour éviter un rendu en deux largeurs sur navigateurs mobiles.
- L'historique du chatbot doit rester scrollable et peut être classé par `Conversation.projectName`; toute évolution du champ doit rester propriétaire `userId`.
- Les dossiers de conversations sont représentés par `ConversationProject`; supprimer un dossier ne doit pas supprimer les conversations, seulement retirer leur classement.
- Sur mobile/PWA, le chat doit garder la conversation active en plein espace principal et afficher l'historique via un panneau menu, pas par empilement qui écrase le fil.
- Toute fonctionnalité de partage doit utiliser l'API `navigator.share` si disponible et copier le lien en fallback, sans exposer de données privées au-delà de l'URL demandée.
- Les notifications utilisateur doivent respecter `notifySupportEnabled`, `notifyUsageEnabled`, `notifyBroadcastEnabled` et `pushNotificationsEnabled`.
- Les notifications navigateur/PWA ne doivent pas contourner l'authentification et ne doivent afficher que des extraits non sensibles.
- Toute évolution fonctionnelle importante doit être reflétée dans `DTSC_SYSTEM_PROMPT` dans `lib/openai.ts`, en distinguant clairement les fonctionnalités actives de la roadmap.
- Toute évolution publique, commerciale, FAQ, service DTSC, workflow client, agent IA public ou capacité chatbot doit aussi mettre à jour le contexte de l'assistant concerné et la FAQ de la landing page lorsque cela aide les visiteurs ou clients à comprendre la fonctionnalité.
- Toute évolution fonctionnelle, API, schéma Prisma, variable d'environnement, intégration externe, règle de sécurité, workflow CI/CD ou comportement admin/client doit être documentée dans le même travail.
- Mettre à jour en priorité `docs/TECHNICAL_DOCUMENTATION.md` pour les détails techniques, puis `README.md` pour les changements utiles à l'installation, au déploiement ou à l'utilisation.
- Mettre à jour `docs/CHANGELOG.md` avant chaque commit avec un résumé professionnel en français des ajouts, modifications, corrections, suppressions ou améliorations livrés.
- Mettre aussi à jour `app/conditions-utilisation/page.tsx`, `app/politique-confidentialite/page.tsx` et `app/politique-cookies/page.tsx` quand une modification impacte les conditions d'utilisation, les données personnelles, les cookies, le suivi, les emails, les paiements, les notifications, les documents ou les intégrations externes.
- Si une modification ajoute ou change une API, documenter la route, la méthode HTTP, le niveau d'accès, le payload attendu, la réponse et les variables d'environnement nécessaires.
- Si une modification ajoute ou change une intégration externe, documenter les secrets requis, le flux d'authentification, les endpoints appelés, les fallbacks et les règles de sécurité.
- Les constantes partagées avec le client doivent rester dans un fichier neutre sans logique serveur, par exemple `lib/session-config.ts`.
- Les pages publiques importantes doivent rester dans `app/sitemap.ts`, `app/robots.ts` et avoir des métadonnées SEO cohérentes.
- Le service worker PWA ne doit jamais mettre en cache les réponses `/api/*`, les pages privées HTML, les routes d'authentification ou des données utilisateur; limiter le cache aux assets statiques et à `/offline`.
- Les contenus publics administrables doivent passer par `PublicPublication`, des routes API `ADMIN` uniquement, une validation Zod et une journalisation `AuditLog`.
- Les contenus publics riches doivent être nettoyés avec `sanitizeRichHtml` avant stockage ou rendu; ne jamais rendre un HTML admin sans nettoyage serveur.
- Les onglets de la landing page doivent correspondre à des routes publiques dédiées; l'état actif doit se baser sur le `pathname`, pas sur un scroll de sections.
- Le contexte client du chatbot ne doit pas divulguer les détails internes de l'application (frameworks, schéma DB, routes API, variables, middleware, secrets). Il doit rester orienté services DTSC et fonctionnalités utiles aux clients.
- Les textes JSX avec apostrophes doivent utiliser `&apos;` si ce sont des noeuds texte directs. Avant commit, scanner les nouveaux textes TSX visibles pour éviter `react/no-unescaped-entities`, surtout après ajout de phrases françaises comme `d'information`, `l'utilisateur`, `n'est`.
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
