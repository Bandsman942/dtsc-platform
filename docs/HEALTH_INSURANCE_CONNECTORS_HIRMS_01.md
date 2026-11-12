# Connecteurs d'assurances santé — HIRMS / MSO (Lot 01)

**État :** premier lot intégré en branche feature, UAT uniquement, non certifié Production.
**Base documentaire :** « Guide de l'API HIRMS » fourni le 12/11/2026, copie MHT de /docs/guide.
**À obtenir impérativement :** OpenAPI 3 depuis `https://hirmsapi.healthsystemlink.com/docs/openapi/client.json` et le modèle de facture HSL; l'accès en ligne à cette URL n'a pas pu être vérifié durant l'implémentation.

## Architecture et propriété

- Registre générique `HEALTH_INSURANCE_ADAPTERS` ; premier adaptateur statique `HIRMS_HSL`.
- Les patients, consultations, prescriptions et lots restent Health/Pharmacy; finance conserve ses factures, créances et paiements canoniques. Aucun double posting.
- Une connexion UAT `EnterpriseHealthInsuranceConnector` par organisation (`organizationId,adapterCode`). `siteId` facultatif et validé côté serveur, pour un site HSL explicitement lié. Le multi-site avec identifiants HSL distincts est à implémenter dans un lot ultérieur.
- Secrets chiffés AES-256-GCM côté serveur avec `HEALTH_INSURANCE_CREDENTIALS_KEY`, jamais transmis au navigateur après enregistrement.
- Jetons Authentik `client_credentials`, `client_id=hirms-ingest`, `scope=invoices:submit`, `username` et `password`, cache mémoire jusqu'à expiration, renouvellement unique sur HTTP 401.
- Les URLs UAT sont des constantes invariables : `https://hslauth.alatlabs.com/application/o/token/` et `https://hslapi.alatlabs.com`. Pas d'URL distante libre ni accès production.
- L'action réelle implémentée est `POST /api/members/verify` (numéro MSO, référence QR exacte, code de prestation facultatif, système CPT/CDT/HCPCS/DRUG, date facultative).
- Les résultats HSL sont validés, limités aux champs documentés et conservés sans référence QR ni identité complète en base. L'interface n'infère ni plafond ni montant de prise en charge.
- HSL impose au plus 120 vérifications/minute/client : limite DTSC 100/minute/organisation et 30/minute/utilisateur en plus. Un 429 externe expose un `Retry-After` borné.

## Interfaces

- `/enterprise-admin/health-insurance-connectors` : entreprise Santé/Pharmacie, droit `ADMIN_DASHBOARD.manage`, paramètres UAT, site, credentials, test OAuth, état et aide contextualisée.
- `/enterprise-insurance/verify` : collaborateurs habilités (création de demande de prise en charge Health, création de vente Pharmacy), vérification réelle et résultat séparant `verified`, `cover`, `service`, `network`.
- Liens directs ajoutés aux workspaces `INSURANCE_COVERAGE` et `PHARMACY_SALES`.

## API DTSC

| Route | Méthode | Accès | Résultat |
|---|---|---|---|
| `/api/enterprise/[organizationId]/insurance-connectors` | GET | administrateur entreprise autorisé, même tenant | configuration expurgée, liste des sites |
| Même route | POST | même accès, CSRF same-origin, rate limit, Zod | upsert chiffré de compte/secret/site; ou `{"action":"check"}` pour OAuth |
| `/api/enterprise/[organizationId]/insurance-connectors/verify` | POST | utilisateur Health/Pharmacy habilité, tenant, same-origin, limites | réponse normalisée HIRMS, journal audité, pas de cache HTTP |

### Erreurs utilisateur et limites

Les erreurs sont renvoyées sous `{error, message}`. Aucun JSON brut HSL, secret, JWT, numéro MSO complet ou carte QR n'est journalisé. `401` = compte/secret HSL refusé ; `403` = action HSL interdite ; `429` = débit dépassé ; `502/503` = HSL indisponible ou réponse invalide. Les opérations de vérification ne sont pas automatiquement rejouées en boucle.

## Déploiement et environnement

Créer une variable serveur Vercel **`HEALTH_INSURANCE_CREDENTIALS_KEY`** contenant 32 octets aléatoires codés en 64 caractères hexadécimaux (ou base64). Le navigateur ne reçoit jamais cette valeur. Sans cette clé, l'enregistrement des identifiants est interdit. Une rotation de clé requiert un processus de rechiffrement des connexions existantes avant activation.

Ne pas saisir de compte HSL réel dans une fixture, un test, une issue ou un log. HSL attribue les comptes/secret avec approbation à quatre yeux. Le test OAuth seul ne démontre pas que `VerifyMembers` est permis; l'utilisateur devra ensuite faire une vérification UAT autorisée.

## Hors périmètre et lot suivant

- Validation des modèles OpenAPI facture et OCR, envoi simple/bulk, statuts et documents, mappings catalogue factures.
- Préautorisations et décisions financières hors API documentée.
- Habilitation d'activation Production par Console DTSC; multi-site avec credentials distincts, révocation, renouvellement et supervision.
- Synchronisation des factures uniquement après confirmation du contrat JSON ; ne jamais simuler le succès HSL.
- Étude de conservation/effacement des historiques d'éligibilité suivant convention et politique des données de santé.

## QA requise

`pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, `node scripts/qa-health-insurance-hirms-01.mjs`, `pnpm qa:regression`, `pnpm build`, PR Quality Gates, puis E2E manuel Health/Pharmacy sur UAT avec compte HSL habilité.

Ne jamais fusionner ou déployer en Production avant les gates, les essais métier et le feu vert E2E.
