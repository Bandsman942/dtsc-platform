# Connecteurs d'assurances santé — HIRMS / MSO (HIRMS-01)

## Périmètre
Adaptateur HSL UAT-only (12 novembre 2026), pour secteurs HEALTH_CARE et PHARMACY. Ne jamais confondre accusé de réception technique, décision d'assurance et paiement. Les objets ERP communs (EnterpriseSalesInvoice, créance, allocations, paiements, comptabilité) restent seuls maîtres des données financières.

## Fournisseur
UAT API : https://hslapi.alatlabs.com
UAT OAuth : https://hslauth.alatlabs.com/application/o/token/
OAuth : client_credentials, client_id=hirms-ingest, scope=invoices:submit, username/secret individuels délivrés par HSL.
Habilitations externes : VerifyMembers et UploadInvoices, attribuées par HSL après approbation à quatre yeux. Authentification réussie ne garantit pas les droits métier. Aucun accès Production dans ce lot.

## Configuration
Administration entreprise → Paramètres entreprise → Connecteurs d'assurances santé.
Entrées : site DTSC, identifiant numérique ServiceProviderID délivré par HSL, compte technique HSL et secret.
Les identifiants sont chiffrés AES-256-GCM, jamais affichés après enregistrement ; seuls les statuts non sensibles reviennent au navigateur.
Variables serveur à fournir :
- HEALTH_INSURANCE_CREDENTIALS_KEY : clé aléatoire de 32 octets (64 caractères hexadécimaux ou base64), jamais préfixée NEXT_PUBLIC_ ; rotation nécessite un plan de rechiffrement.
- HEALTH_INSURANCE_HIRMS_UAT_INVOICE_SEND_ENABLED : false par défaut ; true uniquement après habilitation UploadInvoices et validation de la recette UAT.

## Routes DTSC
- GET/POST /api/enterprise/[organizationId]/insurance-connectors : administration de la connexion et test OAuth.
- POST /api/enterprise/[organizationId]/insurance-connectors/verify : numéro MSO + référence exacte de carte + prestation optionnelle.
- GET /api/enterprise/[organizationId]/insurance-connectors/invoices?page=1 : historique paginé de 20 transmissions.
- POST /api/enterprise/[organizationId]/insurance-connectors/invoices : corps { operation: "preflight"|"submit", mode: "single"|"bulk", payload: <facture HSL ou tableau> }.

## Contrat JSON fourni le 12 novembre 2026
Envoi individuel : POST /api/invoices avec un objet.
Bulk : POST /api/invoices/bulk avec un tableau de 1 à 500 objets ayant le même schéma.
Champs exacts du parent : InvoiceID, InvoiceNumber, Currency, ConversionRate, ServiceProviderID, ClaimAmount, AdjustedAmount, ApprovedAmount, PaymentStatus, InvoiceDate, AssessmentDate, PaymentDate, CreatedAt, SubmitedBy, RecievedBy, SubmitedByEmail, DocumentId, Consultations, NumAuto, Site, JournalizedDate, Type, InvoiceItems, ServiceProviders, ScanId, Notes.
Chaque InvoiceItems inclut : Description, Qty, Amount, AssignedTo, ItemId, CPTCode (TABLEAU de détails), MemberNumber, IcD10, CPTCode_Code, TreatmentDate, AdmissionDays, PreAuthNo, Notes, AdmissionDate, DischargeDate, IsOutPatient, ProviderServiceId, ConsulationId, IsComplete, BenefitId, DocumentId.
Chaque objet du tableau CPTCode contient : AutoAssess, Conclusion, ApprovedAmount, RejectionReason, Description, CPTCode, Benefit, BenefitName, PreAuth, Amount, Units, Date, DueToClient, DueToInsurer, DueToMember.
Conserver les graphies inhabituelles, car ce sont les noms réels transmis par HSL.

Le JSON d'exemple indique des types et des clés mais ne prouve pas tous les champs requis ni leur sémantique. Les dates d'évaluation et de paiement, les montants approuvés, la ventilation des payeurs, les codes diagnostiques et les ID d'actes ne sont PAS déduits automatiquement. Le back-office UAT prend un JSON HSL préparé, puis le compare à la facture ERP. La transformation ERP→HIRMS complète requiert certification du schéma OpenAPI et des règles métier HSL.

## Préflight métier
Une facture doit être émise, appartenir au même organizationId, et être liée à HealthBillingExtension ou PharmacySalesExtension. Les propriétés InvoiceID (= identifiant canonique DTSC provisoire), InvoiceNumber, Currency, InvoiceDate, ClaimAmount, ItemId et Qty doivent correspondre exactement à la facture et aux lignes ERP. ServiceProviderID doit être configuré par l'admin de l'entreprise. L'hypothèse d'égalité InvoiceID/ItemId avec les identifiants DTSC doit être confirmée en UAT par HSL avant tout usage commercial.

## Sécurité et transmission
AES-256-GCM pour le secret. RBAC, activeOrganizationId, module Santé ou Pharmacie, même origine, rate limiting, audit minimal. Aucune donnée clinique détaillée ni QR complet dans les journaux d'intégration. Payload d'envoi seulement en mémoire le temps de la requête HTTPS; seul un SHA-256 et des références financières non cliniques sont conservés.
Outbox persistante, clé unique organizationId + adapterCode + salesInvoiceId : envoi double bloqué. États SENDING, QUEUED (HTTP 202), RECEIVED, REJECTED, UNKNOWN_OUTCOME. Une issue incertaine bloque tout replay automatique. Aucun statut ne déclenche de comptabilisation ni de paiement.
Les retours 400, 403, 429, 5xx doivent être distingués. Le fournisseur peut renvoyer des violations V1-V8 par chemin JSON; ne jamais créer de facture ERP automatique à partir de ces erreurs.

## Restant à certifier
- Signification exacte et caractère obligatoire de chaque champ, états de paiement, conversions et droits HSL.
- Mapping nomenclature CPT / DRUG / ICD10 et relations entreprises / sites / ID du prestataire.
- Mapping déterministe des champs à partir des objets ERP; UI guidée de complétion plutôt que JSON manuel.
- GET /api/invoices/status et /api/invoices/status/{invoiceId}, y compris réponses partielles des lots.
- OCR documentaire, supervision Console DTSC, gestion production et multi-sites.
- Tests UAT contre contrat HSL réel, puis E2E final et fusion main uniquement après validation.

## Contrôles
node --experimental-strip-types scripts/qa-hirms-invoice-contract-01.mjs
pnpm prisma generate ; pnpm type-check ; pnpm lint ; pnpm qa:regression ; pnpm build (en CI quand disponibles).
