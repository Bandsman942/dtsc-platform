# Guide utilisateur — Validations

## Rôle du module

Le module **Validations** est une file commune de décisions. Il ne remplace pas la tâche, la demande, la réunion, l'achat, le budget, la dépense ou l'objet sectoriel soumis : il conserve un lien vers cet objet et ouvre sa source.

## Consulter la file

La liste affiche les validations que vous avez demandées, celles qui vous sont attribuées et, pour les gestionnaires autorisés, celles du contexte entreprise. Utilisez les filtres disponibles pour retrouver une validation par statut ou type de source.

## Ouvrir une validation

Le détail présente :

- le demandeur et le validateur ;
- l'objet et l'identifiant source ;
- l'état de la validation ;
- la révision courante ;
- les versions de soumission ;
- les décisions enregistrées ;
- le lien vers l'objet métier.

Les documents et commentaires restent accessibles selon les permissions du module source.

## Approuver ou refuser

Seul le validateur désigné — ou l'acteur explicitement autorisé par le service métier — peut décider. L'approbation ou le refus :

1. vérifie l'état et la révision ;
2. fige ou récupère la version soumise ;
3. enregistre une décision idempotente ;
4. appelle le service canonique de l'objet source ;
5. produit l'historique et les notifications.

Un refus nécessite un motif lorsque la règle métier l'impose.

## Demander une correction

Cliquez sur **Demander une correction**, fournissez un motif précis, puis confirmez. L'objet source retourne dans un état modifiable contrôlé lorsqu'il prend en charge ce parcours. La version déjà soumise reste conservée.

Le demandeur corrige l'objet, puis utilise **Soumettre à nouveau**. Une nouvelle version de snapshot est créée ; l'ancien avis n'est pas écrasé.

## Déléguer

Un validateur ou gestionnaire autorisé peut déléguer une validation à un autre membre actif de la même entreprise. Le demandeur ne peut pas devenir son propre validateur. La délégation est historisée.

## Idempotence

Une décision possède une clé stable liée à la validation, à la version, à l'acteur et à l'action. Un double clic, un retry réseau ou une reconnexion ne doit pas produire deux décisions.

## Auto-approbation

L'auto-approbation est refusée pour les parcours qui l'interdisent, notamment les budgets et les décisions où le demandeur est aussi le validateur. Les exceptions éventuelles doivent être explicites dans le service métier, jamais ajoutées uniquement dans l'interface.

## Notifications et liens

Le validateur reçoit une notification qui ouvre la validation exacte. Le demandeur est informé d'une correction, d'un refus ou d'une approbation. À l'ouverture, l'accès est toujours revérifié.

## Limites

- Les règles d'unanimité, majorité, quorum ou parallélisme sont disponibles uniquement lorsqu'elles sont réellement définies par le moteur de workflow.
- Une décision finalisée n'est pas éditable ; une procédure métier distincte est nécessaire pour l'annuler ou la remplacer.
- Tous les types de sources ne prennent pas encore en charge le retour automatique en correction ; le module n'annonce que les parcours intégrés.
