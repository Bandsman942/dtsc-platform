# Modèle commun de commentaires

Les commentaires d’annonce constituent la première implémentation consolidée du contrat commun. Ils supportent création, édition dans la fenêtre autorisée, réponse, mention, réaction, signalement, suppression logique et restauration par une capacité autorisée.

La liste est bornée et paginée par curseur. Un commentaire ciblé est chargé explicitement et ouvre automatiquement le bloc replié. Fermer le bloc n’oblige pas le client à charger l’historique complet.

Un commentaire supprimé conserve un placeholder si des réponses doivent rester rattachées. Les actions de modération sont distinctes des actions de l’auteur et sont auditées.
