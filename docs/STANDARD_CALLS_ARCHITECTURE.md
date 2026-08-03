# Architecture des appels audio et vidéo

## Média et signaling

DTSC réutilise LiveKit pour la salle, le signaling et le média WebRTC. Les identifiants de salle sont construits côté serveur. Les tokens sont temporaires, liés à l’utilisateur et à l’appel, et ne sont jamais logués ni exposés avant autorisation.

## Disponibilité

Les boutons et routes d’appel ne sont actifs que si les variables LiveKit sont configurées, si le plan autorise la collaboration, si le navigateur est compatible et si l’utilisateur est participant actif non bloqué.

## Circuit

Création serveur → participants invités → événement `RINGING` → acceptation ou refus → token temporaire → connexion média → événements persistés → fin/annulation/appel manqué → historique.

## STUN/TURN

La topologie STUN/TURN est fournie par le déploiement LiveKit configuré. L’application ne prétend pas disposer d’un TURN lorsque la configuration fournisseur n’est pas disponible.

## Appels de groupe

Ils utilisent la même salle et le même modèle de participants. Ils ne sont présentés que lorsque le fournisseur est configuré. La capacité maximale reste celle du plan et du fournisseur ; elle doit être surveillée en Production.
