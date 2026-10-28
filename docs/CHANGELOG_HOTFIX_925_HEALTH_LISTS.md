# Hotfix UX-02 — Listes Health et ventes Pharmacie (travail lié à #925)

Statut : **travail en PR brouillon, non fusionné**. Les E2E propriétaires, la CI et la certification des autres listes sectorielles restent ouverts.

## Correctifs livrés sur branche

- Le registre Patients envoie tous ses filtres (recherche, sexe, statut et dates) au serveur, qui retourne une page bornée et les totaux réels. Les résultats au-delà des 300 premiers patients sont accessibles sans chargement d'une liste entière.
- La permission Health et le masquage des données sensibles restent appliqués côté serveur.
- La recherche des Assurances est reliée au véritable état de liste, avec compteur des résultats filtrés et message explicite sans résultat.
- L'API Pharmacie des ventes accepte `page`, `pageSize` (maximum 100), `q` et `view` ; elle filtre côté SQL les onglets jour, validations, remboursements, sorties exceptionnelles, reçus et anomalies. Le workspace conserve les filtres et utilise la pagination serveur ; les recherches sont temporisées et les chargements concurrents annulables.
- Les KPI globaux ne dépendent plus de la page affichée : comptages et sommes sont réalisés par des agrégats et compteurs SQL, les montants étant exprimés dans la devise comptable de base (`totalAmountBase`) plutôt qu'une addition de devises différentes.
- Les mouvements de ventes exposent explicitement leur périmètre : les 100 derniers mouvements seulement. Ils ne sont plus présentés comme un historique complet.
- Correctifs de cohérence métier imposés par le contrôle sectoriel #670 : la date initiale d'une demande d'assurance suit le jour civil du navigateur plutôt qu'une date UTC susceptible de décaler le jour affiché ; aucune devise USD n'est inventée en l'absence de configuration. Le formulaire de vente Pharmacie se bloque avec un message explicite lorsque sa devise n'est pas définie.

## À compléter avant fusion

- Historique complet des mouvements Pharmacie : nécessite une pagination serveur dédiée sur le module Mouvements (actuellement limité aux 100 dernières entrées dans la vue Ventes). Ne pas annoncer un historique intégral à l'utilisateur.
- Les catalogues de produits, lots et ordonnances chargés pour le formulaire de vente doivent faire l'objet d'une recherche serveur dédiée si leur volume réel dépasse la plage d'usage prévue. Le présent hotfix cible la pagination des **ventes**.
- Validation métier des KPI `totalAmountBase` sur les ventes historiques antérieures au système multidevise : vérifier que leurs montants de base ont été correctement migrés ; aucun recalcul automatique ni écriture financière de migration n'est entrepris ici.
- La date par défaut Assurance Santé suit actuellement le fuseau du navigateur ; le fuseau de l'organisation doit être transmis explicitement par la route sectorielle avant de pouvoir garantir le jour métier lorsque l'utilisateur voyage dans un autre fuseau.
- Vérifications E2E propriétaire : recherche au-delà du 300e patient, pagination et changement de filtres, enregistrements Health sensibles, erreurs HTTP, historique Pharmacie volumineux, écrans mobiles et FR/EN.
- CI complète, type-check, build et rollback confirmés. Aucun déploiement permis avant validation.

Pas de migration Prisma ni changement de droits. La forme de réponse GET est enrichie d'un objet `pagination`, l'ancien chargement de tout l'historique n'est plus pris en charge. Rollback par revert de la PR.
