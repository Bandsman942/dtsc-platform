# Modèle d’usage et de coût IA

`AiModelCall` enregistre fournisseur, modèle, tâche, contexte, stratégie, fallback, statut, tokens, latence premier token, durée, coût estimé, devise, type de coût, erreur et métadonnées non sensibles.

`AiProviderAttempt` complète cette observation avec une ligne par tentative provider/modèle d'une même décision de routage. Les tentatives servent au diagnostic des fallbacks, de la latence et de la santé fournisseur ; elles ne constituent pas une nouvelle unité de consommation facturable et ne stockent ni prompt complet ni contenu de message.

`lib/ai/costs.ts` calcule un coût seulement si le catalogue fournit des tarifs d’entrée et de sortie. Les valeurs sont distinguées : `EXACT`, `ESTIMATED`, `UNKNOWN`. Le système ne transforme plus une absence de tarif en coût zéro.

Les agrégats existants de consommation personnelle et entreprise restent en place. Un fallback peut produire plusieurs `AiProviderAttempt`, mais les quotas fonctionnels et la facturation doivent compter selon le contrat de l'appel utilisateur, sans double comptage des tentatives techniques.
