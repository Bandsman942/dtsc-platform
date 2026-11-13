# Pipeline documentaire HIRMS/MSO — OCR-01 (branche PR #1128)

## Objectif
Synchroniser les documents de facturation PDF/image avec l'OCR HSL sans confondre **upload**, **lecture**, **facture acceptée**, **prise en charge** et **paiement**. Aucun résultat OCR ne crée, valide, modifie ou comptabilise une facture.

## Contrat HSL confirmé par le guide client
- UAT API : https://hslapi.alatlabs.com ; Production : https://hirmsapi.healthsystemlink.com.
- Autorisation HSL : `UploadDocuments`, séparée de `UploadInvoices` et `VerifyMembers`.
- `POST /api/ocr/documents` : `multipart/form-data` avec `file` PDF/image ; `providerId` (GUID d’établissement HSL, requis si plusieurs établissements), `invoiceDate` (`yyyy-MM-dd`) et `note` facultatifs. `providerId` est distinct du `ServiceProviderID` numérique des factures.
- `GET /api/ocr/jobs/{jobId}` : suivi asynchrone du traitement ; 202 indique une réception en cours, **pas** une approbation médicale ou financière.
- HSL annonce 50 Mo maximum par document. Le proxy direct Next.js/Vercel implémenté limite chaque fichier à **4 MiB** : son enveloppe HTTP est contrôlée avant lecture ; ne jamais afficher 50 Mo comme limite de notre interface.
- Les noms exacts des propriétés du JSON de réponse, les codes d'état et le comportement de reprise restent **non certifiés** sans modèle OpenAPI et essais HSL. Le code reconnaît un nombre limité de références de job ; une réponse sans référence exploitable reste `REFERENCE_UNCONFIRMED` et ne doit pas être renvoyée automatiquement.

## Parcours DTSC
1. Admin Santé/Pharmacie configure un connecteur UAT ou Production **indépendant**, chiffré, vérifié via HSL.
2. Responsable accède à `/enterprise-insurance/ocr?environment=UAT|PRODUCTION`, choisit un PDF/PNG/JPEG/WebP, peut préciser le GUID d'établissement HSL, la date de facture, une note et éventuellement l'identifiant d'une facture ERP déjà émise.
3. Contrôles tenant + secteur + RBAC + CSRF + limite de débit + organisation Production autorisée + flag `UploadDocuments` (DTSC) + signature réelle du fichier + taille.
4. Une ligne d'outbox `EnterpriseHealthInsuranceOcrJob` est créée **avant** l'appel externe ; unicité entreprise + adaptateur + environnement + SHA-256 du document.
5. Transmission HSL en HTTPS (OAuth actualisé une fois sur 401). Un succès réseau enregistre seulement la référence éventuelle du job et son code d'état. Timeout et 5xx ambiguës restent `UNKNOWN_OUTCOME` ; aucun retry implicite.
6. L'utilisateur peut cliquer sur « Vérifier l'avancement » pour appeler HSL. Seul un code de statut court est conservé. Les données extraites, le nom du fichier et le document ne sont pas stockés en base ni dans l'audit.
7. La facture commune DTSC, la créance, les écritures et la caisse restent inchangées. Le traitement des données OCR est une étape documentaire, non une preuve d'éligibilité ou de remboursement.

## Routes
- `GET /api/enterprise/[organizationId]/insurance-connectors/ocr?environment=UAT&page=1` : liste de 20 statuts du même tenant et du même environnement.
- `POST /api/enterprise/[organizationId]/insurance-connectors/ocr` : multipart `environment`, `file`, avec `providerId`, `invoiceDate`, `note` et `salesInvoiceId` facultatifs ; en Production `productionConfirmation=PRODUCTION`.
- `POST /api/enterprise/[organizationId]/insurance-connectors/ocr/status` : JSON `{ "environment":"UAT", "id":"<identifiant d'outbox DTSC>" }`; l'ID HSL n'est jamais pris directement du navigateur.
- `POST /api/enterprise/[organizationId]/insurance-connectors/invoices/status` : suivi distinct d'une transmission de facture HSL, sans assimilation à la comptabilité.

## Activation serveur (toutes désactivées par défaut)
```env
HEALTH_INSURANCE_CREDENTIALS_KEY=
HEALTH_INSURANCE_HIRMS_UAT_OCR_ENABLED=false
HEALTH_INSURANCE_HIRMS_PRODUCTION_ENABLED=false
HEALTH_INSURANCE_HIRMS_PRODUCTION_ORGANIZATION_IDS=
HEALTH_INSURANCE_HIRMS_PRODUCTION_OCR_ENABLED=false
HEALTH_INSURANCE_HIRMS_UAT_INVOICE_SEND_ENABLED=false
HEALTH_INSURANCE_HIRMS_PRODUCTION_INVOICE_SEND_ENABLED=false
```
`HEALTH_INSURANCE_HIRMS_PRODUCTION_ORGANIZATION_IDS` : liste explicite d'ID entreprise, sans joker. Les flags de Production ne constituent pas à eux seuls les habilitations HSL ; HSL doit octroyer `UploadDocuments` au compte Production de chaque prestataire. Ne pas activer avant contrôle sécurité et recette partenaire.

## Travaux non certifiés
- Pipeline 4–50 Mo via dépôt direct dans le Storage privé (URL signée, antivirus/contrôle contenu, tâche dédiée hors Vercel) : **non implémenté** dans OCR-01. Ne pas détourner le proxy existant pour dépasser 4 MiB.
- Approbation humaine des résultats extraits avant rapprochement facture-lignes/actes, comparaisons tarifaires et mapping de médicaments/actes : à spécifier avec le contrat OCR HSL.
- Les nomenclatures du job HSL, les réponses partielles et leurs transitions nécessitent le schéma OpenAPI HSL. Pas de simulation du fournisseur en Production.
- Recette HSL UAT avec des identifiants habilités, puis Production sur une entreprise approuvée, avant le feu vert propriétaire.

## QA
`node scripts/qa-hirms-ocr-01.mjs` et `pnpm qa:regression`, Prisma generate, migrations, lint, type-check, build, puis E2E manuel document→job→poll→résultat sans effets comptables. E2E réel HSL **non établi** sans secrets et habilitations correspondants.
