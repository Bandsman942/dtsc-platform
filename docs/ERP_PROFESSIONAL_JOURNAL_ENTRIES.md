# Écritures comptables professionnelles

## Création

Une écriture manuelle contient un journal, une période, une date comptable, une référence, un libellé, une devise fonctionnelle et au moins deux lignes.

Le formulaire de l’itération 5 propose un parcours simple débit/crédit équilibré. Le serveur reste l’autorité et refuse toute écriture dont la somme des débits diffère de la somme des crédits.

## Workflow

`Brouillon → Soumis → Approuvé → Comptabilisé`

Un validateur peut refuser une écriture soumise avec un motif. Le préparateur, l’approbateur et l’acteur de contrepassation sont séparés selon la politique Finance.

## Immutabilité

Après comptabilisation :

- aucune ligne n’est modifiée ;
- aucun compte n’est remplacé ;
- aucun montant n’est réécrit ;
- la correction passe par une contrepassation ou une nouvelle écriture.

## Contrepassation

L’utilisateur autorisé choisit une date appartenant à une période ouverte ou provisoirement fermée et saisit un motif. Le système crée une nouvelle écriture avec les débits et crédits inversés, relie les deux écritures et conserve l’original.

La relance de la même action ne doit pas créer une seconde contrepassation.
