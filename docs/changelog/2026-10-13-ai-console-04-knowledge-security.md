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

### Planification RAG sans exécution
- L'aperçu Console peut compter jusqu'à 25 candidats historiques préparés par domaine, sans exposer les identifiants ni les contenus, sans déclencher la réindexation.
- Les reindexations réelles restent des actions unitaires de leurs espaces personnels et entreprises avec permissions/audit.

### Observabilité documentaire supplémentaire
- La Console lit désormais seulement des nombres agrégés de `EnterpriseAiMessage.citationsJson` (réponses contenant des références jointes et nombre de candidats), avec filtre temporel et exclusion des messages supprimés ; aucun contenu privé ni identifiant source n'est renvoyé au navigateur.
- Cet indicateur mesure les pièces de retrieval **jointes** et **non les citations effectivement utilisées** dans le texte. La preuve de citation effective et le taux de cache CAG restent `NOT_INSTRUMENTED`, non simulés.
- Traduction FR/EN des statuts documentaires, du vocabulaire des tableaux et clarification du prévisualiseur de réindexation en lecture seule.


### Télémétrie de réutilisation CAG
- Le taux de réutilisation du cache CAG est maintenant **mesuré sur les événements applicatifs existants** `ApiLog.metadata.cagCacheHit` : nombre de `true` (réutilisation) / `false` (recalcul) sur les quatre routes de chat/agent. Une absence d'observations ou une panne de lecture ne devient jamais un faux taux nul.
- Le panneau explique que le cache CAG est **en mémoire et local à l'instance** ; cet indicateur ne certifie pas un cache global ni les citations effectivement utilisées dans les réponses.
- Le comptage reste strictement agrégé sur une période et n'expose aucune conversation ou métadonnée de compte.
