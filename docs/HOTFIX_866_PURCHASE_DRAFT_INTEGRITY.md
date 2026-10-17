# Hotfix #866 — Brouillons achats et intégrité Prisma

## Baseline
`main@cc8140b86e10cd40eb597e954679f019ebf3176d`. Issue #866.

## Cause technique probable
`preparePurchaseItems` fabriquait des `EnterprisePurchaseItem` avec `organizationId`, puis insérait directement ces objets via `items: { create: calculated.items }` dans le parent composite `EnterprisePurchase`. Même pattern pour `EnterprisePurchaseReceipt` et ses items. Cette forme est incompatible avec les inputs Prisma relationnels imbriqués checked. La confirmation du symptôme exact en Production requiert l'E2E/les logs; le correctif cible cette erreur structurelle.

## Corrections
- Dans les créations imbriquées, laisser Prisma hériter `organizationId` de la relation parent. Maintenir explicitement `organizationId` pour le `createMany` de modification indépendant.
- Maintenir calcul Decimal, liens catalogue, transaction Prisma, validation fournisseur/budget/devise et règles RBAC/tenant.
- Ne plus rapporter une création persistée comme échouée si AuditLog / ApiLog post-commit échoue ; signaler la défaillance interne sous code contrôlé.
- En cas d'erreur interne 500, générer une référence d'incident sans divulguer de message Prisma ni contenu métier sensible.
- QA ciblée ajoutée dans la suite Sprint 7; ne pas supprimer les tests existants.

## OWNER_E2E requis
Créer un brouillon à une puis plusieurs lignes (article GOODS et SERVICE), avec devise d'entreprise explicite, enregistrer, recharger et vérifier tous les totaux; éditer le brouillon, soumettre/faire approuver par un autre utilisateur, commander, réceptionner et vérifier stock idempotent. Essayer un article hors tenant ou inactif, des valeurs invalides, une devise/budget incompatible et constater les messages. Tester retour d'erreur post-commit de log simulée sans doublon. FR/EN, mobile, contexte multi-tenant.

## Migrations et sécurité
Aucune migration destructive ni modification comptable; sécurité same-origin, session, rate limit, membership, permissions, sources tenant-scoped conservées. Aucun plan ou IA élargi.

## Rollback
Revert des commits après contrôle. Ne jamais supprimer les achats ou réceptions créés. Aucune mise en production depuis une branche ni avant OWNER_E2E.

## Matrice de preuves
| Contrôle | Statut | Preuve |
|---|---|---|
| Diff / Prisma / QA / Lint / Typecheck / Build | NOT_EXECUTED | CI attendue sur head final |
| OWNER_E2E | NOT_EXECUTED | À confirmer par le propriétaire |

Dette de conception suivie : audit post-commit est best-effort ; une journalisation transactionnelle/outbox pourra être durcie séparément si l'observabilité détecte une perte d'événement.
