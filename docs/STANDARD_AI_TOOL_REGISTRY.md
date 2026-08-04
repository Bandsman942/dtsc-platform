# Registre canonique des outils IA

Source : `lib/ai/tool-registry.ts`.

Chaque outil définit code, clés i18n, schémas d’entrée/sortie, contextes, modules et permissions requis, plan minimal, mode `READ|PREPARE|MUTATE|SENSITIVE_MUTATE`, confirmation, idempotence et audit.

Les outils Pharmacy en lecture déjà déployés sont enregistrés sans duplication. La préparation de tâche est déclarée comme `PREPARE` : elle produit un brouillon, pas une écriture métier.

Toute mutation future doit appeler le service canonique, afficher action/objet/contexte/effets/destinataires/risques, valider les données, demander confirmation et utiliser une clé d’idempotence.
