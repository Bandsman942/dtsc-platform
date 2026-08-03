# Inventaire des guides utilisateurs des modules standards

## État initial

Le registre canonique porte `userGuidePath` pour chaque module. À l’issue de l’itération 1, la majorité des modules standards ne possède pas encore de guide exact versionné. Cet état est volontairement visible dans l’audit et n’est pas transformé artificiellement en réussite.

## Priorités des itérations suivantes

1. Compte, authentification, profil, paramètres et abonnement.
2. Notifications, annonces, support, calendrier et collaboration.
3. Activités entreprise, tâches, demandes, validations, réunions et workflows.
4. Documents, rapports et assistant IA entreprise.
5. Administration entreprise et audit.
6. Activités et fonctions internes DTSC.
7. Console DTSC.
8. Site public, contenus, ressources et formulaires publics.

## Règle de promotion

Un module ne peut pas être promu vers `PROFESSIONAL_READY` ou `COMMERCIAL_READY` dans une itération future si son guide ne décrit pas exactement les fonctionnalités réellement déployées. L’audit accepte l’absence comme écart initial, mais refuse un chemin déclaré vers un fichier inexistant.
