# Sécurité financière ERP

## Contrôle d’accès

Toute mutation suit : session → contexte organisation → membre actif → organisation CLIENT → module actif → entitlement → permission → visibilité → same-origin → Zod → `await rateLimit` → transaction → concurrence optimiste → `ApiLog` → `AuditLog`.

Les permissions Finance sont décomposées par domaine et action : view, create, update, submit, review, approve, post, reverse, pay, reconcile, close, reopen, export, manage et view_sensitive.

Les nouvelles routes de détail Banque/Rapprochement et les commentaires Finance utilisent le même autorisateur central. L’objet ciblé est ensuite recherché avec le même `organizationId`, ce qui bloque les IDOR même lorsque l’identifiant existe dans un autre tenant.

## Séparation des responsabilités

Les services interdisent l’auto-approbation pour factures, paiements, transferts, caisse, écritures, paie et clôture lorsque le flux exige un acteur indépendant. Les workflows appellent les mêmes services et ne modifient jamais directement un statut financier.

Le caissier soumet sa clôture ; un validateur distinct prend la décision lorsque la politique le prévoit. Un rapprochement clôturé ne peut être modifié sans procédure contrôlée.

## Intégrité

- Tous les montants utilisent `Prisma.Decimal`.
- Toute écriture est équilibrée.
- Une période fermée bloque la comptabilisation et toute mutation interdite.
- Une écriture `POSTED` est immuable.
- Une correction utilise une contrepassation, un avoir ou un remboursement contrôlé.
- Toute comptabilisation métier possède une clé d’idempotence et un verrou transactionnel.
- Les allocations déterminent les soldes ouverts et restent bornées par le paiement disponible et le solde de la facture.
- Une facture émise produit une créance ou dette commune unique.
- Aucun double paiement, transfert, posting, import ou rapprochement n’est autorisé.

## Confidentialité

Sont sensibles : salaires, comptes et références bancaires, identifiants fiscaux, pièces justificatives, écritures manuelles, relevés bancaires et rapports non publiés. Les Push et notifications verrouillées restent génériques. Aucun secret bancaire, token, clé API, document complet ou numéro de compte complet n’est exposé côté client ou dans les logs.

Les références bancaires affichées restent masquées. Les justificatifs passent par le stockage documentaire privé, versionné et contrôlé.

## Import bancaire

L’import CSV vérifie au minimum l’extension, le type MIME, la taille, le nombre de lignes, les colonnes nécessaires, la devise, le compte et l’organisation. Les cellules commençant par une formule sont neutralisées avant affichage ou export. Les doublons sont détectés sans supprimer automatiquement la preuve suspecte.

Les formats non réellement supportés ne sont jamais annoncés comme fonctionnels.

## Commentaires financiers

`EnterpriseFinanceComment` est tenant-scoped. Seul l’auteur peut modifier ou archiver logiquement son commentaire. Les créations, modifications et archivages sont audités. Un commentaire ne remplace pas une décision structurée de workflow.

## Isolation

Toutes les requêtes utilisent `organizationId` et des clés/contraintes tenant-aware. Aucun rôle global DTSC, rôle manager générique ou relation active avec une entreprise ne reçoit automatiquement accès à la Finance d’une entreprise cliente. Les finances internes DTSC restent séparées. Pharmacy et Health ne peuvent projeter vers la Finance commune qu’avec les permissions et services prévus.

## Règles côté client

Le navigateur ne fournit jamais SQL, JavaScript, nom de modèle Prisma, formule libre ou compte arbitraire à comptabiliser. Les sélecteurs chargent des objets du même tenant et le serveur revalide toutes les clés étrangères. Aucun UUID n’est demandé à l’utilisateur dans un formulaire professionnel.

## Incident et rollback

Un feature flag ou une politique serveur peut arrêter une route mutante ou le posting automatique tout en permettant les lectures et brouillons. Les écritures existantes restent consultables. Les migrations, factures, créances, dettes, paiements, allocations, clôtures, relevés et rapprochements ne sont jamais supprimés par rollback.

## Validation commerciale

Les Quality Gates automatisés valident sécurité, schéma, migrations, régression et build. La promotion vers `COMMERCIAL_READY` exige en plus une validation E2E authentifiée et explicitement confirmée par le propriétaire de DTSC Platform.
