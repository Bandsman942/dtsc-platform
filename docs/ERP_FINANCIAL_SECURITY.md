# Sécurité financière ERP

## Contrôle d’accès

Toute mutation suit : session → contexte organisation → membre actif → organisation CLIENT → module actif → entitlement → permission → visibilité → same-origin → Zod → `await rateLimit` → transaction → concurrence optimiste → `ApiLog` → `AuditLog`.

Les permissions Finance sont décomposées par domaine et action : view, create, update, submit, review, approve, post, reverse, pay, reconcile, close, reopen, export, manage et view_sensitive.

Les routes Comptabilité, Fiscalité, Clôture, États, Immobilisations et Valorisation utilisent le même autorisateur central. L’objet ciblé et toutes ses références sont recherchés avec le même `organizationId`, ce qui bloque les IDOR même lorsque l’identifiant existe dans un autre tenant.

## Séparation des responsabilités

Les services interdisent l’auto-approbation pour factures, paiements, transferts, caisse, écritures, paie et clôture lorsque le flux exige un acteur indépendant. Les workflows appellent les mêmes services et ne modifient jamais directement un statut financier.

Le préparateur d’une écriture ne devient pas automatiquement son approbateur. La contrepassation d’une écriture comptabilisée exige également un acteur indépendant des principaux acteurs de l’écriture d’origine.

Le caissier soumet sa clôture ; un validateur distinct prend la décision lorsque la politique le prévoit. Un rapprochement clôturé ne peut être modifié sans procédure contrôlée. Une réouverture de période exige une permission dédiée, un motif et une piste d’audit.

## Intégrité

- Tous les montants utilisent `Prisma.Decimal`.
- Toute écriture est équilibrée.
- Une période fermée bloque la comptabilisation et toute mutation interdite.
- Une écriture `POSTED` ou `REVERSED` est immuable.
- Une correction utilise une contrepassation, un avoir ou un remboursement contrôlé.
- Toute comptabilisation métier possède une source, une version, une clé d’idempotence et un verrou transactionnel.
- Les allocations déterminent les soldes ouverts et restent bornées par le paiement disponible et le solde de la facture.
- Une facture émise produit une créance ou dette commune unique.
- Aucun double paiement, transfert, posting, import, rapprochement, amortissement ou événement de valorisation n’est autorisé.
- Un taux fiscal ou de change déjà utilisé ne réécrit jamais l’historique.
- Une version publiée d’un état financier ne peut pas être modifiée.

## Confidentialité

Sont sensibles : salaires, comptes et références bancaires, identifiants fiscaux, pièces justificatives, écritures manuelles, relevés bancaires, rapports non publiés, données de clôture et exports financiers. Les Push et notifications verrouillées restent génériques. Aucun secret bancaire, token, clé API, document complet ou numéro de compte complet n’est exposé côté client ou dans les logs.

Les références bancaires affichées restent masquées. Les justificatifs passent par le stockage documentaire privé, versionné et contrôlé.

Un lecteur du grand livre ne reçoit pas automatiquement les détails individuels de la paie. Les données cliniques et sectorielles ne sont jamais intégrées aux métadonnées de posting ou aux logs Finance.

## Imports et exports

L’import CSV vérifie au minimum l’extension, le type MIME, la taille, le nombre de lignes, les colonnes nécessaires, la devise, le compte et l’organisation. Les cellules commençant par une formule sont neutralisées avant affichage ou export. Les doublons sont détectés sans supprimer automatiquement la preuve suspecte.

Les exports respectent les filtres, la permission, la période, la devise et l’audit. Les formules tableur dangereuses sont neutralisées. Les formats non réellement supportés ne sont jamais annoncés comme fonctionnels.

## Commentaires financiers

`EnterpriseFinanceComment` est tenant-scoped. Seul l’auteur peut modifier ou archiver logiquement son commentaire. Les créations, modifications et archivages sont audités. Un commentaire ne remplace pas une décision structurée de workflow.

## Isolation

Toutes les requêtes utilisent `organizationId` et des clés ou contraintes tenant-aware. Aucun rôle global DTSC, rôle manager générique ou relation active avec une entreprise ne reçoit automatiquement accès à la Finance d’une entreprise cliente. Les finances internes DTSC restent séparées. Pharmacy et Health ne peuvent projeter vers la Finance commune qu’avec les permissions et services prévus.

Le client ne peut jamais fournir un `organizationId`, un compte, une période, un journal, un actif ou un article provenant d’une autre entreprise et contourner la validation serveur.

## Règles côté client

Le navigateur ne fournit jamais SQL, JavaScript, nom de modèle Prisma, formule libre ou compte arbitraire à comptabiliser. Les sélecteurs chargent des objets du même tenant et le serveur revalide toutes les clés étrangères. Aucun UUID, enum brute ou nom Prisma n’est demandé à l’utilisateur dans un formulaire professionnel.

Les messages visibles traduisent les codes d’erreur financiers en instructions métier compréhensibles. Les codes restent disponibles pour l’observabilité sans devenir le seul texte affiché.

## Audit d’intégrité

`scripts/audit-financial-integrity.mjs` accepte des filtres bornés par entreprise, période, date, journal et compte. Il retourne des compteurs agrégés, sans imprimer les écritures complètes ni les données sensibles. Il ne répare jamais silencieusement une anomalie historique.

## Incident et rollback

Un feature flag ou une politique serveur peut arrêter une route mutante ou le posting automatique tout en permettant les lectures et brouillons. Les écritures existantes restent consultables. Les migrations, factures, créances, dettes, paiements, allocations, clôtures, états publiés, amortissements, valorisations, relevés et rapprochements ne sont jamais supprimés par rollback.

## Validation commerciale

Les Quality Gates automatisés valident sécurité, schéma, migrations, base vide, régression et build. La promotion vers `COMMERCIAL_READY` exige en plus une validation E2E authentifiée et explicitement confirmée par le propriétaire de DTSC Platform.

**Tests E2E manuels préparés — validation du propriétaire en attente.**
