## 2026-10-13 — AI-CONSOLE-04 : sources de connaissance et signaux de sécurité

### Première tranche réalisée
- L'Administration DTSC consulte les nombres de sources documentaires personnelles et d'entreprises, par statut READY/PROCESSING/FAILED et autres statuts, sur la période déjà sélectionnée.
- Les erreurs d'appels modèles `AiModelCall` et refus d'outils `AiToolExecution` sont présentés en événements agrégés bornés, avec leurs motifs, sans contenu des messages ou données clients.
- Le panneau signale explicitement le **taux de cache CAG non instrumenté** et les **alertes gouvernées non configurées**, sans simuler une santé « OK ».
- Consultation dans le Centre IA déjà protégé par `CONSOLE_AI_READ`, FR/EN et tableaux mobiles.

### Restant à réaliser dans le hotfix #804
- Indicateurs de versions d'index/réindexation, citation prouvée et retrieval si instrumentés.
- Alertes gouvernées : seuils, criticité, désactivation contrôlée, audit des changements.
- Politique de réindexation bornée avec justification, sans lancement massif en Production.
- Validation CI et OWNER_E2E avant fusion.

### Sécurité
Aucun titre de document, contenu privé, chemin de stockage, jeton, identité de tenant, argument outil ou donnée de source RAG envoyé au navigateur. Les erreurs de lecture renvoient un état indisponible, jamais un zéro inventé.
