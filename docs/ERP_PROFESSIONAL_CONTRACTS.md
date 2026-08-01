# Contrats professionnels — Itération 2

`CONTRACTS` réutilise le moteur existant et ajoute une interface dédiée de création, consultation, modification et cycle de vie.

Transitions serveur : brouillon → soumission → approbation ou retour en correction → activation → suspension, renouvellement, résiliation ou archivage. Le frontend ne modifie jamais directement le statut.

Chaque contrat référence un tiers, un responsable, une période, une valeur, une devise, un mode de renouvellement, un préavis et, lorsque nécessaire, un approbateur. Les actions utilisent une révision optimiste et sont auditées. Les notifications ouvrent le contrat et la section attendue.

Les documents contractuels restent gérés par le module documentaire commun ; le contrat conserve les liens métier sans introduire un second stockage.
