# Console sécurité, audit, API et webhooks

Les journaux sont paginés par source, période, acteur, organisation, résultat, fournisseur et request ID. Les métadonnées sont redacted avant affichage.

Les payloads ne doivent jamais révéler token, OTP, mot de passe, secret, clé API, carte ou contenu médical complet. Le retry webhook est réservé, confirmé, borné à cinq tentatives et refusé après application. MaishaPay utilise `(provider, idempotencyKey)` pour empêcher la double application.

Les exports audit sont autorisés, bornés et eux-mêmes audités. La politique de rétention suit les paramètres de plateforme et les exigences légales applicables.
