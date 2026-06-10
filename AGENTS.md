# AGENTS.md

## Projet

Application Next.js App Router pour DTSC Platform, déployée sur Vercel avec Neon PostgreSQL, Prisma, TypeScript et OpenAI côté serveur.

## Garde-fous obligatoires

- Avant tout commit ou push, vérifier le script de non-régression avec `pnpm qa:regression` quand `pnpm` est disponible. Si `pnpm` est absent, lancer directement `node scripts/qa-regression-checks.mjs` avec le Node disponible et signaler tout blocage.
- Avant tout push, vérifier au minimum `git diff --check` et `git diff --cached --check`.
- Sur Windows PowerShell, lire les routes dynamiques Next.js avec `-LiteralPath`, par exemple:
  `Get-Content -LiteralPath app\api\support\tickets\[id]\route.ts`.
- Ne pas utiliser `Array.includes(session.role)` avec un tableau typé étroit comme `[UserRole.ADMIN, UserRole.SUPPORT]`.
  TypeScript infère alors `"ADMIN" | "SUPPORT"` et Vercel peut échouer si `session.role` est `UserRole`.
  Préférer une fonction explicite:
  `role === UserRole.ADMIN || role === UserRole.SUPPORT`.
- Ne pas appeler `.partial()`, `.pick()`, `.omit()` ou `.extend()` sur un schéma Zod déjà raffiné avec `.refine()`/`.superRefine()` quand ce schéma est importé par les routes Next.js: Vercel peut échouer au build avec `.partial() cannot be used on object schemas containing refinements`.
  Créer d'abord un schéma objet de base non raffiné, dériver les variantes create/update depuis cette base, puis appliquer les raffinements sur chaque variante finale.
- Ne pas nommer une variable, un paramètre de callback ou une constante locale `module` dans les routes Next.js, helpers partagés ou composants TSX: `@next/next/no-assign-module-variable` fait échouer le build Vercel. Utiliser des noms explicites comme `enterpriseModule`, `templateModule` ou `moduleItem`.
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
- Dans les demandes collaboratives, la demande initiale et la réponse doivent rester visuellement séparées; seul le collaborateur destinataire peut saisir une réponse ou faire avancer le statut métier côté UI et API, tandis que le demandeur peut annuler selon les règles existantes.
- Les filtres de dates HR & CFO, SCO, COO et Activités DTSC doivent filtrer les listes et KPIs visibles sans modifier les données source.
- Les collaborateurs HR & CFO doivent référencer des `User` non-`CLIENT`; ne jamais créer, modifier ou supprimer un compte utilisateur depuis le dossier collaborateur. Les départements et comptes financiers doivent passer par leurs référentiels dédiés.
- Le modèle `HrcfoEmployee` utilise le champ texte `department` et la relation `departmentRef`; ne pas sélectionner un champ inexistant `departmentName` sur ce modèle. Avant d'ajouter un `select` Prisma sur HR & CFO, vérifier le nom exact dans `prisma/schema.prisma` ou réutiliser une projection existante.
- Les champs opérationnels visibles comme `Responsable`, `Demandeur` ou `Assigné à` dans HR & CFO/SCO doivent être des combobox alimentées par les collaborateurs enregistrés, pas des champs texte libres.
- Les lots pharmacie doivent utiliser `PharmacyBatch` et `PharmacyStockMovement`, rester isolés par `organizationId`, et toute future sortie/vente doit sélectionner uniquement les lots vendables via la logique FEFO sans contourner les statuts rappelé, quarantaine, bloqué ou expiré.
- La caisse pharmacie doit utiliser `PharmacyCashSession`, `PharmacyPayment`, `PharmacyInvoice`, `PharmacyCashReceipt`, `PharmacyRefund` et `PharmacyCashDiscrepancy`, toujours filtrés par `organizationId`. Un paiement comptoir exige une session ouverte, une clôture recalcule ses totaux côté serveur, le caissier ne valide pas sa propre clôture et toute annulation/remboursement reste historisé.
- Les demandes d'achat SCO doivent sélectionner le fournisseur retenu depuis les fournisseurs enregistrés; ne pas réintroduire un champ fournisseur libre pour cette décision.
- Les stocks, inventaires, actifs et équipements SCO doivent pouvoir se rattacher au référentiel `MaterialItem` pour garder une traçabilité cohérente des biens matériels DTSC.
- Les éléments SCO doivent conserver la traçabilité transversale (`sourceSection`, `sourceItemId`, `relatedBudgetId`, `relatedProjectId`, `relatedTechnicalProjectId`, `relatedTaskId`, `relatedMissionId`) sans dupliquer les budgets HR & CFO ni les tâches COO.
- Les commentaires transversaux SCO/MPO/CTO/LA doivent utiliser `CooComment` avec contrôle d'accès côté serveur; les collaborateurs ne voient que les objets qui les concernent, sauf poste de supervision autorisé. Les commentaires LA doivent respecter le niveau de confidentialité du document ou dossier concerné.
- Les routes et écrans COO doivent passer par `requireAdminBlockAccess("coo")`, `cooSchemas`, `AuditLog` et `ApiLog`; les tâches, opérations, réunions, workflows, blocages et rapports doivent rester reliés aux départements et collaborateurs référencés.
- Les utilisateurs liés à `HrcfoEmployee.userId` doivent voir leurs activités internes dans `/activities`; ce module ne doit pas apparaître pour un utilisateur sans dossier collaborateur actif.
- Les pièces justificatives opérationnelles HR & CFO/SCO/COO ne doivent pas être saisies en texte libre: utiliser un input fichier, valider taille/type/RBAC côté serveur, stocker dans Supabase Storage via service role et servir via une route privée.
- Les formulaires Activités DTSC, Administration, LA, COO, SCO, MPO, CTO et RH & CFO ne doivent jamais demander un `Document joint`, `Justificatif`, `Pièce jointe`, `Fichier` ou `lien interne` via champ texte libre: utiliser un input fichier, téléverser via une route serveur privée, stocker uniquement l'URL interne contrôlée, puis proposer aperçu et téléchargement selon permissions.
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
- Dans les routes et services Prisma, ne pas réutiliser directement une propriété Zod optionnelle après son contrôle dans un callback asynchrone ou `prisma.$transaction`: TypeScript peut perdre le narrowing pendant `pnpm build`. Stocker d'abord la valeur dans une constante locale (`const refundAmount = data.refundAmount`), vérifier cette constante, puis l'utiliser dans le callback.
- Après parsing Zod d'un schéma contenant `z.union([z.literal(""), z.coerce.number()])`, ne jamais utiliser directement la valeur dans un calcul arithmétique ou une comparaison numérique: normaliser explicitement avec `Number(...)` après avoir écarté la chaîne vide. Pour les dates transformées par `z.coerce.date()`, ne pas les comparer à `""`.
- Dans les callbacks UI (`onSelect`, `onClick`, menus `ActionMenu`, `window.open`, téléchargement), ne jamais réutiliser directement un champ nullable testé inline comme `record.href ? ... record.href ...`. Normaliser d'abord la valeur dans une constante locale strictement typée (`const attachmentHref = typeof record.href === "string" ? record.href : undefined`) puis utiliser cette constante dans le JSX et le callback.
- Les objets de labels/enums partagés comme `lib/labels.ts` ne doivent jamais contenir deux fois la même clé: TypeScript échoue sur Vercel avec "An object literal cannot have multiple properties with the same name". Avant commit, inspecter les ajouts de labels pour fusionner les clés existantes au lieu de les répéter.
- Les icônes Lucide n'acceptent pas la prop `title` dans leur type React. Pour une info-bulle native, placer l'icône dans un élément HTML portant `title` et `aria-label`, sans passer `title` directement à `CircleHelp` ou une autre icône Lucide.
- Les limites d'usage chat doivent être validées côté API, pas uniquement côté UI.
- Les réponses `429 DAILY_LIMIT_REACHED` de `/api/chat` doivent inclure un `usage.resetAt` ISO pour afficher l'heure exacte de réinitialisation côté UI.
- Ne pas importer un module `"use client"` dans un composant serveur uniquement pour partager des constantes: extraire les constantes dans un fichier sans directive client.
- Les confirmations, erreurs et messages importants doivent passer par une boîte de dialogue applicative, pas par `alert`, `confirm` ou `prompt`.
- Les menus d'actions `...` des cartes de contenu, annonces, publications, commentaires, messages et listes doivent être positionnés en haut à droite quand le contenu peut grandir, avec un menu aligné à droite pour éviter qu'il soit coupé sur mobile.
- RBAC annonces/notifications: seul `ADMIN` modifie ou supprime les annonces; `ADMIN` modifie ou supprime tous les commentaires; un utilisateur peut seulement modifier son propre commentaire dans la fenêtre configurée; chaque utilisateur peut supprimer ou vider ses propres notifications.
- Les blocs de données qui peuvent grandir doivent utiliser la barre réutilisable `ListControls` avec `useSmartList` pour recherche accent-insensible et pagination côté UI.
- Les layouts publics mobiles doivent rester `overflow-x-hidden` avec des conteneurs `min-w-0`; vérifier en particulier le header public, le logo et les CTA pour éviter un rendu en deux largeurs sur navigateurs mobiles.
- L'historique du chatbot doit rester scrollable et peut être classé par `Conversation.projectName`; toute évolution du champ doit rester propriétaire `userId`.
- Les dossiers de conversations sont représentés par `ConversationProject`; supprimer un dossier ne doit pas supprimer les conversations, seulement retirer leur classement.
- Sur mobile/PWA, le chat doit garder la conversation active en plein espace principal et afficher l'historique via un panneau menu, pas par empilement qui écrase le fil.
- Toute fonctionnalité de partage doit utiliser l'API `navigator.share` si disponible et copier le lien en fallback, sans exposer de données privées au-delà de l'URL demandée.
- Dans les composants client, ne pas utiliser directement `navigator` après un test `"share" in navigator`: TypeScript peut le réduire à `never` pendant `pnpm build`. Préférer `const browserNavigator = typeof window === "undefined" ? undefined : window.navigator`, puis tester `browserNavigator?.share` et `browserNavigator?.clipboard`.
- Les notifications utilisateur doivent respecter `notifySupportEnabled`, `notifyUsageEnabled`, `notifyBroadcastEnabled` et `pushNotificationsEnabled`.
- Les notifications navigateur/PWA ne doivent pas contourner l'authentification et ne doivent afficher que des extraits non sensibles.
- Sur mobile/PWA, ne pas appeler `new Notification()` sans garde-fou: privilégier `serviceWorker.ready.showNotification()`, encapsuler les erreurs navigateur et ne jamais laisser une notification casser le rendu client.
- Les filtres de notifications doivent correspondre à des catégories réellement déterminées par `Notification.type`, `targetUrl` ou une règle ciblée documentée; éviter les filtres trop larges basés sur tout le texte qui mélangent des notifications sans relation.
- Les helpers de filtrage client ne doivent pas s'appeler eux-mêmes dans une expression de retour sans annotation explicite; extraire les sous-règles (`isCallNotification`, etc.) pour éviter l'erreur Vercel TypeScript "implicitly has return type any".
- Les notifications PWA doivent utiliser une grande icône DTSC lisible et un badge monochrome dédié compatible Android; mettre à jour le cache du service worker lorsqu'une icône offline/PWA change.
- Toute évolution fonctionnelle importante doit être reflétée dans `DTSC_SYSTEM_PROMPT` dans `lib/openai.ts`, en distinguant clairement les fonctionnalités actives de la roadmap.
- Toute évolution publique, commerciale, FAQ, service DTSC, workflow client, agent IA public ou capacité chatbot doit aussi mettre à jour le contexte de l'assistant concerné et la FAQ de la landing page lorsque cela aide les visiteurs ou clients à comprendre la fonctionnalité.
- Toute évolution fonctionnelle, API, schéma Prisma, variable d'environnement, intégration externe, règle de sécurité, workflow CI/CD ou comportement admin/client doit être documentée dans le même travail.
- Mettre à jour en priorité `docs/TECHNICAL_DOCUMENTATION.md` pour les détails techniques, puis `README.md` pour les changements utiles à l'installation, au déploiement ou à l'utilisation.
- Mettre à jour `docs/CHANGELOG.md` avant chaque commit avec un résumé professionnel en français des ajouts, modifications, corrections, suppressions ou améliorations livrés.
- Avant chaque push, relire et actualiser `docs/QA_REGRESSION_CHECKLIST.md` dès qu'un parcours critique, une règle de sécurité, une route API, un module privé, un script QA ou une procédure de validation change.
- Mettre aussi à jour `app/conditions-utilisation/page.tsx`, `app/politique-confidentialite/page.tsx` et `app/politique-cookies/page.tsx` quand une modification impacte les conditions d'utilisation, les données personnelles, les cookies, le suivi, les emails, les paiements, les notifications, les documents ou les intégrations externes.
- Si une modification ajoute ou change une API, documenter la route, la méthode HTTP, le niveau d'accès, le payload attendu, la réponse et les variables d'environnement nécessaires.
- Si une modification ajoute ou change une intégration externe, documenter les secrets requis, le flux d'authentification, les endpoints appelés, les fallbacks et les règles de sécurité.
- Les constantes partagées avec le client doivent rester dans un fichier neutre sans logique serveur, par exemple `lib/session-config.ts`.
- Les pages publiques importantes doivent rester dans `app/sitemap.ts`, `app/robots.ts` et avoir des métadonnées SEO cohérentes.
- Le service worker PWA ne doit jamais mettre en cache les réponses `/api/*`, les pages privées HTML, les routes d'authentification ou des données utilisateur; limiter le cache aux assets statiques et au fallback autonome `public/offline.html`.
- Les pages offline (`/offline` et `public/offline.html`) doivent rester alignées avec le design mobile/PWA premium courant, sans dépendre de données privées ni de scripts nécessaires à l'affichage hors ligne.
- Les contenus publics administrables doivent passer par `PublicPublication`, des routes API `ADMIN` uniquement, une validation Zod et une journalisation `AuditLog`.
- Les contenus publics riches doivent être nettoyés avec `sanitizeRichHtml` avant stockage ou rendu; ne jamais rendre un HTML admin sans nettoyage serveur.
- Les onglets de la landing page doivent correspondre à des routes publiques dédiées; l'état actif doit se baser sur le `pathname`, pas sur un scroll de sections.
- Le contexte client du chatbot ne doit pas divulguer les détails internes de l'application (frameworks, schéma DB, routes API, variables, middleware, secrets). Il doit rester orienté services DTSC et fonctionnalités utiles aux clients.
- Les textes JSX avec apostrophes doivent utiliser `&apos;` si ce sont des noeuds texte directs. Avant commit, scanner les nouveaux textes TSX visibles pour éviter `react/no-unescaped-entities`, surtout après ajout de phrases françaises comme `d'information`, `l'utilisateur`, `n'est`.
- Les contenus publics sourcés doivent garder des liens vérifiables.

## UX & Interaction Standards

- Utiliser un menu d'actions à trois points `...` pour les actions CRUD ou contextuelles dans les cartes, listes et fils de messages; éviter les boutons nus `Modifier`/`Supprimer` lorsque plusieurs actions existent.
- Les actions affichées dans un menu contextuel doivent dépendre des permissions, être fonctionnelles, persistées en base et ne jamais être des placeholders. Les actions destructives doivent demander confirmation ou utiliser un soft delete/archivage métier.
- Toute nouvelle interface visible doit passer par le système i18n ou ajouter des clés dans `locales/fr.json` et `locales/en.json`; le français reste la langue par défaut et l'anglais doit retomber sur le français si une clé manque.
- Les préférences privées `locale`, `timezone` et `dateFormat` doivent être persistées sur `User` et utilisées pour afficher messages, commentaires, notifications, historiques et dates métier via des helpers partagés comme `lib/user-format.ts`.
- Les commentaires collaboratifs doivent supporter les mentions `@collaborateur` avec persistance dans `CooCommentMention` ou une table de mentions dédiée; ne notifier que des utilisateurs autorisés à voir l'objet concerné.
- Les groupes et messages de `Mes collaborateurs` doivent vérifier l'appartenance au groupe côté API avant lecture/écriture. Les invitations peuvent être envoyées en lot à plusieurs utilisateurs/emails, doivent ignorer les membres déjà présents ou invitations actives, et ne doivent notifier que les destinataires réellement invités. Les messages, suppressions, partages chatbot et demandes support doivent être journalisés.
- Les mentions `@collaborateur` dans les commentaires et messages doivent être interactives côté UI, créer une notification ciblée, pointer vers le contexte accessible et ne jamais notifier des utilisateurs non autorisés; dans les groupes, une mention non lue doit être visible par badge dans la liste et être marquée lue à l'ouverture du groupe.
- Dans `Mes collaborateurs`, l'en-tête d'un groupe actif doit rester exploitable: un clic ouvre une modale de détails du groupe avec description, type, statut, propriétaire, rôle courant, membres actifs, invitations en attente et métriques principales.
- L'en-tête d'un groupe doit rester sobre sur desktop et mobile: nom, initiales/avatar, statut court, nombre de membres et menu `...`; ne jamais y afficher la description complète ni la liste complète des membres.
- Les messages collaboratifs et chatbot doivent afficher date/heure selon les préférences utilisateur et utiliser le menu `...` pour modifier, supprimer, archiver ou partager.
- Les messages de groupe doivent supporter `replyToId`: action `Répondre` dans le menu `...`, aperçu du message cité dans le composer et rendu de l'extrait cité dans le fil, avec vérification d'appartenance côté API.
- Les aperçus de messages cités dans les groupes et de commentaires répondus doivent être cliquables: l'UI doit faire défiler vers le message/commentaire source et appliquer une animation de focus lisible. Si l'élément n'est pas encore chargé, tenter un chargement progressif avant d'abandonner sans casser le fil.
- Sur mobile, `Mes collaborateurs` doit fonctionner comme le chatbot: liste des groupes accessible via un menu/bouton, conversation sélectionnée en plein écran, fil scrollable et paginé, zone de saisie accessible en bas, badges de mentions non lues visibles.
- Dans `Activités DTSC`, le formulaire `Formuler une demande à un collaborateur` doit rester centralisé dans le bloc `Demandes collaboratives`; les autres blocs peuvent seulement préremplir ou pointer vers ce formulaire central, sans le dupliquer.
- Tout menu, modale et formulaire ajouté doit rester mobile-first: conteneurs `min-w-0`, hauteur bornée, scroll interne si nécessaire, interactions tactiles et fermeture claire.
- Masquer un bouton côté interface ne suffit jamais: chaque route sensible doit réappliquer RBAC, propriété ou appartenance côté serveur.

## Conversation, comments and content UX standards

- Tous les fils de commentaires doivent avoir une hauteur bornée, un scroll vertical et une pagination/cursor ou un bouton `Charger les précédents`; ne jamais laisser les commentaires étirer indéfiniment une page ou une modale.
- La pagination des commentaires doit préserver les permissions, la confidentialité LA et les mentions `@`; l'API ne doit retourner que les commentaires visibles par l'utilisateur courant.
- Les conversations de groupe et chatbot doivent être scrollables, afficher date/heure selon les préférences utilisateur et regrouper les actions contextuelles dans un menu `...`.
- Les anciens messages de groupe doivent être chargés progressivement côté API (`limit` + cursor) et l'utilisateur doit rester membre du groupe pour lire ou écrire.
- Les noms/intervenants dans les conversations et copies partagées doivent utiliser une couleur stable et lisible dérivée d'un identifiant déterministe (`userId`, email ou rôle système), pas un random recalculé à chaque rendu.
- Les listes de groupes doivent afficher les messages non lus et un badge `@` vert quand l'utilisateur courant a une mention non lue. Ces badges doivent être calculés côté serveur à partir des lectures/mentions réelles et remis à zéro seulement après lecture autorisée.
- Le partage d'une conversation chatbot vers un groupe ne doit jamais exposer directement la conversation privée originale: créer une copie/snapshot persistant et limiter sa lecture aux membres du groupe.
- Les cartes et modales de copies/snapshots chatbot partagées doivent définir des contrastes explicites `dark:` et clair; ne pas dépendre uniquement de `text-dtsc-ink` ou `bg-dtsc-page` si le contenu long devient peu lisible dans le thème sombre.
- La suppression ou l'archivage d'un message de partage chatbot doit supprimer ou archiver l'accès à la copie partagée associée.
- Les annonces doivent garder leurs actions dans le menu `...`; le transfert doit proposer une recherche intelligente par nom, email, poste et département, accepter plusieurs destinataires et créer une notification persistée.
- Les modales d'édition d'annonces internes et de publications publiques doivent travailler sur un brouillon local côté client; ne synchroniser avec le serveur qu'au clic explicite `Enregistrer`/confirmation afin d'éviter les mises à jour pendant la saisie.
- Les éditeurs riches `contentEditable` utilisés dans les annonces/publications ne doivent pas réappliquer `innerHTML` à chaque frappe depuis un état parent contrôlé: initialiser le contenu de façon non destructive, préserver la sélection/curseur et synchroniser les images supprimées uniquement dans le brouillon local jusqu'à l'enregistrement.
- Les éditeurs de publications publiques et annonces doivent supporter une palette de couleurs contrôlée et des types de listes avancés, tout en conservant le nettoyage serveur contre XSS.
- Les annonces internes qui acceptent des images doivent téléverser via route serveur protégée (`/api/announcements/images` ou équivalent), valider MIME/taille, stocker côté Supabase Storage serveur, afficher un aperçu mobile/desktop avant publication et ne jamais exposer de secret Storage côté client.
- Les demandes collaboratives peuvent avoir des pièces jointes uniquement via upload fichier contrôlé; stocker les métadonnées dans `CollaboratorRequest.attachments`, servir les fichiers par route privée et autoriser explicitement demandeur, destinataire, auteur, ADMIN ou rôle métier habilité.
- La route `/offline` doit rester une page PWA publique, informative et consultable en ligne, mais le fallback réellement utilisé hors connexion doit être `public/offline.html`, autonome, sans dépendance aux chunks Next.js. Le service worker doit versionner son cache, précacher `/offline.html`, et exclure strictement `/api/*` ainsi que les pages privées comme `/activities`, `/collaborators`, `/chat`, `/admin`, `/company`, `/notifications` et `/settings`.
- Les applications DTSC Platform installées en PWA doivent rechercher une mise à jour du service worker au retour en ligne, au focus, au retour de visibilité et périodiquement. Si une nouvelle version est installée, activer le worker en attente via `SKIP_WAITING` puis recharger une seule fois le client contrôlé pour fournir automatiquement la dernière version après reconnexion.
- Toute nouvelle interface visible doit être entièrement compatible i18n: ajouter les clés FR/EN pour labels, boutons, statuts, erreurs, modales, menus, notifications, filtres, contenus de modules et états vides.
- Les fils de commentaires, conversations, menus et modales doivent être vérifiés mobile-first avec `min-w-0`, scroll interne et zone de saisie accessible.

## Validation locale

Dans cet environnement Codex Windows, `pnpm` peut être absent. Si `pnpm build` ne peut pas être lancé localement, le signal bloquant devient:

- `git diff --check`
- `git diff --cached --check`
- `node scripts/qa-regression-checks.mjs` avec le Node disponible si `pnpm qa:regression` ne peut pas être lancé
- inspection des imports inutilisés et des erreurs TypeScript évidentes
- lecture des logs Vercel après push

Quand `pnpm` est disponible, lancer:

```bash
pnpm qa:regression
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

## Règles DTSC — UI mobile/PWA premium compacte

- Les blocs importants des modules privés doivent privilégier les accordéons sur mobile/PWA afin d'éviter les pages verticales interminables.
- Les formulaires longs ouverts depuis Administration, Activités, Support, Annonces ou modules métier doivent utiliser une modale/sheet haute avec scroll interne fiable; ne pas les enfermer dans un conteneur `overflow-hidden` qui empêche d'atteindre le bas du formulaire sur desktop ou mobile.
- Les accordéons, listes premium, menus flottants et overlays mobiles doivent utiliser les variables DTSC (`--dtsc-surface`, `--dtsc-page`, `--dtsc-ink`, `--dtsc-muted`) ou les classes glass partagées; éviter les fonds fixes `bg-white/*` qui cassent le mode sombre.
- Les sections Administration doivent rester accessibles par une navigation mobile flottante, avec affichage strictement limité aux sections autorisées par RBAC et poste RH officiel.
- Les formulaires longs ou fréquents doivent être pliables, en modale, sheet ou accordéon; ne pas afficher plusieurs formulaires ouverts par défaut sur mobile.
- Les commentaires d'annonces, publications publiques et discussions longues doivent être repliables par défaut, scrollables, paginés et ne jamais étendre indéfiniment la page.
- Les conversations chatbot, groupes, appels et tickets support sont prioritaires visuellement: leur fil doit garder un conteneur scrollable avec saisie accessible.
- Les dropdowns/combobox doivent utiliser le style premium partagé, rester tactiles, lisibles, scrollables et compatibles recherche quand les listes peuvent grandir.
- Les historiques d'activité affichés côté profil doivent être bornés et respecter une stratégie de rétention; la rétention des notifications reste pilotée par `AppSetting.notificationRetentionDays`.
- Les réactions chatbot Like/Dislike doivent être persistées côté serveur sur le message assistant propriétaire de la conversation; une action UI visible ne doit jamais être seulement locale.
- Les notifications doivent supporter des filtres avancés côté UI à partir des vrais types/statuts existants, sans remplacer les données backend par des mocks.
- Toute modification UI mobile/PWA doit préserver i18n, accessibilité clavier, safe-area, PWA standalone, RBAC et permissions côté API.

## Règles DTSC — SaaS hybride multi-entreprises

- DTSC Platform évolue vers un modèle SaaS hybride: un tenant interne DTSC, des espaces clients `Organization` et un contexte actif de session (`GLOBAL_CLIENT`, `COMMUNITY`, `DTSC_INTERNAL`, `ORGANIZATION`).
- Le tenant interne DTSC doit exister comme `Organization` stable (`id = dtsc-internal`, nom `DTSC`, `organizationType = DTSC_INTERNAL`). Un utilisateur n'accède au contexte DTSC interne que s'il possède un `OrganizationMember` actif sur cette organisation.
- Les collaborateurs DTSC sont rattachés au tenant `DTSC` uniquement lorsqu'ils ont déjà un dossier `HrcfoEmployee.userId` actif. Un rôle global `ADMIN`, `MANAGER` ou `SUPPORT` sans ce membership reste en espace client/global et ne voit pas les données DTSC.
- La connexion peut accepter une entreprise optionnelle. Sans entreprise sélectionnée, l'utilisateur accède à son espace client standard; avec entreprise sélectionnée, le backend doit vérifier que `Organization.status = ACTIVE` et que `OrganizationMember.status = ACTIVE`.
- La liste des entreprises au login ne doit jamais exposer tout l'annuaire client: elle est chargée uniquement à partir de l'email saisi et retourne seulement les organisations où cet email est membre actif.
- Même `ADMIN` global DTSC, CEO DTSC ou support technique ne reçoit aucun droit automatique sur les modules internes privés d'une entreprise cliente. L'accès entreprise exige un membership actif explicite.
- DTSC peut créer, modifier, suspendre ou archiver une entreprise cliente, accorder ou retirer `ADMIN_ENTREPRISE`, gérer plans/abonnements/facturation et traiter les tickets support volontairement soumis.
- DTSC ne doit pas ouvrir `Administration [Entreprise]`, `Activités [Entreprise]`, calendrier, tâches, réunions, fichiers, conversations, appels, données RH/finance/juridique ou workflows internes d'une entreprise cliente sans membership actif dans cette entreprise.
- Un `ADMIN_ENTREPRISE` ou `MANAGER` actif peut ajouter des utilisateurs existants comme collaborateurs de sa propre entreprise depuis `Administration [Entreprise]`; cette action ne peut pas accorder `ADMIN_ENTREPRISE`, doit notifier le collaborateur ajouté et doit rester vérifiée côté API par membership actif.
- Toute nouvelle donnée interne d'entreprise doit porter `organization_id` ou un équivalent Prisma `organizationId`, et toute route entreprise doit vérifier session, rôle global si action plateforme, membership actif, rôle organisationnel et visibilité de l'objet.
- Les modules historiques internes DTSC (`/admin`, `/activities`, `/calendar` et leurs routes `/api/*`) doivent refuser toute session qui n'est pas `DTSC_INTERNAL` avec `activeOrganizationId = dtsc-internal`, même si le rôle global semble élevé.
- En contexte `ORGANIZATION`, `Abonnement`, `Annonces` et `Profil` restent communs à l'utilisateur. Les modules `Dashboard`, `Chatbot`, `Entreprise`, `Documents`, `Paramètres`, `Notifications`, `Support` et `Mes collaborateurs` doivent rester visibles lorsqu'ils sont disponibles, mais leurs lectures/écritures doivent être propres au contexte actif via `organizationId` ou un contrôle équivalent; ne jamais les faire retomber sur les données DTSC/globales.
- `Mes collaborateurs` est un module transversal contrôlé: les groupes internes restent limités à leur `organizationId`, les groupes `CROSS_ORGANIZATION`/`PRIVATE_NETWORK` peuvent inviter des utilisateurs de toute l'application par recherche sécurisée, et l'accès à un groupe exige toujours une invitation acceptée ou un membership actif du groupe.
- Les tickets support doivent rester rattachés au contexte courant (`organizationId` quand l'utilisateur agit dans une entreprise, `null` en espace client standard) et ne jamais exposer des tickets d'un autre contexte.
- Les fonctionnalités internes d'une entreprise cliente peuvent être masquées ou bloquées si l'organisation n'a pas d'abonnement actif; l'absence de plan ne doit jamais faire retomber l'utilisateur sur les données DTSC.
- Les abonnements d'organisation restent contrôlés par DTSC: le client peut voir plan, statut, limites et factures, mais ne peut pas modifier prix, plan ou validation de paiement.
- Les tickets support partagent uniquement les informations volontairement envoyées au support DTSC; un ticket ne donne pas accès au reste des données internes de l'entreprise.
- Le module Annonces peut rester global/communautaire avec `scope`, `organizationId` et `moderationStatus`; `ORGANIZATION_ONLY` doit être visible uniquement aux membres actifs de l'organisation concernée.
- Les groupes peuvent devenir transversaux (`CROSS_ORGANIZATION`, `PRIVATE_NETWORK`) uniquement par invitation acceptée. Les groupes internes d'organisation restent invisibles aux non-membres, y compris aux rôles DTSC globaux non invités.
- Toute attribution/retrait d'admin entreprise, tentative d'accès refusée, changement de contexte, création/suspension d'organisation, changement d'abonnement et action support critique doit être auditée.
- Les métriques DTSC sur les entreprises clientes doivent rester administratives, agrégées ou anonymisées lorsqu'elles touchent à l'activité interne.
- Les entreprises clientes peuvent avoir un secteur d'activité normalisé via `BusinessSector`; ne pas réintroduire de champ secteur libre dans les formulaires de création/édition d'organisation cliente.
- Les modèles sectoriels (`SectorTemplate*`) sont des gabarits inspirés de standards institutionnels; leur application doit générer des enregistrements réels `EnterpriseModule`, `EnterpriseDepartment`, `EnterprisePosition`, `EnterpriseActivityBlock` et `EnterpriseWorkflow` isolés par `organizationId`.
- `Administration [Entreprise]` et `Activités [Entreprise]` sont des modules dynamiques propres au contexte `ORGANIZATION`; ils ne doivent jamais rediriger vers `/admin` ou `/activities`, qui restent strictement DTSC internes.
- Toute action visible dans un module entreprise doit vérifier le membership actif, le module activé, la permission organisationnelle et, si applicable, le plan d'abonnement de l'organisation côté API.
- Les changements de secteur doivent fusionner ou remplacer uniquement les éléments sectoriels générés; ne jamais écraser silencieusement les personnalisations entreprise sans action explicite.
- Les futures extensions sectorielles doivent documenter les modules, postes, blocs d'activités, workflows et permissions dans `docs/enterprise-sector-modules.md`.
- Les itérations sectorielles doivent être livrées secteur par secteur: commencer par des sous-modules réellement persistés, avec liste, recherche, filtres, formulaire complet, détail, actions `...`, audit et isolation `organizationId`.
- Le secteur `HEALTH_CARE` utilise `EnterpriseSectorRecord` pour ses sous-modules exploitables (`PATIENTS`, `APPOINTMENTS`, `CONSULTATIONS`, `MEDICAL_RECORDS`, `CARE_TEAM`, `LABORATORY`, `INTERNAL_PHARMACY`, `MEDICAL_BILLING`, `INSURANCE_COVERAGE`, `QUALITY_INCIDENTS`, `MEDICAL_DOCUMENTS`, `MEDICAL_CONFIDENTIALITY`, `HEALTH_SETTINGS`, `HEALTH_REPORTS`); toute route doit vérifier `sectorCode = HEALTH_CARE`, membership actif, module activé et rôle entreprise avant lecture/écriture.
- Les actions santé visibles (confirmer/annuler rendez-vous, convertir en consultation, clôturer/rouvrir, valider labo, gérer prise en charge, mouvement de stock, résoudre incident, archiver) doivent rester persistées, journalisées et isolées par `organizationId`.
- Les formulaires `HEALTH_CARE` doivent privilégier des combobox reliées aux données de l'entreprise (`EnterpriseSectorRecord` patient/rendez-vous/consultation, `OrganizationMember`, `EnterpriseDepartment`, `EnterprisePosition`) et les routes doivent refuser toute référence hors `organizationId`.
- Dans `Administration [Entreprise]`, ne pas exposer `EnterpriseActivityBlock` comme bloc client principal: les blocs d'activités restent dans `Activités [Entreprise]`; l'administration doit séparer modules, invitations collaborateurs, postes/permissions, départements, workflows/procédures et paramètres persistés.
- Les données métier sectorielles génériques doivent être stockées dans `EnterpriseSectorRecord` ou dans une table dédiée documentée; ne jamais afficher une carte sectorielle avancée sans route API persistante associée.

## Advanced Mobile UX, Activities, Groups, Files and Audit Standards

- Tous les blocs Administration qui listent des données doivent rester utilisables sur mobile avec une logique liste -> détail: recherche intelligente, pagination, conteneurs scrollables, détails en modale ou plein écran et actions dans menus `...`.
- Les formulaires Administration longs ne doivent pas être empilés directement dans les cartes mobiles; les ouvrir via bouton clair, modale, panneau ou vue dédiée. Le desktop peut garder une vue split-panel ou table confortable.
- Tous les blocs Activités DTSC doivent suivre la même logique mobile: liste filtrable et paginée, puis détail plein écran/mobile avec commentaires, fichiers, statuts et actions autorisées.
- Le formulaire `Formuler une demande à un collaborateur` reste centralisé dans les demandes collaboratives; les autres blocs peuvent seulement l'ouvrir avec contexte prérempli.
- Les conversations de groupe doivent être bornées en hauteur, scrollables, chargées par pagination et positionnées sur les derniers messages à l'ouverture sans casser le chargement des anciens messages.
- Les entrées/sorties de membres, retraits, suppressions de groupe et changements de rôle admin doivent créer des messages système persistés et des audit logs.
- Les détails de groupe doivent afficher une présence légère en ligne/hors ligne quand `User.lastSeenAt` est disponible. Le seuil recommandé est `ONLINE_THRESHOLD_MINUTES = 5`.
- Les indicateurs de présence mobile doivent être au premier plan, animés et synchronisés par un mécanisme léger `online/offline` ou polling court; une fermeture/masquage d'onglet doit signaler l'état hors ligne quand le navigateur le permet.
- Seul le propriétaire peut supprimer un groupe, et seulement après révocation ou départ des autres membres actifs. Les suppressions doivent rester logiques ou archivées selon la stratégie du projet et être journalisées.
- Les propriétaires gèrent les admins et retraits de membres via routes API protégées. Un admin ne doit jamais retirer ou rétrograder le propriétaire.
- Les messages de groupe doivent supporter les accusés de lecture via `CollaborationGroupMessageRead`; l'auteur, le propriétaire ou un admin peuvent consulter `Lu` / `Non lu` selon permissions. Dans le fil, les messages envoyés par l'utilisateur courant doivent afficher un accusé visuel compact: une coche pour `envoyé`, deux coches vertes uniquement quand tous les autres membres actifs ont confirmé la lecture.
- Tout fichier joint affiché dans une interface doit proposer téléchargement et aperçu quand le type le permet: image, PDF, texte/CSV si supporté. Les fichiers non prévisualisables doivent garder un téléchargement clair.
- Les fichiers sensibles doivent être servis par route privée avec contrôle RBAC; ne jamais exposer d'URL privée sans vérification. Les téléchargements sensibles doivent être journalisés.
- La section Administration `Audits` doit rester recherchable, filtrable, paginée et utiliser des badges de sévérité `INFO`, `SUCCESS`, `WARNING`, `ERROR`, `CRITICAL`. Ne jamais exposer secrets, tokens, mots de passe ou stack traces à des rôles non techniques.
- Les paramètres privés doivent utiliser une UX accordéon sur mobile; tous les changements visibles doivent être persistés et respecter les préférences utilisateur/i18n.

## Règles DTSC — Appels, réunions COO et groupes de réunion

- Les appels audio/vidéo de DTSC Platform doivent utiliser une architecture sécurisée liée aux groupes `CollaborationGroup`; aucun appel ne doit exister sans groupe propriétaire et tout appel lié à une réunion COO doit garder `meetingId`.
- LiveKit est le fournisseur recommandé pour les rooms audio/vidéo. Les variables `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` et `LIVEKIT_URL` restent strictement serveur; ne jamais les exposer dans un composant client, une réponse API non nécessaire ou une variable `NEXT_PUBLIC_*`.
- Les tokens LiveKit doivent être générés uniquement côté backend via un service serveur dédié comme `lib/livekit-service.ts`. Une route client peut recevoir un token participant temporaire, mais jamais le secret API.
- Les routes sensibles d'appels (`start`, `join`, `leave`, `end`) doivent vérifier la session, l'appartenance active au groupe, le statut du groupe, le statut de l'appel et les droits de gestion pour terminer un appel. Masquer un bouton côté UI ne suffit jamais.
- Une réunion COO peut être tenue en `COMMENTS_ONLY`, `AUDIO` ou `VIDEO`. Le mode commentaires/messages uniquement reste le comportement stable sans groupe automatique ni appel.
- Une réunion COO audio ou vidéo doit créer automatiquement un groupe de réunion dédié si aucun groupe existant n'est choisi. Le groupe doit être `groupType = MEETING`, `autoCreated = true`, lié à `CooMeeting.collaborationGroupId` et synchronisé avec les participants COO disposant d'un `User`.
- L'utilisation d'un groupe existant pour une réunion COO doit lier le groupe à la réunion, synchroniser les membres autorisés et ajouter un message système discret. Ne jamais ajouter des utilisateurs non concernés.
- Les participants d'une réunion COO doivent rester synchronisés avec les membres du groupe de réunion autant que possible: organisateur, responsable CR, collaborateurs sélectionnés et responsables explicitement impliqués.
- Seuls les participants autorisés, membres actifs du groupe, CEO/ADMIN/COO autorisés ou postes métiers explicitement impliqués peuvent voir la réunion, rejoindre le groupe ou entrer dans l'appel.
- Les messages système liés aux appels (`CALL_STARTED`, `USER_JOINED`, `USER_LEFT`, `CALL_ENDED`) doivent être persistés, discrets, non intrusifs et journalisés dans les audit logs de groupe.
- Les appels doivent conserver un historique persistant dans `CollaborationGroupCall`, `CollaborationGroupCallParticipant` et `CollaborationGroupCallEvent`: type audio/vidéo, provider, room, statut, démarrage, fin, participants et événements.
- Les réunions COO doivent pouvoir produire des comptes rendus (`CooMeetingMinutes`), décisions (`CooMeetingDecision`) et tâches de suivi COO liées (`CooTask.sourceMeetingId` / `sourceDecisionId`). Toute création de tâche depuis une décision doit être journalisée et notifier le responsable si disponible.
- L'UX mobile des appels et détails de réunion doit être plein écran ou en modale haute, avec actions principales accessibles, participant list visible, état d'appel clair et bouton quitter/terminer sans surcharger le fil.
- Ne pas importer directement une feuille CSS globale tierce LiveKit dans `app/globals.css` si elle peut casser le rendu global; préférer des styles DTSC scopés sur une classe locale comme `.dtsc-livekit-room`.
- Aucun bouton d'appel, de réunion, de décision ou de tâche ne doit être un placeholder: toute action affichée doit appeler une route réelle, persister l'effet, notifier si nécessaire et gérer les erreurs de configuration comme LiveKit absent.
- Toute évolution future des appels/réunions doit mettre à jour Prisma, migration SQL, validateurs Zod, documentation technique, `AGENTS.md`, et exécuter au minimum `git diff --check`, `git diff --cached --check` et `pnpm build` si disponible.

## Règles DTSC — UX avancée des appels

- L'interface finale ne doit jamais afficher de termes techniques comme `LiveKit`, `room`, `token`, `provider`, `server` ou des états de connexion bruts. Les erreurs techniques doivent être traduites en messages humains: `Appel connecté`, `Connexion instable`, `Impossible de rejoindre l'appel`, etc.
- Le bouton micro doit agir sur la piste audio locale réelle du fournisseur d'appel, pas seulement sur l'icône. Si le navigateur refuse le micro, afficher un message humain et garder l'état visuel cohérent.
- `Quitter` et `Terminer` sont deux actions distinctes: `Quitter` sort seulement l'utilisateur courant, `Terminer` clôt l'appel pour tout le groupe et reste réservé au lanceur, propriétaire/admin du groupe ou rôle explicitement autorisé.
- Les appels actifs doivent se propager aux membres autorisés sans rechargement manuel. Si aucune infrastructure temps réel dédiée n'existe, utiliser un polling léger et documenté en fallback en conservant les vérifications backend.
- Les événements d'appel peuvent déclencher une animation flottante globale uniquement pour les membres autorisés du groupe. Les alertes ne doivent pas afficher de détails privés à un non-membre et doivent respecter les préférences utilisateur.
- Les paramètres d'appel sont persistés par utilisateur: sons, notifications, alertes flottantes, événements participants, démarrage micro/caméra et durée d'affichage des alertes.
- Les sons d'appel doivent rester courts, professionnels, non agressifs et respecter les permissions navigateur; si l'autoplay est bloqué, l'appel doit continuer sans erreur bloquante.
- La durée d'appel doit être calculée depuis `startedAt`, affichée pendant l'appel, et persistée à la fin via `durationSeconds` pour l'historique.
- Les appels liés aux réunions COO doivent suivre les mêmes règles UX: pas de jargon technique, durée, boutons `Quitter`/`Terminer`, préférences utilisateur, propagation d'état et historique persistant.
- Toute route d'appel doit continuer à vérifier auth, RBAC, appartenance active au groupe/réunion et droit de gestion côté serveur; un événement temps réel reçu côté frontend ne donne jamais accès à l'appel sans vérification API.

## Règles DTSC — Design mobile/PWA premium

- Le design mobile/PWA premium intégré depuis `dtsc-platform-redesign.zip` devient la référence visuelle des espaces privés: header compact, navigation bottom, cartes glass/premium, safe-area mobile, ombres douces et animations sobres.
- Toute nouvelle interface mobile doit suivre la logique liste -> recherche/filtres -> pagination -> détail plein écran -> commentaires/fichiers/actions; ne jamais empiler liste, détail, formulaire et commentaires dans une longue page mobile.
- Les modales mobiles doivent exploiter davantage la hauteur réelle de l'écran (`90-95dvh` quand pertinent), avec header/footer fixes, contenu scrollable interne, safe-area respectée et sans double scroll du body.
- Les conversations, commentaires et messages sont prioritaires sur mobile: réduire les composants secondaires, historiques systèmes, cartes de contexte et éléments décoratifs pour donner plus d'espace utile au fil principal.
- Les cartes de réunion liée, historiques d'appels et résumés opérationnels affichés au-dessus d'un fil doivent rester compacts ou collapsibles par défaut; le détail complet doit aller en modale, drawer ou panneau secondaire.
- Les messages systèmes d'appels doivent rester discrets, courts et peu hauts, sur le modèle WhatsApp/Discord, tout en restant persistés et lisibles.
- Pendant un appel audio/vidéo, les participants doivent pouvoir écrire dans un chat léger relié au groupe; ces messages doivent utiliser la route de messagerie de groupe, rester persistés, supporter les mentions et respecter l'appartenance/RBAC côté API.
- Le chat pendant appel doit rester une boîte autonome: scroll vertical interne borné, champ de saisie fixe, déplacement et redimensionnement possibles sans dépendre du scroll général de l'appel.
- Les contrôles d'appel visibles doivent être ceux de DTSC, pas les barres techniques du fournisseur: micro, caméra, partage d'écran, plein écran, chat, quitter et terminer doivent appeler les APIs réelles du fournisseur ou afficher un fallback humain si le navigateur ne supporte pas l'action.
- Les appels vidéo/audio doivent afficher les photos de profil disponibles à la place des avatars techniques du fournisseur, garder des tuiles vidéo arrondies et lisibles sur mobile, et basculer le libellé `Plein écran` vers `Réduire l'écran` quand l'appel est déjà en plein écran.
- En plein écran vidéo, l'utilisateur doit pouvoir revenir à une vue automatique ou focaliser un partage d'écran ou un participant précis, sur desktop comme sur mobile. La scène plein écran doit rester responsive, compatible portrait/paysage PWA et utiliser un arrière-plan uniforme derrière les tuiles arrondies pour éviter les ruptures de couleur.
- Le focus plein écran d'appel ne doit jamais masquer toutes les tuiles si la cible DOM du fournisseur n'est pas trouvée: appliquer le mode focus uniquement après sélection effective d'une tuile et retomber visuellement sur la grille normale en cas de doute.
- Ne jamais piloter le focus plein écran LiveKit avec un `MutationObserver` qui observe les attributs/classes que l'UI modifie elle-même: cela peut créer une boucle de mutations et bloquer la page en production. Utiliser une application bornée, déclenchée par changement de focus/plein écran, avec quelques retries limités puis fallback sur la grille normale.
- Sur mobile/PWA, le plein écran d'appel doit donner la priorité au flux vidéo sur toute la hauteur utile; les listes secondaires et panneaux de participants ne doivent pas réduire la scène. Les contrôles de choix de focus doivent se masquer après sélection et réapparaître au toucher de la scène.
- Les zones messages des conversations de groupe et du chatbot doivent rester scrollables avec la saisie accessible en bas, et maximiser la largeur utile des bulles/cartes sur petits écrans sans casser tablette/desktop.
- Les composants issus d'un prototype ou d'un ZIP de design ne doivent jamais remplacer aveuglément les modules existants. Les écrans mockés sont interdits dans les modules connectés au backend; ils doivent être remplacés par les données réelles, routes API, hooks et services existants.
- Les formulaires longs doivent être encapsulés dans une modale, sheet, accordion ou vue dédiée mobile; les menus `...` restent le standard des actions contextuelles et destructives.
- Les formulaires Administration dans des accordéons ne doivent pas être prisonniers d'un conteneur scrollable trop court sur desktop: garder le scroll interne mobile si nécessaire, mais laisser le contenu complet visible ou ouvrir une modale haute sur `lg+`.
- La navigation mobile principale doit privilégier `Accueil`, `IA`, `Activités`, `Collaborateurs` et `Notifications`; les autres modules restent accessibles via actions rapides, menu secondaire, profil, paramètres ou administration selon permissions.
- Le design ne doit jamais contourner RBAC, poste RH officiel, appartenance aux groupes, confidentialité LA/CEO, protections fichier, notifications ou audit logs. Masquer ou afficher un élément côté UI n'est jamais une règle de sécurité suffisante.
- La PWA doit conserver le fallback offline public, ne pas cacher de données privées et respecter les safe areas Android/iOS. Toute nouvelle couche visuelle mobile doit rester compatible avec le service worker existant.
- La PWA privée doit autoriser portrait et paysage quand l'expérience métier le justifie, notamment pour les appels vidéo; ne pas verrouiller `orientation` sur portrait si cela dégrade les appels.
- Toute nouvelle copie visible du design doit respecter i18n FR/EN et éviter les textes hardcodés lorsque l'interface est réutilisable.
- Quand un module privé reçoit de nouveaux libellés visibles, ajouter les clés dans `locales/fr.json` et `locales/en.json`, puis utiliser `translate(locale, key)` avec la préférence utilisateur quand elle est disponible.
- Les formulaires et fiches détail ne doivent jamais afficher directement des noms de champs techniques, identifiants de code, clés JSON, noms camelCase ou libellés ambigus. Chaque champ visible doit avoir un libellé métier facilement interprétable par l'utilisateur, traduit selon la langue de l'interface, et une info-bulle ou aide contextuelle courte expliquant la valeur attendue ou l'effet de l'option.
- Les options visibles des listes, filtres, dropdowns et combobox doivent toujours passer par un dictionnaire de libellés métier traduit; ne jamais afficher directement une valeur d'enum, un code interne, une clé camelCase ou une valeur anglaise quand l'interface est en français.
- Les ordonnances PHARMACY dédiées doivent rester isolées par `organizationId`; une vente générée depuis une ordonnance validée reste un brouillon sans impact stock, et toute substitution conserve une trace du produit prescrit, du produit servi et du motif.
- Les fournisseurs, demandes de réapprovisionnement et commandes PHARMACY dédiés doivent rester isolés par `organizationId`; une réception générée depuis une commande reste un brouillon sans impact stock, et seules validation/annulation du module Réceptions synchronisent stock et quantités reçues/restantes.
- Dans le contexte d'une entreprise cliente, la navigation latérale doit afficher uniquement les modules du socle commun. Les modules sectoriels Santé, Pharmacie ou futurs secteurs restent regroupés dans leurs sous-modules dédiés de `Administration [entreprise]` afin d'éviter toute répétition.

## Règles DTSC — Calendrier interne

- Le calendrier interne DTSC doit rester une fonctionnalité privée, protégée par session, middleware, RBAC, poste RH officiel et appartenance aux événements; ne jamais dépendre d'une API externe pour connaître les disponibilités.
- Le calendrier interne ne doit jamais être visible ni accessible aux utilisateurs `CLIENT`: masquer les liens UI, rediriger `/calendar` côté middleware/page et bloquer les routes `/api/calendar*` côté serveur.
- Les disponibilités des collaborateurs sont persistées dans `CollaboratorAvailability`; les événements sont persistés dans `InternalCalendarEvent`, avec participants dans `InternalCalendarEventParticipant` et conflits dans `InternalCalendarConflict`.
- Toute création ou modification d'événement doit vérifier les conflits de créneau, absences, congés, missions, indisponibilités et plages hors horaires disponibles avant persistance. Les conflits bloquants ne peuvent être ignorés que par un rôle autorisé.
- Un collaborateur peut voir son propre planning; CEO/COO/HR & CFO/ADMIN ou rôle autorisé peuvent voir et gérer des vues plus larges selon les règles métier.
- La visibilité d'un événement doit être appliquée côté backend: `Privé` ne doit jamais être exposé aux simples participants, `Participants` ne doit viser que les participants actifs, `Département` reste limité au département et `Public interne` seul peut être visible largement.
- Les événements créés depuis COO, réunions, tâches, missions ou appels doivent renseigner `sourceModule`, `sourceEntityType` et `sourceEntityId` pour garder la traçabilité sans dupliquer inutilement les données source.
- Un événement calendrier de type `Tâche`, `Réunion`, `Blocage`, `Mission`, `Appel audio` ou `Appel vidéo` doit créer ou lier l'objet métier correspondant quand l'action est visible dans l'UI. Les appels planifiés créent un groupe préparatoire, pas une room active tant que l'appel n'est pas démarré par un membre autorisé.
- Les conflits calendrier doivent afficher le collaborateur concerné et la raison métier lisible issue de son planning ou d'un événement chevauchant, pas seulement un message générique.
- Toute action calendrier critique doit journaliser `AuditLog` et notifier les participants autorisés quand l'action les concerne.
- L'UX mobile du calendrier suit le standard premium: filtres horizontaux, liste scrollable, détail plein écran ou panneau, actions dans menu `...`, formulaires en modale et aucune page mobile infinie.
- Les KPI du calendrier qui ouvrent des listes secondaires (`Collaborateurs`, `Conflits`, `Disponibilités`) doivent afficher des dialogues scrollables mobile-first. `Collaborateurs` doit fournir un menu `...` par collaborateur avec des actions réelles de création d'événement préremplies; `Conflits` et `Disponibilités` doivent montrer les détails complets en plein écran mobile.
