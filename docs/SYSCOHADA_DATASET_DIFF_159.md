# SYSCOHADA — comparaison de datasets canoniques

Programme parent : #147
Itération : #149
Sous-livraison : #159

Le pipeline fournit un diff machine-readable pour comparer deux datasets structurés avant une évolution de version :

`node scripts/accounting/diff-syscohada-datasets.mjs --previous <dataset-N.json> --next <dataset-N+1.json>`

Un fichier JSON peut être produit avec `--out <diff.json>`.

Le diff normalise d’abord les deux datasets puis retourne :

- version précédente et version suivante ;
- changement de framework/template ;
- changement de scope ;
- changement de fichier source ;
- groupes ajoutés, retirés ou modifiés ;
- comptes ajoutés, retirés ou modifiés ;
- `hasChanges` pour indiquer si une différence matérielle existe.

Une entrée `changed` contient les représentations `before` et `after` afin que la revue humaine puisse qualifier l’impact.

Ce diff n’applique aucune migration et ne modifie aucune organisation. Le workflow de migration d’un plan déjà adopté appartient à l’itération 8 (#155). Dans #159, le diff sert uniquement à rendre la construction et la revue du dataset réglementaire explicables et reproductibles.
