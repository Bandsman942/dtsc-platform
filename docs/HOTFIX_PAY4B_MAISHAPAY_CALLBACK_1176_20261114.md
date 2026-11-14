# P0 PAY-4B #1176 — Authentification et vérification des callbacks MaishaPay

**Livraison candidate v1.17.8, PR NON FUSIONNÉE. Aucun paiement Production exécuté ou rejoué.**

## Diagnostic (main 1bd71898, 14 novembre 2026)

La route `POST /api/billing/maishapay/callback` était permissive en l'absence de `MAISHAPAY_CALLBACK_SECRET`. Le dispatcher `processStoredWebhookEvent` ne vérifiait pas le montant, la devise ni le prestataire stockés dans `Payment` avant `activateSubscriptionFromPayment` ; une relecture administrateur pouvait donc activer un paiement discordant.

L'existence d'un `WebhookEvent` ou d'un statut de notification `paid` ne **prouve pas** un règlement bancaire ni une écriture comptable rapprochée. La correction ne prétend pas vérifier la signature native/HMAC MaishaPay : le contrat exact du prestataire doit encore être vérifié.

## Changements bornés

- En l'absence de `MAISHAPAY_CALLBACK_SECRET`, le webhook renvoie `503` sans stocker ni accepter un callback. Si le secret transmis est absent/invalide, réponse `401` avec comparaison en temps constant de condensats SHA-256.
- La compatibilité **transitoire** avec `?secret=...` est conservée pour les webhooks déjà configurés ; privilégier impérativement `x-dtsc-webhook-secret`. Le paramètre URL peut fuiter dans les journaux de proxy : le retirer lors d'une release ultérieure après validation du prestataire et rotation du secret.
- La vérification est également exécutée **dans le dispatcher de relecture** avant toute activation : provider `MAISHAPAY`, montant exact en centimes (BigInt), devise et identifiant PSP lorsqu'il est présent des deux côtés.
- Une contradiction entre `status=FAILED/PENDING` et `statusCode=200` ne vaut plus confirmation payée.
- Un événement discordant est classé `UNMATCHED` avec un code d'erreur stable, sans changer `Payment`, `Invoice`, `Subscription` ou le compte financier.
- Aucun champ, migration SQL, nouveau secret ou nouvelle table créé.

## Préconditions critiques avant validation E2E et fusion

1. **Vérifier la présence de `MAISHAPAY_CALLBACK_SECRET` dans l'environnement Production de Vercel**, sans lire ni diffuser sa valeur. Un inventaire de variables projet à cette date n'exposait pas de clé MaishaPay ; confirmer également les variables partagées, les scopes et la configuration effective.
2. Si nécessaire, provisionner une nouvelle valeur aléatoire privée d'au moins 24 caractères, configurée **à l'identique** côté callback du prestataire et dans Vercel Production, sans inscription dans Git, tickets, logs ou URL.
3. Vérifier sur la documentation/console MaishaPay officielle le mécanisme d'authenticité des callbacks, les champs `status`, `statusCode`, `amount`, `currency`, `transactionId`, la prise en charge du header et les devises réelles. **Aucune garantie d'une signature native MaishaPay n'est revendiquée.**
4. Tester d'abord dans le sandbox et dans une base PostgreSQL isolée. Si le provider ne transmet pas les champs de preuve exigés, le paiement doit rester non activé jusqu'à conception approuvée d'une vérification serveur côté PSP.
5. Prévoir une procédure opérateur pour callbacks refusés, alertes `401/503/422`, événement `UNMATCHED` et reprises, ainsi qu'un retour arrière par PR sans marquer artificiellement des paiements comme PAID.

## QA / recette

- `pnpm qa:maishapay-callback-1176` : secrets absent/incorrect/correct, statuts contradictoires, exactitude des centimes, montant/devise/référence mismatches, vérification du dispatcher avant activation, contrat de refus.
- `pnpm qa:maishapay-callback-1176:postgres` : paiements fictifs de deux entreprises dans PostgreSQL local, comparaison de `Prisma.Decimal`, isolation tenant, absence de changement de statut et d'émission de facture **dans le test de validation pure**.
- Quality Gates habituelles : gouvernance, Prisma, migrations, TypeScript, régression complète, lint et build.
- E2E propriétaire requis sur webhook sandbox authentifié, souscription personnelle et entreprise, retries, cas montant et devise malveillants, secret absent, sans émission d'une facture sur refus.

## Dette P0 maintenue

Ce lot n'introduit pas de compte de règlement PSP réel ni de rapprochement bancaire, ne répare pas l'atomicité des états `Payment` / `OrganizationSubscription` / `Invoice` / `HrcfoExpense`, et ne supprime pas les risques de replay d'un événement déjà conservé. **Parents #1170 et #992 restent OPEN.**

La Production demeure réservée à `main`, après CI complète, E2E propriétaire et autorisation de fusion distincte. Aucune exécution de callback réel ne fait partie de ce hotfix en cours de préparation.
