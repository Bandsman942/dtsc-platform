# Hotfix #873 — Professionnalisation des Activités entreprise / Gaming

## Problème
La présentation historique en panneaux et accordéons ne suivait pas le workspace ERP commun et les actions hors Health/Pharmacy utilisaient des champs génériques inadéquats. Gaming Lounge héritait notamment du secteur HOSPITALITY_EVENTS sans adaptation des formulaires.

## Implémentation
- Standard ModuleWorkspace → ModuleHeader → ModuleMetrics → ModuleToolbar → ModuleContent → ModuleSection, navigation Actions / Demandes / Workflows et rail horizontal local.
- Sous-secteur canonique résolu depuis EnterpriseBusinessSubtypeSelection et affiché en en-tête.
- Champs Gaming, hôtellerie et socle commun adaptés avec références canoniques réelles et tenant-scopées.
- Validation serveur des champs obligatoires, enum, nombre, date et références Gaming/CRM PERSON; contrôle organizationId. Pas de mutation Gaming/Finance implicite : chaque activité crée une demande liée à EnterpriseRequest.
- Succès et erreur par toast global; pas de reset si échec; dialog éditeur mobile. Les détails sectoriels restent dans des métadonnées contrôlées plutôt que recopiés dans la description transverse.
- Demande de stock cuisine désactivée dans Gaming Lounge y compris depuis l'API.

## Limites explicites
Les actions de demande / confirmation créent des demandes collaboratives; l'exécution réelle reste dans les modules Gaming et ERP canoniques. Les parcours Health et Pharmacy restent dédiés.

## QA & E2E
- pnpm qa:hotfix-873-activities intégré à qa:regression.
- CI : Prisma generate, QA ciblée, responsive, standard experience, lint, type-check, build.
- OWNER_E2E requis : rapports, incidents, demandes Gaming, références existantes/hors-tenant, droits, FR/EN, mobile 320–1024, dark/light, clavier, aucun chevauchement.

## Risques / rollback
Aucune migration ni destruction de données. Rollback de l'interface par PR traçable. Production depuis main après CI et OWNER_E2E seulement.