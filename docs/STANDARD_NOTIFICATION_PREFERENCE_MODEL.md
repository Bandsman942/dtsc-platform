# Modèle des préférences de notification

## Canaux

Les préférences utilisateur couvrent les notifications internes, e-mail et Web Push selon les catégories réellement supportées.

## Web Push

L’état résulte de quatre sources :

- support du navigateur ;
- permission navigateur ;
- configuration VAPID côté serveur ;
- `PushSubscription` de l’appareil et préférence utilisateur.

Un utilisateur peut posséder plusieurs souscriptions. La révocation d’un appareil ne désactive pas automatiquement les autres.

## Synchronisation

Les paramètres du compte sont persistés côté serveur, relus au chargement et appliqués dans les composants PWA et notification. Aucun switch ne doit être rendu sans effet réel.

## Confidentialité

Les payloads Push contiennent uniquement le titre, un résumé non sensible et une URL interne sûre. Les secrets, tokens, données médicales, financières ou juridiques détaillées sont exclus.

## Échecs

Les erreurs navigateur ou serveur sont présentées comme non supporté, non configuré, permission refusée, actif, révoqué ou erreur selon la situation observée.
