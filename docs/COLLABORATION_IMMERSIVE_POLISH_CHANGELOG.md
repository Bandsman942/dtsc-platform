# Collaboration — finition immersive du 30 juillet 2026

## Amélioré

- `Mes Collaborateurs` utilise un shell conversationnel mobile immersif : le document ne scrolle plus verticalement et le fil/la liste gardent leur propre scroll interne.
- Le viewport suit `VisualViewport` et l'état du chrome mobile DTSC afin d'occuper tout l'espace libéré lorsque les navigations haute/basse disparaissent.
- Les bulles des interlocuteurs retrouvent des accents de couleur stables et déterministes, tout en préservant le thème DTSC.
- Le composer texte est désormais multiligne et auto-extensible ; `Entrée` crée une nouvelle ligne, tandis que l'envoi reste explicite.

## Corrigé

- Les MIME `MediaRecorder` avec paramètres, notamment `audio/webm;codecs=opus`, sont normalisés avant validation serveur afin d'éviter le rejet de vocaux valides.
- La lecture des vocaux bénéficie d'URLs signées suffisamment longues pour permettre l'écoute sans dépendre d'une URL publique.

## Ajouté

- `CollaborationVoiceSetting` et sa migration additive permettent de configurer côté serveur l'activation des vocaux, la durée maximale, la taille maximale et le rate limit horaire.
- API authentifiée de capacités vocales pour le composer.
- API `ADMIN` protégée pour lire et modifier les paramètres vocaux, avec Zod, same-origin, rate limit, AuditLog et ApiLog.

## CI/CD

- Aucun changement Vercel Preview.
- Livraison prévue uniquement après Quality Gates, review, merge `main` et Production Vercel unique depuis `main`.
