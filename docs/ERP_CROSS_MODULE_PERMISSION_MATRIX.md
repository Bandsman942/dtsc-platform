# Matrice de permissions inter-modules

La décision est serveur : session globale + membership actif + rôle entreprise + poste + permission + module/plan + relation à l’objet + statut + sensibilité.

| Capacité | Lecture API | Mutation API | Frontend |
|---|---|---|---|
| `canCreate` | calculée serveur | permission `create` | affiche ou masque |
| `canUpdate` | état + révision | permission `update` | ne sécurise pas seul |
| `canSubmit` | auteur/acteur | transition service | bouton contextuel |
| `canApprove` | séparation des tâches | permission `approve` | jamais auto-approbation |
| `canReject` | validateur | transition auditée | motif obligatoire |
| `canRequestCorrection` | acteur autorisé | transition auditée | conserve commentaires |
| `canViewSensitive` | classification | permission sensible | contenu générique sinon |
| `canDownload` | document + objet lié | contrôle au téléchargement | URL non publique |

Une relation active avec une entreprise n’accorde automatiquement aucun accès Finance, RH, Health, Pharmacy, projet ou document. La révocation retire les accès dérivés lors de la prochaine résolution serveur.
