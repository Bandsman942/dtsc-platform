# Guide utilisateur — Validations
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Le module **Validations** centralise les décisions sans dupliquer l’objet métier soumis. Chaque validation reste liée à sa source canonique et à ses versions de soumission.

## Consulter la file

La file présente le contexte de chaque validation, son statut et sa cible. Une validation en attente s’ouvre dans le détail : la liste ne propose plus d’action rapide permettant d’approuver ou de rejeter sans revue.

## Préparer la revue

Avant une décision finale, ouvrez la validation et préparez sa revue. Le serveur crée ou retourne la version immuable soumise avec son snapshot métier.

Le détail affiche les champs utiles du snapshot, le numéro de version et le lien vers la source. La version affichée devient la référence de la décision.

## Approuver ou rejeter

Pour **Approuver** ou **Rejeter**, le navigateur transmet l’identifiant exact de la version relue (`reviewedVersionId`). Le serveur refuse la décision si cette version ne correspond pas à la version soumise courante.

Un rejet exige un motif professionnel. Les doubles clics et retries restent protégés par l’idempotence de décision.

## Demander une correction et resoumettre

Une demande de correction exige un motif. La validation passe à l’état de correction, tandis que l’objet métier conserve son propre cycle canonique. Après modification de la source, la resoumission crée une nouvelle version immuable et remet la validation en attente.

Les versions antérieures ne sont ni écrasées ni modifiées.

## Déléguer

La délégation est autorisée uniquement vers un candidat éligible de la même organisation. Le demandeur ne peut pas devenir son propre validateur par délégation. L’éligibilité est recalculée côté serveur.

## Auto-approbation

Les politiques d’auto-approbation restent serveur-authoritative. Un rôle élevé ne constitue pas, à lui seul, une dérogation.

## Traçabilité

Le détail conserve : versions soumises, snapshots, décisions, motifs, corrections, délégations, dates et acteurs. Une décision finalisée n’est pas remplacée silencieusement.

## Accès et permissions

- Le validateur assigné prend la décision finale lorsqu’il est éligible.
- Le demandeur ou un responsable autorisé peut préparer la revue selon les règles du module.
- Les permissions sont revérifiées au moment de chaque mutation.

## Expérience guidée

Le détail utilise un éditeur adapté au mobile. Les motifs invalides sont signalés localement avec conservation de la saisie. Aucun raccourci de liste ne contourne la revue versionnée.

## Dépannage

Si le serveur demande de relire la validation, actualisez le détail, préparez de nouveau la revue et vérifiez la dernière version avant de décider.
