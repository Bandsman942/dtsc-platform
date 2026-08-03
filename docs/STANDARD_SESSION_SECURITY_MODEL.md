# Modèle de sécurité des sessions

## Architecture actuelle

DTSC utilise un cookie HTTP-only contenant une session signée HMAC. La session inclut l’identité, le contexte actif, l’heure d’authentification, la dernière émission, l’expiration d’inactivité et l’expiration absolue.

## Renouvellement

Une activité autorisée peut renouveler la fenêtre d’inactivité sans dépasser l’expiration absolue. Le cookie partagé est limité au domaine d’authentification configuré et utilise `SameSite=Lax`, `Secure` en Production et un chemin global.

## Changement de contexte

Le changement de contexte renouvelle le cookie uniquement après vérification same-origin, rate limit, utilisateur actif, membership et organisation disponible. L’événement est audité.

## Déconnexion

La déconnexion expire le cookie host-only et le cookie partagé lorsqu’un domaine commun est configuré.

## Limite assumée

Le système ne possède pas encore de registre serveur de toutes les sessions et appareils. L’interface affiche donc uniquement la session actuelle et ne prétend pas révoquer individuellement d’autres appareils. Une future gestion multi-session exigera un modèle persistant, des identifiants de session, une révocation serveur et des tests d’usage après révocation.
