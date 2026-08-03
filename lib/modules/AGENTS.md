# AGENTS.md — Modules standards DTSC

Ces règles s’appliquent au registre, à la navigation, aux accès, aux liens profonds et à toute nouvelle surface non ERP.

1. Tout module standard doit être enregistré dans `standard-module-registry-data.json` avant d’être visible.
2. Le statut technique et la maturité commerciale restent deux décisions distinctes.
3. `COMMERCIAL_READY` exige une validation explicite du propriétaire après Production et E2E manuels.
4. Aucune route canonique ne peut être dupliquée, sauf shell partagé explicitement documenté et audité.
5. Aucun module `ACTIVE` ou `BETA` ne peut exposer un bouton mort ou une route inexistante.
6. Les URL multidomaines utilisent exclusivement les résolveurs centraux de `lib/domains.ts`.
7. Les permissions et capacités sont vérifiées côté serveur avant toute lecture ou mutation sensible.
8. Le frontend utilise les capacités comme indications d’affichage, jamais comme autorité de sécurité.
9. Un module standard ne recrée aucune source ERP ; il consomme les interfaces publiques et déclare `erpDependencies`.
10. Chaque module professionnel possède un guide exact, accessible et relié dans le registre.
11. Les KPIs, tabs, filtres et actions secondaires restent scrollables horizontalement sur mobile.
12. Les notifications et liens ouvrent l’objet précis et la section pertinente après contrôle d’accès.
13. Les fonctions PWA et Web Push reflètent la configuration serveur réelle ; aucun état fictivement « configuré ».
14. Les migrations restent additives, non destructives et compatibles base vide/base existante.
15. Les QA historiques ne sont jamais supprimées, affaiblies ou contournées pour obtenir un résultat vert.
16. Les E2E manuels ne sont jamais déclarés réussis sans confirmation explicite du propriétaire.
17. Seul `main` déclenche la Production ; aucun déploiement manuel d’une branche feature.
18. Chaque itération produit un rapport de clôture, une checklist E2E et un changelog honnêtes.
19. Les modules `PLANNED`, `HIDDEN` et `RETIRED` ne sont jamais présentés comme utilisables.
20. Une promotion de maturité doit modifier le registre, les preuves QA, la documentation et les tests dans la même PR.
21. Les aliases ne doivent jamais entrer en conflit avec un code canonique ou un autre alias.
22. Toute dépendance standard ou ERP est explicite, stable et vérifiée avant activation.
23. Les reason codes d’accès sont stables, documentés et n’exposent aucune donnée protégée.
24. Une surface Console, Support, Account ou Public conserve sa frontière de host et son contrat de retour sécurisé.
25. Le Dashboard n’affiche que des données réelles, autorisées et obtenues depuis l’agrégateur canonique de l’espace personnel.
26. Tout changement de contexte exige une vérification serveur du compte, du membership, de l’organisation et de la session.
27. Un accès révoqué ne reste jamais sélectionnable et toute route cible revérifie les droits actuels.
28. Le contexte personnel, DTSC interne et organisation cliente reste distinct dans les données, la navigation et les libellés.
29. Les plans et leurs prix proviennent du catalogue canonique ; aucun composant n’invente une offre locale.
30. Les fonctions et modules affichés correspondent aux entitlements et limites réellement appliqués côté serveur.
31. Les factures SaaS, paiements SaaS et périodes d’abonnement restent distincts de la facturation et de la comptabilité ERP.
32. Aucune préférence visible ne peut être fictive : elle doit être persistée, relue et appliquée.
33. Une session révoquée doit cesser réellement de fonctionner ; aucune suppression visuelle ne vaut révocation serveur.
34. Tant qu’aucun registre persistant n’existe, les sessions multi-appareils ne sont ni listées ni présentées comme révocables.
35. Toute notification actionnable possède un lien profond interne vers l’objet précis lorsqu’il est connu.
36. Un lien de notification ne contourne jamais une permission, un membership, un entitlement ou la propriété de l’objet.
37. Les notifications sont recherchées et paginées côté serveur ; l’historique complet n’est jamais chargé à chaque rendu.
38. Les invitations entreprise restent visibles depuis le compte personnel avant l’adhésion à l’organisation.
39. L’acceptation d’une invitation est idempotente et ne crée aucun membership ni effet secondaire dupliqué.
40. Les relations avec les entreprises utilisent exclusivement le moteur canonique d’identité, consentement et révocation.
41. Les données du profil sont privées par défaut et les changements d’identifiant principal exigent le circuit de sécurité prévu.
42. Web Push reflète conjointement l’état du navigateur, la configuration serveur, la préférence et la souscription de l’appareil.
43. Les guides utilisateur décrivent uniquement les fonctions réellement déployées et restent accessibles depuis chaque module traité.
44. Les E2E manuels de l’itération 2 restent `NON_EXÉCUTÉ` jusqu’à validation explicite du propriétaire.

## Collaboration professionnelle — itération 03

45. Toute conversation possède un contexte explicite ; connaître son identifiant ne donne jamais accès à son contenu.
46. Les conversations directes sont résolues de manière idempotente dans un même contexte.
47. Tout message pouvant être rejoué possède une clé d’idempotence stable et les réponses restent dans la même conversation.
48. Les permissions sont revérifiées à chaque mutation ; un participant retiré perd immédiatement l’accès.
49. Chaque groupe possède un propriétaire explicite qui transfère la propriété avant de quitter.
50. Réactions et mentions sont dédupliquées ; une mention cible uniquement un participant autorisé.
51. Toute pièce jointe utilise un upload réel contrôlé, un stockage privé et une URL signée temporaire.
52. Les images s’ouvrent dans la visionneuse commune sans étirement ni perte de ratio.
53. Les commentaires utilisent le contrat commun de pagination, masquage, suppression logique, restauration et lien profond.
54. La présence doit refléter un signal réel et expirer après l’absence de heartbeat ; une session existante ne suffit pas.
55. Les indicateurs de lecture ne sont jamais inventés et proviennent uniquement des lectures persistées.
56. Toute synchronisation ou canal temps réel revérifie l’autorisation et la reconnexion ne crée aucun doublon.
57. Un bouton d’appel n’apparaît pas sans infrastructure disponible ; les tokens d’appel sont temporaires et liés à l’utilisateur et à l’appel.
58. Les états d’appel et la durée sont décidés côté serveur ; un appel manqué suit un timeout explicite.
59. Toute annonce possède une audience explicite calculée côté serveur et utilise les notifications canoniques.
60. Toute notification collaborative possède un lien profond vers l’objet précis et une clé de déduplication.
61. Les actions de modération sont auditées et un administrateur de groupe n’est pas modérateur global.
62. Les listes de messages, commentaires, annonces et historiques d’appel sont bornées et paginées.
63. Les conversations, appels, galeries et commentaires restent utilisables à 320 px, clavier mobile ouvert compris.
64. Les guides décrivent uniquement les fonctions réellement déployées.
65. Aucun module de cette itération n’est promu automatiquement vers `COMMERCIAL_READY`.
