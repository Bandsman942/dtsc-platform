# Hotfix UX-02 — Listes Health (travail lié à #925)

Statut : **travail partiel en PR brouillon**. La certification Pharmacy et les E2E restent ouverts.

## Correctifs livrés sur branche

- Le registre Patients envoie tous ses filtres (recherche, sexe, statut et dates) au serveur, qui retourne une page bornée et les totaux réels. Les résultats au-delà des 300 premiers patients sont accessibles sans chargement d'une liste entière.
- La permission Health et le masquage des données sensibles restent appliqués côté serveur.
- La recherche des Assurances est reliée au véritable état de liste, avec compteur des résultats filtrés et message explicite sans résultat.

## À compléter avant fusion

- Reprise des données de ventes Pharmacie : les ventes, leurs agrégats, les mouvements et les vues par statut doivent être paginés sans rendre les KPI incomplets. Le `getSalesDataset` actuel lit encore l'historique entier ; **ce point n'est pas résolu**.
- Vérifications E2E propriétaire : recherche au-delà du 300e patient, pagination et changement de filtres, enregistrements Health sensibles, erreurs HTTP, historique Pharmacie volumineux, écrans mobiles et FR/EN.
- CI complète, type-check, build et rollback confirmés. Aucun déploiement permis avant validation.

Pas de migration Prisma ni changement de droits. Rollback par revert de la PR.
