# Modèle d’usage et de coût IA

`AiModelCall` enregistre fournisseur, modèle, tâche, contexte, stratégie, fallback, statut, tokens, latence premier token, durée, coût estimé, devise, type de coût, erreur et métadonnées non sensibles.

`lib/ai/costs.ts` calcule un coût seulement si le catalogue fournit des tarifs d’entrée et de sortie. Les valeurs sont distinguées : `EXACT`, `ESTIMATED`, `UNKNOWN`. Le système ne transforme plus une absence de tarif en coût zéro.

Les agrégats existants de consommation personnelle et entreprise restent en place. Un fallback produit plusieurs tentatives observables, mais les quotas fonctionnels ne doivent compter qu’une réponse utilisateur selon le contrat du domaine.
