# Hotfix #865 — Cohérence canonique Tiers, Contacts et Fournisseurs

## Baseline
`main@cc8140b86e10cd40eb597e954679f019ebf3176d`. Issue #865. Livraison exclusivement via PR, CI, OWNER_E2E et merge sur main.

## Causes confirmées
- `updateEnterpriseBusinessParty` modifiait `primaryEmail/primaryPhone` sans les contacts.
- L'édition ne prenait pas d'adresse malgré le modèle canonique.
- `refreshLinkedSupplierSnapshotFromParty` était exécuté séparément avec `Promise.allSettled` et son échec pouvait être silencieux.
- La liste fournisseurs ne résolvait pas la liaison de la fiche BusinessParty.
- Catégorie fournisseur non contrôlée; détails fournisseur trop succincts.
- La fiche `SYS-GAMING-WALKIN-*` est une contrepartie technique non liée à une personne réelle.

## Correction
- Coordonnées principales et contact métier primaire synchronisés dans la transaction du PATCH; contacts secondaires préservés.
- Adresse principale éditable; modification/archivage transactionnel et révision; pas de suppression physique.
- Projection Procurement et mise à jour BusinessParty synchronisées dans la même transaction, sans droit Procurement élargi.
- Liste fournisseurs lit la relation canonique consentie via `EnterpriseSupplierPartyLink`; la relation personnelle n'est jamais déduite automatiquement du nom ou de l'e-mail.
- Catégories fournisseurs contrôlées: GOODS, SERVICES, EQUIPMENT, IT, LOGISTICS, OTHER; labels FR/EN; les anciennes chaînes historiques restent lisibles.
- Fiche fournisseur enrichie : adresse, ville, pays, coordonnées, immatriculation, fiscalité, site et notes.
- Client comptoir Gaming : présentation explicite de son inéligibilité à la liaison.

## Données, sécurité et compatibilité
Pas de nouvelle migration ni de backfill automatique ni de suppression de données. `organizationId`, RBAC CRM / SUPPLIERS_PURCHASES et consentement restent obligatoires. L'ancienne API fournisseur est validée sur les catégories pour les nouvelles écritures; les valeurs historiques sont affichées sans inventer une nouvelle valeur. Aucun nouveau plan ou entitlement.

## Validation attendue
- `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:regression`, `pnpm build`, quality gates.
- OWNER_E2E : créer un tiers réel, modifier e-mail/téléphone et vérifier Contacts (dont secondaires), ajouter/changer/retirer adresse, recharger; vérifier fiche fournisseur liée et relation consentie des deux côtés; créer fournisseur et vérifier catégorie, détail et contact; vérifier client comptoir Gaming et séparation des tenants.
- FR/EN, 320/360/390/414px, mode clair/sombre, clavier, multi-tenant.

## Risques et rollback
Risque de concurrence sur les contacts primaires et de divergence de données historiques. Conserver l'audit, tester les cas de contact archivé/dupliqué; rollback applicatif seulement, jamais effacement d'historique. Aucun E2E validé tant que l'utilisateur ne l'a pas confirmé.

## Matrice de preuves
| Contrôle | Statut | Preuve |
|---|---|---|
| Diff / Prisma / QA / Lint / Typecheck / Build | NOT_EXECUTED | CI attendue sur head final |
| OWNER_E2E | NOT_EXECUTED | Propriétaire avant merge |

Dette : référentiel configurable de catégories fournisseur par entreprise hors périmètre du hotfix d'urgence; réutilisation du référentiel de codes contrôlés en place. Les valeurs historiques restent compatibles.
