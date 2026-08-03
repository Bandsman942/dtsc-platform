# Contrat linguistique des modules standards

## Principe

Le français visible doit être professionnel, stable et orienté métier. Les codes techniques, noms de tables, enums bruts, clés camelCase et erreurs fournisseur restent hors de l’interface.

## Règles

- un concept conserve le même libellé dans la navigation, la page, les notifications, les guides et les exports ;
- les boutons utilisent un verbe précis ;
- les statuts sont traduits et expliqués ;
- les erreurs indiquent l’action possible sans exposer un secret ou une trace technique ;
- les confirmations nomment l’objet et la conséquence ;
- les termes anglais sont conservés uniquement pour une marque, un terme consacré ou une ambiguïté réelle ;
- les contenus FR/EN restent portés par le registre ou le système i18n existant ;
- aucun libellé planifié n’est présenté comme une fonction active.

## Exemples

- `FAILED` devient « Échec » ou une phrase métier contextualisée ;
- `permission denied` devient « Vous n’avez pas l’autorisation d’effectuer cette action » ;
- `subscription inactive` devient « L’abonnement de l’entreprise doit être actif pour ouvrir ce module ».
