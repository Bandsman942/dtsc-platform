# Paramètres plateforme et feature flags

Les paramètres globaux sont typés par le schéma serveur. Toute modification exige une capacité forte, un motif et crée `PlatformSettingHistory` avec avant/après, environnement, effet et request ID.

Les feature flags définissent code, descriptions FR/EN, statut, audience, environnement, pourcentage, organisations, utilisateurs, période et propriétaire. Le pourcentage est contraint entre 0 et 100.

Aucune valeur complète de secret n’est affichée. Une surface de secret doit seulement indiquer `CONFIGURÉ`, `NON CONFIGURÉ`, `INVALIDE` ou `EXPIRANT`.
