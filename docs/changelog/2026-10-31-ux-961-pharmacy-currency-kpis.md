# UX-02E / #961 — Protection des KPI Pharmacie en multidevise

## Audit initial — lecture seule

La branche Neon de production `dtsc-platform/production` a été contrôlée par des requêtes `SELECT` agrégées sur `PharmacySale` et `PharmacySetting` : cohérence devise de base historique / actuelle, taux non positifs, base nulle avec montant non nul, écart entre snapshot de taux et conversion arrondie à 0,02, ventes annulées et périodes.

**Résultat au 31 octobre 2026** : aucune incohérence détectée dans les lignes présentes à la date du contrôle. Le volume actuellement observé est insuffisant pour certifier tous les futurs scénarios de migration de devise. Les montants et identifiants d'organisation ne sont pas publiés dans le repository.

## Contrat applicatif

- Le total du jour et du mois est groupé côté PostgreSQL par `baseCurrency` historique, toujours dans le périmètre `organizationId` et le calendrier de l'entreprise.
- Si une devise de base enregistrée diffère de la devise principale actuelle, le montant cumulé concerné vaut `null`, jamais zéro ni une addition multidevise.
- Un taux de conversion non positif ou un montant de base nul pour une vente de montant non nul masque également le cumul de la période.
- Les nombres de ventes et autres métriques non monétaires restent disponibles ; aucune ancienne vente, facture, clôture, caisse ou écriture n'est réécrite.
- L'interface affiche « À vérifier » et un avertissement accessible en FR/EN pour les périodes concernées.

## Limites et suivi

Le contrôle courant ne prétend pas vérifier tous les écarts arithmétiques possibles ligne par ligne à chaque lecture. Un audit approfondi avec snapshots historiques et cas multidevises de grande taille reste nécessaire avant certification financière complète de #936. Une réparation des données requerrait une Issue et une validation humaine séparées, avec sauvegarde, simulation et rollback.

## QA et rollback

`node scripts/qa-ux-961-pharmacy-currency-kpis.mjs` vérifie les cas homogène, devise de base différente, devises mélangées, taux invalides et libellés FR/EN. Le retour arrière applicatif se ferait par une PR de revert sans migration ; aucune donnée n'est modifiée par le présent changement.
