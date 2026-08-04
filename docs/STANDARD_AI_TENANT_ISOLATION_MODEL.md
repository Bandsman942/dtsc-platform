# Modèle d’isolation multi-tenant IA

L’isolation s’applique aux conversations, messages, préférences, fichiers, sources, fragments, embeddings, recherches, outils, usages, coûts, feedback, exports et caches.

Toute requête organisationnelle vérifie session, `organizationId`, membership actif, assistant de l’organisation, module, entitlement et permission. Les recherches SQL vectorielles incluent explicitement `organizationId` et les niveaux de confidentialité autorisés.

Les conversations personnelles restent bornées à `userId` et au contexte actif. Les appels modèle enregistrent l’organisation uniquement lorsqu’elle est autorisée. Les logs ne contiennent pas le contenu sensible complet par défaut.
