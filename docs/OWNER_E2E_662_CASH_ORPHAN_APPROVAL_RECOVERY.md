# OWNER_E2E #662 — récupération des caisses sans validateur

Statut avant confirmation propriétaire : **NOT_EXECUTED**

Ce parcours manuel complète les preuves automatiques. Il vérifie sur une vraie surface DTSC qu'une caisse historique déjà en attente d'approbation, mais créée avant l'affectation obligatoire d'un validateur, peut être récupérée sans modifier son comptage ni contourner la séparation des rôles.

## Préconditions

- utiliser une entreprise cliente où le module **Caisse** est actif ;
- disposer d'un utilisateur ayant le droit de gérer la Caisse ;
- disposer d'un second utilisateur réellement autorisé à approuver **FINANCE_CASH** ;
- utiliser de préférence une caisse historique `PENDING_VALIDATION` sans validation affectée, par exemple une ancienne caisse USD/CDF issue du parcours Mobile Money/Télécom ;
- ne jamais corriger son statut directement en base pour ce test.

## A. Récupérer une caisse historique orpheline

1. Ouvrir le module qui affiche la caisse en attente. Depuis Mobile Money/Télécom, utiliser **Gérer la validation** ; sinon ouvrir directement **Caisse**.
2. Ouvrir le détail de la session `PENDING_VALIDATION`.
3. Vérifier que l'interface indique qu'aucun validateur n'est encore affecté et propose **Affecter un validateur** uniquement à un gestionnaire autorisé.
4. Ouvrir l'affectation et vérifier que la liste ne contient que des validateurs Finance Caisse autorisés de la même entreprise.
5. Choisir un validateur différent du caissier lorsque la politique l'exige et confirmer.
6. Vérifier le message de succès et l'état « en attente du validateur affecté ».
7. Vérifier que le montant théorique, le montant compté, l'écart, le motif et le détail des coupures sont strictement inchangés.
8. Vérifier qu'un autre gérant non affecté ne peut pas prendre la décision de validation.

Résultat attendu : une validation canonique est créée pour la session existante ; aucune donnée de comptage n'est réécrite.

## B. Décider la clôture avec le validateur affecté

1. Se connecter avec le validateur sélectionné.
2. Vérifier la notification de validation et/ou la présence de la clôture dans **Validations**.
3. Ouvrir la clôture ; vérifier que le libellé reste métier et n'expose ni UUID, ni nom Prisma, ni `EnterpriseCashSession`.
4. Approuver la clôture.
5. Vérifier que la caisse passe à **Clôturée**.
6. Revenir avec le caissier ou un gestionnaire autorisé et ouvrir une nouvelle session sur le **même compte de caisse**.

Résultat attendu : la nouvelle session peut être ouverte ; l'ancienne caisse n'est plus un verrou opérationnel.

Pour le rejet, refaire le scénario sur une autre caisse : le motif doit être obligatoire et la caisse doit suivre le workflow de correction prévu sans décision silencieuse.

## C. Nouvelle clôture journalière Shop

1. Ouvrir **Fin de journée** dans un Shop avec une caisse ouverte.
2. Sélectionner au moins une ligne de type caisse.
3. Vérifier qu'un champ **Validation indépendante des caisses** est présent.
4. Tenter de soumettre une clôture cash sans validateur : la soumission doit être refusée avec un message métier.
5. Sélectionner un validateur Finance autorisé puis soumettre.
6. Vérifier que chaque caisse cash concernée passe en attente avec un validateur réellement affecté.
7. Avec un autre gérant non affecté, vérifier que les boutons Approver/Rejeter ne sont pas proposés pour cette caisse.
8. Avec le validateur affecté, vérifier que la décision fonctionne normalement.

Résultat attendu : aucune nouvelle caisse ne peut entrer en `PENDING_VALIDATION` sans validation affectée.

## D. Responsive, thèmes et accessibilité

Exécuter les parcours touchés aux largeurs :

- 320 px ;
- 360 px ;
- 375 px ;
- 390 px ;
- 414 px ;
- 768 px ;
- 1024 px.

Contrôler également :

- FR puis EN ;
- mode clair puis mode sombre ;
- navigation clavier et focus visible ;
- ouverture/fermeture des dialogs avec clavier mobile ;
- aucun débordement horizontal global ;
- boutons et listes de validateurs tactiles ;
- noms/postes longs sans casser la mise en page ;
- aucun code backend, UUID ou reason code présenté comme langage client.

## E. Confirmation propriétaire

Après validation complète, répondre dans la conversation :

`E2E #662 bon`

Cette phrase constitue la preuve **OWNER_E2E**. Tant qu'elle n'est pas fournie explicitement, la PR #662 reste non fusionnable même si les contrôles automatiques sont verts.
