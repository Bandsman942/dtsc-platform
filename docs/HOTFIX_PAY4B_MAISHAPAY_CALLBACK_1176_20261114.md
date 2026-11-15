# P0 PAY-4B #1176 — Signature HMAC native des webhooks MaishaPay

**Candidat v1.18.1 / PR candidate après fusion #1179, NON FUSIONNÉE. Aucun callback ni paiement Production exécuté.**

## Source primaire consultée (14 novembre 2026)

- https://docs.maishapay.net/ — section « Webhooks & Notifications » : en-tête `X-MaishaPay-Signature`, valeur au format `sha256=<hex>`, calcul `HMAC-SHA256(secret, raw HTTP body)`. L'exemple officiel utilise les octets du corps avant désérialisation (`php://input`) et `hash_equals`.
- https://docs.maishapay.net/front/webhooks — détails de l'API webhook encore indiqués **en cours de développement**. Contacter `support@maishapay.online` pour obtenir/confirmer le secret du webhook, son périmètre Sandbox/Live et l'inscription du callback.
- https://mail.maishapay.net/help?lang=fr — second exemple officiel de notification **plate** (`event:"payment.success"`, `transactionReference`, `transactionId`, `amount`, `currency`, `status`). La page principale montre aussi une enveloppe `type:"transaction.success"`, `data.reference`, `data.transaction_id`, `data.payment_status`. Les deux variantes sont acceptées explicitement, sans interpréter comme succès un statut contradictoire.

Les sources publiques ne documentent pas encore l'échange effectif de clés, les règles de rotation, la stratégie d'anti-rejeu temporel ni un webhook Live garanti. Ces points restent **à confirmer avec le support MaishaPay**.

## Correction implantée

1. `POST /api/billing/maishapay/callback` exige `MAISHAPAY_CALLBACK_SECRET` ; absent → **503**, sans stockage d'événement ni modification financière.
2. Le handler lit une seule fois le corps **brut** via `req.arrayBuffer()` (limité à 256 KiB). Il vérifie `X-MaishaPay-Signature: sha256=<64 caractères hexadécimaux>` en utilisant `createHmac("sha256", secret).update(rawBytes)` et `timingSafeEqual`. Aucune sérialisation JSON ni normalisation avant calcul.
3. Le secret nu dans `?secret=...` ou `x-dtsc-webhook-secret` **n'authentifie plus rien** : valeur absente/invalide → **401**, aucune écriture ni log du secret.
4. Seuls les messages signés avec événement/formats reconnus sont normalisés, puis les champs sont validés par le schéma DTSC. Des messages avec évènements contradictoires, incomplets ou non reconnus sont refusés.
5. **Unité monétaire :** le format API v2 `type: transaction.*` utilise un montant entier en **centimes**, converti exactement en unités monétaires à deux décimales (`500000` → `5000.00`), tandis que le format marchand plat `event: payment.*` fournit un montant en unités monétaires (`25.00` → `25.00`). Les montants fractionnaires ou numériquement imprécis en centimes sont refusés et aucune conversion flottante n'est autorisée. La convention effective de chaque environnement doit être confirmée sur une notification Sandbox authentique avant E2E.
6. La référence PSP déjà enregistrée devient obligatoire dans le callback correspondant : l'absence de `transactionId` n'est pas considérée comme une preuve acceptable.
7. Les événements persistés utilisent un identifiant idempotent dérivé du digest SHA-256 du **corps brut**. Leur charge utile contient les octets signés en base64 et la signature (pas la clé secrète). Les réceptions répétées ne peuvent plus écraser la preuve signée d'un événement précédent.
8. `processStoredWebhookEvent` revérifie la signature sur les octets originaux avant les contrôles de statut, montant, devise, provider et référence, **y compris pendant une relecture administrateur**. Un ancien événement sans preuve signée valide passe en `UNMATCHED` et ne peut activer un abonnement.
9. Une notification `PENDING/FAILED` authentifiée est seulement enregistrée comme non payée ; elle ne modifie plus directement `Payment.callbackPayload` et n'active aucun abonnement.

## Préconditions opérationnelles avant E2E et fusion

- **Configurer le secret webhook réellement attribué ou validé par MaishaPay.** Ce n'est pas automatiquement `MAISHAPAY_SECRET_API_KEY` : ne pas réutiliser la clé API secrète sans confirmation officielle.
- Dans Vercel Production, `MAISHAPAY_CALLBACK_SECRET` doit exister **dans l'environnement effectif du projet**, et correspondre à la valeur de signature du partenaire. Ne jamais l'inscrire dans GitHub, dans les tickets ou dans les logs. Un inventaire des seules variables de projet précédemment consultées ne montrait pas cette clé ; vérifier aussi les variables partagées/scopes.
- Confirmer avec le partenaire le support de `X-MaishaPay-Signature`, la forme `sha256=<hex>` et la signature du corps brut réellement émis. L'ancienne méthode avec secret dans l'URL n'est **pas** compatible avec ce hotfix. Sans coordination, les callbacks Live seront refusés — **NO GO**.
- Vérifier en Sandbox les **unités réellement émises** dans les événements `transaction.success` et `payment.success`, notamment la distinction `500000` centimes vs `5000.00` unités. Aucun traitement de paiement en Production avant preuve du contrat.
- Vérifier en Sandbox avec de vraies notifications *signées* du prestataire ; ne jamais produire de faux règlements en Production. Tester success, pending, failed, facture, double livraison/retry, réorganisation des champs/espaces JSON, montant/devise faux, secret absent, signature incorrecte, erreur de parser et reprise d'anciens événements sans preuve.
- Faire un relevé baseline des taux `401` / `503` / `422` / événements `UNMATCHED` et disposer d'un runbook d'incident. **Ne jamais désactiver la vérification pour « débloquer » un paiement.**

## Tests

- `pnpm qa:maishapay-callback-1176` — vecteurs HMAC calculés à partir du corps brut, mutations de quelques octets et espaces, formats officiels v1/v2, statuts contradictoires, compatibilité du montant en centimes, relecture signée et refus des événements non signés.
- `pnpm qa:maishapay-callback-1176:postgres` — PostgreSQL local isolé, deux tenants fictifs, preuve persistée avec signature, refus des anciens événements non signés, aucun paiement marqué PAID lors des tests de vérification pure.
- CI complète GitHub : Prisma, migrations, PostgreSQL, TypeScript, régression, lint, build. **Les résultats du SHA précédent ne certifient pas le nouveau code HMAC**.
- `OWNER_E2E final BON` puis autorisation de fusion distincte, Production uniquement depuis `main`.

## Limites et dette P0

La signature HMAC vérifie l'authenticité/intégrité du message signé et le secret partagé ; **elle ne prouve pas que les fonds sont réglés auprès d'une banque ou d'un wallet**. Les limites de synchronisation, le rapprochement financier, les soldes réels, la vérification indépendante PSP, la rotation de clés et les remboursements restent à traiter sous #1170 / #992.

## Repli

Aucun schéma DB modifié ; revert Git possible après revue sécurité. Ne pas revenir à la branche permissive en Production. Préférer corriger le secret / la configuration côté prestataire et reproposer la livraison après les tests, plutôt que réactiver un callback non authentifié.
