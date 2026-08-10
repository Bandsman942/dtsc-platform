# Modèle d’usage et de coût IA

`AiModelCall` enregistre fournisseur, modèle, tâche, contexte, stratégie, fallback, statut, tokens, latence premier token, durée, coût estimé, devise, type de coût, erreur et métadonnées non sensibles.

`AiProviderAttempt` complète cette observation avec une ligne par tentative provider/modèle d'une même décision de routage. Les tentatives servent au diagnostic des fallbacks, de la latence et de la santé fournisseur ; elles ne constituent pas une nouvelle unité de consommation facturable et ne stockent ni prompt complet ni contenu de message.

`lib/ai/costs.ts` calcule un coût seulement si le catalogue fournit des tarifs d’entrée et de sortie. Les valeurs sont distinguées : `EXACT`, `ESTIMATED`, `UNKNOWN`. Le système ne transforme plus une absence de tarif en coût zéro.

Les agrégats existants de consommation personnelle et entreprise restent en place. Un fallback peut produire plusieurs `AiProviderAttempt`, mais les quotas fonctionnels et la facturation doivent compter selon le contrat de l'appel utilisateur, sans double comptage des tentatives techniques.

## Policy Router V2 — AI03

Le coût devient aussi un signal de routage, sans devenir une permission. `lib/ai/routing-score.ts` consomme `estimateAiCost()` sur le volume d'entrée estimé et produit `costScore` avec les autres critères de sélection.

`routingConstraints.maximumEstimatedInputCost` est un plafond strict par décision de routage :

- coût connu supérieur au plafond → candidat exclu ;
- coût inconnu avec plafond actif → candidat exclu ;
- absence de plafond → un coût inconnu reste possible si toutes les autres policies l'autorisent, mais il ne bénéficie d'aucun avantage de coût.

Le tri déterministe utilise également le coût croissant comme premier départage en cas de score égal. `preferLowerCost=false` peut neutraliser le bonus/malus de coût dans le score, mais ne neutralise jamais un plafond strict.

Pour OpenRouter, AI03 peut transmettre `provider.max_price.prompt` et `provider.max_price.completion`, exprimés en USD par million de tokens. Cette contrainte technique resserre le provider routing ; elle ne remplace ni le coût canonique DTSC, ni le plan, ni la data policy.

`selectionScore` et `selectionCriteria` sont persistés dans les métadonnées non sensibles de `AiModelCall` pour expliquer pourquoi un candidat a été retenu. Aucun prompt, message ou secret n'est ajouté pour expliquer le coût.