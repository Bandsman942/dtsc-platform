# SCALE-4D — Diffusions admin asynchrones

Issue: #453
Parent: #357

## But

Retirer Zoho Mail et son fallback webhook du chemin interactif `POST /api/admin/broadcast` sans toucher aux emails critiques (OTP, récupération de compte, signup, invitations, etc.).

## Contrat livré

- `POST /api/admin/broadcast` valide l'ADMIN et le payload, charge les utilisateurs actifs puis remet la diffusion à une transaction durable.
- La transaction crée ensemble :
  - les notifications internes autorisées par `notifyBroadcastEnabled` ;
  - leurs événements Web Push SCALE-4C ;
  - un payload email maître ;
  - les jobs de livraison email.
- La réponse HTTP est `202 Accepted` et n'attend aucun appel réseau Zoho.
- L'API distingue explicitement `queued=true` de la livraison provider et ne prétend jamais qu'un email a déjà été envoyé au moment du `202`.
- L'écran Admin présente le même contrat avec « mise en file » dans la confirmation et le CTA.
- Si aucun utilisateur actif n'est trouvé, aucun payload ni job email vide n'est créé et les compteurs restent à zéro.
- Sans `{user}`, un job groupé conserve l'envoi broadcast/CCI du provider sortant.
- Avec `{user}`, un job par destinataire permet un retry et une DLQ indépendants sans dupliquer le corps HTML dans chaque ligne : les jobs référencent le payload maître.

## Worker

Endpoint interne : `/api/internal/admin-broadcast-email/process?batch=50`
Cadence : chaque minute.
Secrets acceptés : `CRON_SECRET` ou `WORKFLOW_WORKER_SECRET`.

Le worker :

- réclame uniquement `PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY` ;
- utilise `FOR UPDATE SKIP LOCKED` ;
- récupère les leases périmées ;
- traite au maximum 50 jobs par invocation avec concurrence réseau bornée à 5 ;
- essaie Zoho outbound puis le webhook de secours existant ;
- applique backoff exponentiel et `DEAD` après 5 tentatives ;
- normalise les échecs fournisseur en codes internes stables avant persistance dans `lastError` ;
- expose seulement des compteurs et la pression de file, jamais les emails ni le contenu.

Les workers workflows, legacy et isolé, excluent explicitement cet `eventType` afin qu'aucune famille de workers ne vole les jobs d'une autre.

## Limites assumées

Ce lot réduit la latence interactive et rend les diffusions rejouables. Il ne certifie pas le débit email nécessaire à 5 000 utilisateurs et ne modifie pas les limites du fournisseur Zoho. Ces chiffres doivent être mesurés pendant les étapes de charge ultérieures du programme SCALE.

## QA

`scripts/qa-scale4d-admin-broadcast-email.mjs` verrouille le contrat : transaction, absence d'appel Zoho dans la requête interactive, vérité de l'état « mis en file », audience vide, cron, claim multi-instance, concurrence bornée, retries/DLQ, erreurs fournisseur normalisées, observabilité et isolation des workers.
