# IA Assistant Entreprise - Secteur Pharmacie

## Portée

Pour une organisation `PHARMACY`, l'IA Assistant Entreprise utilise le contexte métier pharmacie et des outils backend en lecture. Il aide à analyser la situation, prioriser les risques et préparer des brouillons d'action sans exécuter directement les workflows sensibles.

## Contexte CAG pharmacie

Le contexte contrôlé inclut:

- paramètres pharmacie actifs: général, FEFO, alertes, caisse, documents, qualité;
- modules entreprise activés;
- nombre de collaborateurs actifs;
- règles métier de sécurité.

Règles critiques:

- FEFO obligatoire pour les recommandations sur lots;
- exclusion des lots expirés, rappelés, en quarantaine ou bloqués;
- aucune vente, sortie de stock, clôture de caisse, commande, validation ou incident qualité n'est exécuté par le chat;
- toute action métier reste une proposition à confirmer par un humain dans le module dédié.

## Outils backend en lecture

Les outils actuels sont:

- `pharmacy.dashboard.summary`: synthèse produits, lots, alertes, qualité et documents;
- `pharmacy.stock.low`: produits sous ou au seuil minimal;
- `pharmacy.batches.expiring`: lots proches de péremption;
- `pharmacy.alerts.open`: alertes ouvertes;
- `pharmacy.sales.today`: ventes du jour;
- `pharmacy.cash.sessions`: sessions de caisse ouvertes ou en validation;
- `pharmacy.purchases.open`: commandes fournisseur ouvertes;
- `pharmacy.quality.open`: incidents qualité ouverts;
- `pharmacy.documents.summary`: documents expirés, à renouveler ou à vérifier.

Chaque outil filtre systématiquement par `organizationId` et ne renvoie que des synthèses ou listes limitées.

## RAG pharmacie

Les sources IA peuvent être associées au secteur `PHARMACY` et à un `moduleCode` optionnel. La récupération vectorielle filtre:

- `organizationId`;
- `status = READY`;
- `archivedAt = null`;
- niveau de confidentialité autorisé;
- secteur ou module lorsque fourni.

Les citations affichent le titre de la source et le niveau de confidentialité.

## QA minimale

- Un membre d'une autre entreprise ne peut pas appeler les routes IA avec cet `organizationId`.
- Un membre sans accès au module `AI_ASSISTANT` reçoit `403`.
- Les sources archivées ne sont plus utilisées par le RAG.
- Un membre non responsable ne voit que les sources `PUBLIC` et `INTERNAL` dans le contexte RAG.
- Les outils pharmacie ne modifient aucune table métier.
- Les recommandations sur lots respectent FEFO et excluent les lots non vendables.
