## 2026-10-13 — AI-CONSOLE-04 : sources de connaissance et signaux de sécurité

### Première tranche réalisée
- L'Administration DTSC consulte les nombres de sources documentaires personnelles et d'entreprises, par statut READY/PROCESSING/FAILED et autres statuts, sur la période déjà sélectionnée.
- Les erreurs d'appels modèles `AiModelCall` et refus d'outils `AiToolExecution` sont présentés en événements agrégés bornés, avec leurs motifs, sans contenu des messages ou données clients.
- Le panneau signale explicitement le **taux de cache CAG non instrumenté** ; les alertes sont évaluées depuis les règles effectivement publiées, sans simuler une santé « OK ».
- Consultation dans le Centre IA déjà protégé par `CONSOLE_AI_READ`, FR/EN et tableaux mobiles.

### Restant à réaliser dans le hotfix #804
- Preuve de citations et métriques de retrieval si une source instrumentée le permet ; ne pas les inventer.
- Vérification E2E des seuils et de leur désactivation, déjà implémentés et audités.
- Politique de réindexation bornée avec justification, sans lancement massif en Production.
- Validation CI et OWNER_E2E avant fusion.

### Sécurité
Aucun titre de document, contenu privé, chemin de stockage, jeton, identité de tenant, argument outil ou donnée de source RAG envoyé au navigateur. Les erreurs de lecture renvoient un état indisponible, jamais un zéro inventé.


### Ajout supplémentaire
- Publication administrative des seuils et criticités de trois signaux opérationnels (échecs modèle, refus d'outils, échecs d'indexation), avec désactivation auditable et protection contre les conflits concurrents.
- Signaux affichés sur la période sélectionnée ; aucun faux état sain ni notification automatique simulée.
- Migration additive `AiGovernanceAlertRule`, audit dans `PlatformSettingHistory`, permission `CONSOLE_AI_MANAGE`.

La répartition legacy / index versionné est maintenant affichée. La réindexation contrôlée, les preuves de citations et l'E2E complet restent à finaliser dans #804.
