# Synchronisation et événements de collaboration

## Source actuelle

DTSC réutilise les événements persistés des groupes et appels, le centre de notifications, Web Push et une synchronisation client bornée. Aucune seconde infrastructure temps réel n’est introduite dans cette itération.

## Catalogue

Les événements fonctionnels couvrent notamment : création/mise à jour de groupe, ajout/retrait de membre, création/édition/suppression de message, réaction, lecture, présence, sonnerie, acceptation, refus, annulation, appel manqué, fin d’appel, publication d’annonce et commentaire.

## Autorisation

Le client ne s’abonne jamais par simple identifiant. Chaque récupération revérifie la session, le contexte et la participation. Les canaux ou endpoints d’événements ne retournent que les groupes autorisés.

## Reconnexion

Les messages utilisent une clé `clientMessageId` stable. Après reconnexion, le client recharge un curseur serveur, remplace son état optimiste et ne recrée pas le message. Les compteurs non lus sont recalculés depuis les lectures persistées.

## Ordre

L’ordre canonique utilise `createdAt` serveur et les curseurs d’identifiants. L’heure locale du navigateur n’est pas une autorité.

## Limitation documentée

La synchronisation de secours reste un polling visible et borné. Une migration future vers un transport push unique devra conserver les mêmes contrôles d’accès, curseurs et clés d’idempotence.
