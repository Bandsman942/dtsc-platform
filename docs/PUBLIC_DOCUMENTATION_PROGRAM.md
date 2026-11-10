# Programme de documentation publique DTSC Platform — Issue #1099

**Date :** 10 novembre 2026
**Phase :** T1 — portail de documentation candidate, non fusionnée / non livrée
**Public cible :** utilisateurs grand public, administrateurs d’entreprises clientes, développeurs et futurs intégrateurs.

## Principe

Les 659 entrées observées dans `docs/` ne forment pas un catalogue public : elles comprennent des guides utilisateurs, des contrats internes, des runbooks, des historiques de QA, des spécifications d’architecture et des documents d’exploitation. **Il est interdit de publier automatiquement ce répertoire.**

L’interface `docs.dtsc-platform.com` est une surface de lecture dédiée, alimentée par une liste explicite `lib/public-documentation.ts`. Les guides fonctionnels complets de l’application restent **canoniques** dans leurs registres existants ; les synthèses publiques doivent être révisées lors de chaque changement de module.

## Catalogue T1 — sélection curée

| Audience | Sujet public | Source interne de vérification | Statut publication |
|---|---|---|---|
| Public | Bien démarrer | `docs/user-guides/DASHBOARD.md` | PUBLIC_CURATED |
| Public | Espaces et organisations | `docs/user-guides/COMPANY_ACCOUNT.md` | PUBLIC_CURATED |
| Public | Tableau de bord | `docs/user-guides/DASHBOARD.md` | PUBLIC_CURATED |
| Public | Invitations | `docs/user-guides/INVITATIONS.md` | PUBLIC_CURATED |
| Public | Abonnement | `docs/user-guides/BILLING.md` | PUBLIC_CURATED |
| Public | Collaboration | `docs/user-guides/GROUP_CONVERSATIONS.md` | PUBLIC_CURATED |
| Public | Flux financier | `docs/ERP_FINAL_USER_GUIDE.md` | PUBLIC_CURATED |
| Public | Multi-boutiques RETAIL | `docs/HOTFIX_RETAIL_GUIDED_MULTISTORE_2026.md` | PUBLIC_CURATED |
| Public | Aide et support | `docs/user-guides/NOTIFICATIONS.md` | PUBLIC_CURATED |
| Développeurs | Introduction intégrations | `docs/TECHNICAL_DOCUMENTATION.md` | PUBLIC_OVERVIEW_ONLY |
| Développeurs | Principes sécurité | `docs/ERP_COMMON_DOMAIN_SECURITY.md` | PUBLIC_OVERVIEW_ONLY |
| Développeurs | API : feuille de route | `docs/ERP_COMMON_DOMAIN_API.md` | FUTURE_API_ONLY |

Les noms de fichiers sont des **références éditoriales internes** : les fichiers sources ne sont pas chargés automatiquement sur le site public. Une entrée de catalogue n’autorise pas la publication intégrale de la source.

## Non-public / à exclure

`INTERNAL_ONLY` : `AGENTS.md`, runbooks d’infrastructure, secrets/env, procédures d’exploitation, CI/CD et sécurité détaillée, rapports d’incident, tickets, captures non anonymisées, diagnostics de sessions, matrices RBAC internes, migrations, plans de rollback, journaux d’audit, documents de clients, données personnelles, documents médicaux.

`PUBLIC_AFTER_REVIEW` : guides ERP détaillés, workflows et FAQ sectorielles, tutoriels partenaires, extraits de changelog, modèles Excel/CSV. Ils doivent être vérifiés contre la maturité commerciale, les permissions et les contenus privés.

`FUTURE_API` : méthodes, chemins, schémas, OpenAPI, authentification et quotas d’intégration externe. Ne jamais confondre une route `app/api/` privée avec une API publique contractuelle.

## API externe — conditions de publication

Pour un domaine donné, la documentation API ne peut passer à `PUBLIC` qu’avec :
1. contrat d’API externe formel et versionné (ex. `/v1`) approuvé par le CTO/produit ;
2. schéma OpenAPI exact, exemples anonymisés et erreurs définies ;
3. authentification dédiée aux partenaires, scopes, clés à durée de vie limitée et révocation ;
4. isolation tenant / autorisations / consentements et chiffrement adaptés ;
5. quotas, pagination, idempotence, politiques de dépréciation, journaux et audit ;
6. sandbox réelle, tests sécurité/charge, support et engagements documentés ;
7. certification E2E propriétaire et disponibilité Production réelle.

**Au 10 novembre 2026, cette tranche ne déclare aucune API externe, clé partenaire, sandbox, SDK ou webhook public disponible.**

## Design / architecture T1

- Une seule application Next.js/Vercel continue d’héberger les surfaces ; `docs` devient un HostType reconnu avec canonical indépendant.
- Le portail est aussi disponible **directement depuis le site public** sur `https://dtsc-platform.com/documentation` (sans connexion), avec navigation principale desktop, menu mobile, CTA sur la page d’accueil, lien depuis le journal Ressources et lien du pied de page.
- Les parcours, filtres, recherche et changements de langue conservent le domaine de l’utilisateur ; un visiteur du site public ne bascule pas automatiquement sur le sous-domaine Docs lorsqu’il ouvre un guide.
- `docs.dtsc-platform.com/` se réécrit vers `/documentation` sans changer l’URL visible.
- Les API sont refusées sur le host documentation; les accès aux routes privées de l’application ne sont pas ouverts sur ce host.
- Aucun nouvel accès DB, aucun schéma Prisma, aucun secret ni déploiement Vercel supplémentaire.
- Le contenu T1 est statique, curé, consultable FR/EN, recherchable et filtrable par audience.
- L’aide contextuelle continue de vivre dans l’application authentifiée; le portail renvoie vers cette source plutôt que copier des procédures sensibles.

## QA et livraison

### Contrôles statiques et automatiques
- Résolution host `docs`, `getDocsUrl`, rewrite de la racine et refus `/api/*`.
- 12 pages synthétiques FR/EN, 2 audiences, aucune référence secrète.
- Rendu 320/360/375/390/414/768/1024 px et navigation clavier.
- `pnpm qa:docs-1099`, `pnpm qa:responsive-ui`, `pnpm qa:standard-experience`, `pnpm qa:regression`, `pnpm type-check`, `pnpm lint`, `pnpm build`.

### E2E manuel propriétaire (NON EXÉCUTÉ)
1. Ouvrir `https://docs.dtsc-platform.com/` sans session : vraie page documentaire, pas la page marketing. Ouvrir également `https://dtsc-platform.com/documentation` sans session et vérifier la même documentation depuis le menu desktop, le menu mobile et la page d’accueil.
2. Changer FR ↔ EN : navigation, articles, alertes et boutons traduits.
3. Rechercher « boutique » et filtrer par développeurs/utilisateurs ; vérifier que l’URL reste `/documentation` dans le site public et `/` sur le sous-domaine Docs.
4. Ouvrir un guide, vérifier les étapes et le retour vers le catalogue.
5. Vérifier les liens App/Support et l’absence de données internes.
6. Confirmer que `https://docs.dtsc-platform.com/api/...` n’expose aucun endpoint, même avec une session connectée ; vérifier qu’une URL de documentation non reconnue ne révèle aucun contenu interne.
7. Tester les vues de 320 à 1024 px et le mode sombre.
8. Confirmer que l’API publique est affichée **en préparation**, jamais « disponible ».

### Séquence gouvernée
Issue → branche `feat/1099-public-docs-portal` → PR → CI + revue → **OWNER_E2E final BON** → merge `main` → déploiement Vercel Production natif → vérification du SHA et des domaines.

## T2 / T3

**T2 :** enrichir les guides métiers, FAQ, captures anonymisées, pagination/recherche structurée, commentaires de qualité et liens contextuels depuis les modules. Construire un inventaire publié / versionné et harmonisé avec les guides canoniques et statuts de maturité.

**T3 :** portail API développeurs `v1` seulement après ouverture contractuelle, sandbox et OpenAPI certifiées. Exemples HTTP exécutables, SDKs, webhooks et gestion des clés viendront après sécurité et gouvernance.
