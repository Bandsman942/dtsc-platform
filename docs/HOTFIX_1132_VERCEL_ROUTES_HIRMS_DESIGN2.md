# Hotfix #1132 — Limite Vercel et interfaces HIRMS Design 2.0

## Incident P0 constaté sur le déploiement du 13/11/2026
- GitHub `main` commit `5e0a939fdb5b2ee80959a37f3e9c772cab61c0bb`, déploiement Vercel `dpl_CrS1U3vfbLrywGDUBGor3AVV6MGL` : `ERROR`.
- Message fournisseur exact : `too_many_routes` — `Maximum number of routes (rewrites, redirects, etc) exceeded. Max is 2048, received 2064`.
- Les migrations ont été appliquées et la compilation Next.js s’est terminée, mais la publication de la sortie a été refusée.
- Cause immédiate : **dépassement de la limite Vercel de routes produites par Next.js et ses matchers** ; ceci ne découle pas des identifiants HSL et ne justifie pas de retirer le middleware.
- Correctif : groupe les 19 préfixes identiques du matcher de session dans une expression paramétrée Next.js, conserve la règle exclusive `docs.dtsc-platform.com`, la racine et les chemins d'authentification. De 23 entrées middleware à 4, **économie prévisionnelle de 19** entrées, à confirmer par Vercel après le merge autorisé.
- Limite durable : avec une application proche de 2048, toute croissance ultérieure doit consolider les routes API et les sous-espaces en routes dynamiques/reutilisables, sans supprimer les capacités métier. Prévoir un contrôle du budget à chaque release.
- Ne pas présenter une compilation CI réussie comme une confirmation que la limite Vercel est résolue : seul un nouveau déploiement Vercel depuis `main` confirmera `READY`.

## Design 2.0 — quatre parcours cohérents
1. **Configuration HSL** : sélecteur UAT/Production, secrets masqués et chiffrés, test OAuth réel, liste des sites, identifiant numérique ServiceProviderID, indicateurs de préparation et disponibilité des transports.
2. **Adhérents** : numéro MSO, référence QR, nomenclature/prestation, date facultative, réponse HSL interprétée sans assimiler éligibilité à remboursement.
3. **Facturation** : import JSON individuel/bulk, contrôle de cohérence avec la facture ERP émise, confirmation explicite Production, réception/échec/incertitude, interrogation du statut HSL, lien vers le **modèle officiel HSL** par GET authentifié.
4. **OCR** : PDF/images ≤4 Mio via proxy direct, date/GUID/note facultatifs, idempotence SHA-256, job HSL, état à la demande ; notes et octets du document exclus de l'historique.

Les quatre écrans utilisent désormais un rail de navigation commun mobile-first, conservent l'environnement sélectionné et partagent l'interprétation des statuts. Les historiques Factures et OCR proposent une recherche intelligente bornée, filtres par statut, dates d'envoi UTC, pagination serveur, KPI de suivi, rafraîchissement et CSV audité de 500 lignes maximum.

## Règles métier et confidentialité
- Les exports sont **tenant-scoped** : contexte organisation/client/secteur + RBAC conservés à l'identique, filtre d'environnement toujours obligatoire, contrôle de débit et trace audit lors du téléchargement.
- Les cellules CSV sont échappées contre les formules Excel/LibreOffice (préfixes =, +, -, @). Données cliniques brutes, numéro de carte et secret HSL exclus.
- Les filtres de dates ciblent **submittedAt en UTC** uniquement, et non une date métier de prestation.
- Le modèle HSL est obtenu uniquement via `/api/invoices/standard-template` sur l'hôte officiel fixé côté serveur, avec OAuth du connecteur, vérification du MIME et limite de 2 Mio ; aucun proxy d'URL fourni par le navigateur.
- `RECEIVED` signifie réception technique HSL, **jamais paiement ou décision d’assurance**. Aucun module ne comptabilise automatiquement une prise en charge.
- Aucun droit HSL (`VerifyMembers`, `UploadInvoices`, `UploadDocuments`) n'est inventé. Production reste interdite pour les entreprises absentes de `HEALTH_INSURANCE_HIRMS_PRODUCTION_ORGANIZATION_IDS`.

## Vérification et livraison
- Test ciblé : `node scripts/qa-hotfix-1132-route-budget.mjs`.
- Test UI/historique : `node --experimental-strip-types scripts/qa-hirms-design2-1132.mjs`.
- QA existantes HIRMS (contrat, OCR), Prisma migrations, TypeScript, lint et build ; pipelines E2E GitHub.
- PR `#1133` en brouillon. **Ne pas fusionner ni déclencher de déploiement feature** avant E2E final propriétaire « BON ».
- Déploiement Production réparé seulement si Vercel indique `READY` pour le SHA fusionné de `main`.

## Travaux HIRMS nécessitant des preuves fournisseur
- Contrat OpenAPI HSL certifié, mapping guidé ERP→HSL sans saisie manuelle et validation humaine des diagnostics/montants.
- Réconciliation des statuts partiels des lots et règlements réellement confirmés, sans réécriture des écritures comptables.
- Pipeline privé OCR 4–50 Mo avec antivirus, storage signé et worker asynchrone.
- Autorisations individuelles des établissements dans la Console DTSC et démonstration réelle UAT/Production.
