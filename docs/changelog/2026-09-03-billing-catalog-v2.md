## 2026-09-03 — Billing Catalog v2

### Ajouté

- Nouvelle page publique **Tarifs** alimentée par le catalogue commercial canonique de DTSC Platform.
- Release commerciale versionnée `2026.09` avec révision calculée à partir des offres administrées réellement publiées.
- API de catalogue et contexte IA communs pour éviter les grilles de prix parallèles entre site public, Abonnement, Console DTSC et assistants.

### Modifié

- **Organisation Essentielle** devient le vrai socle « structurer et collaborer » : administration entreprise de base, calendrier, appels collaboratifs et IA Assistant Entreprise en lecture/analyse à partir d’un abonnement Essentiel actif.
- **Organisation Croissance** porte le périmètre « gérer et automatiser » et autorise la préparation d’actions IA lorsque les permissions et contrôles métier l’autorisent.
- **Organisation Premium** porte le périmètre « piloter, comptabiliser et sectorialiser » avec les capacités Entreprise, sectorielles et agentiques avancées autorisées.
- Le chatbot général connecté reçoit le catalogue publié tout en restant isolé des données ERP de l’entreprise.
- L’assistant du site public peut expliquer les tarifs d’abonnement DTSC Platform depuis le catalogue courant, sans les confondre avec un devis de prestation.

### Corrigé

- Le quota de **sources de connaissance IA** ne remplace plus la limite de **documents métier ERP** dans les entitlements organisation.
- Les libellés de `/billing` et de la Console distinguent maintenant sources IA, documents métier et stockage.
- Les capacités d’appels et de calendrier du niveau Essentiel sont désormais cohérentes avec les fonctionnalités réellement incluses commercialement.
- Le CAG commercial utilise la `releaseId` comme version de cache afin qu’une nouvelle révision du catalogue ne reste pas servie sous une ancienne clé.

### Sécurisé

- Le mode Agent de l’IA Entreprise borne les modes outils selon l’offre : Essentielle en `READ`, Croissance en `READ + PREPARE`, Premium en `READ + PREPARE + MUTATE`.
- Ces plafonds n’accordent aucun droit supplémentaire : membership, tenant, module, secteur, permission, Tool Gateway, classifications sensibles et confirmations restent opposables.
- Si le catalogue public ne peut pas être résolu, l’assistant public s’abstient de donner un prix d’abonnement au lieu d’inventer une valeur.

### Qualité

- Ajout de la gate `qa-billing-catalog-v2-checks.mjs`, intégrée à la régression canonique, pour vérifier le catalogue partagé, les limites distinctes, les entitlements Essentiel, les surfaces publiques/privées et les modes outils IA par package.
