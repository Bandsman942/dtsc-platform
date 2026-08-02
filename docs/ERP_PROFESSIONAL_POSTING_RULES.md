# Règles de comptabilisation professionnelles

## Principe

Les opérations métier validées sont converties en écritures par le moteur comptable unique. Une règle associe un événement source à des comptes, un journal, des dimensions et une date d’effet.

## Résolution

La résolution tient compte de :

- l’entreprise ;
- l’événement métier ;
- le type et l’identifiant de la source ;
- la version de posting ;
- les mappings actifs à la date de l’opération ;
- la période comptable ;
- la devise fonctionnelle ;
- les comptes actifs.

## Idempotence

La clé stable combine l’entreprise, la source, l’événement et la version. Un double clic, un retry ou une reprise de worker retrouve le lot existant au lieu de créer une seconde écriture.

## Anomalies

La vue Anomalies expose les lots en échec sans divulguer de données sensibles complètes. Les causes possibles incluent : règle absente, compte manquant, période fermée, devise incohérente, source invalide ou événement déjà comptabilisé.

Toute correction d’une règle déjà utilisée doit passer par une nouvelle période d’effet ou une nouvelle version. Les historiques ne sont jamais recalculés silencieusement.
