# OWNER_E2E — Hotfix #659 caisse, guides et langage commercial

Issue : #659
Branche : `fix/659-cash-guides-business-presentation`

## Objectif

Valider manuellement sur le SHA final exact que la convergence de caisse, les guides canoniques et le langage commercial restent utilisables dans les parcours réels.

## Préconditions

- utiliser une entreprise avec `FINANCE_CASH` actif ;
- disposer d'un caissier autorisé à soumettre et d'un second membre autorisé à valider ;
- disposer d'une caisse USD ou CDF ouverte ;
- tester FR et EN, clair et sombre ;
- ne pas utiliser de Preview Vercel : la validation propriétaire s'effectue sur l'environnement prévu par la gouvernance DTSC.

## Parcours 1 — clôture de caisse assignée

1. Ouvrir **Caisse**.
2. Ouvrir une session de caisse existante.
3. Cliquer **Clôturer la caisse**.
4. Vérifier le comptage par coupures/quantités.
5. Vérifier le total compté et l'écart calculés automatiquement.
6. Vérifier que **Validation indépendante** liste seulement des validateurs autorisés.
7. Choisir un validateur différent du caissier.
8. Soumettre la clôture.
9. Vérifier que la session passe **En attente de validation**.
10. Vérifier que le validateur reçoit la notification et retrouve la décision dans **Validations** / Centre des actions.
11. Vérifier qu'un autre utilisateur ne peut pas décider à sa place.

Résultat attendu : aucune auto-validation implicite, aucune fuite cross-tenant, aucun identifiant technique visible.

## Parcours 2 — responsive et accessibilité

Avec le dialogue de clôture ouvert, contrôler : 320, 360, 375, 390, 414, 768 et 1024 px.

- pas de débordement horizontal global ;
- coupures et quantités lisibles ;
- sélecteur de validateur utilisable ;
- bouton de soumission accessible ;
- focus clavier visible et ordre de tabulation cohérent ;
- cibles tactiles utilisables ;
- clavier mobile ne masque pas l'action principale.

## Parcours 3 — langage commercial

Dans la File des validations, le Centre des actions et le calendrier :

- la clôture apparaît comme **Clôture de caisse / Cash close** ;
- un avoir client apparaît avec un libellé métier ;
- aucun `EnterpriseCashSession`, `EnterpriseSalesCreditNoteApproval`, `targetEntityType`, enum brute ou code Prisma n'est visible.

## Parcours 4 — guides

Ouvrir l'aide contextuelle d'un module ERP puis le centre d'aide entreprise.

Vérifier une présentation cohérente contenant :

- objectif / résumé ;
- audience ;
- capacités ;
- étapes ;
- précautions ou limitations ;
- recherche ;
- FR/EN ;
- rendu mobile correct.

Le centre d'aide et le guide contextuel doivent utiliser la même présentation canonique, sans seconde UX concurrente.

## Validation propriétaire

Statut actuel : **NOT_EXECUTED**.

Après exécution sur le SHA final exact, confirmer explicitement dans la conversation :

`E2E #659 bon`

Ne jamais transformer cette checklist en preuve automatique : la confirmation propriétaire reste obligatoire avant merge.
