# P0 PAY-4B #1174 — secret de callback MaishaPay obligatoire en production

**État : PR candidate v1.17.7, NON FUSIONNÉE, sans modification des variables ni des paiements Production.**

## Risque actuellement vérifié

Dans `app/api/billing/maishapay/callback/route.ts`, la condition historique `if (env.MAISHAPAY_CALLBACK_SECRET && secret !== env.MAISHAPAY_CALLBACK_SECRET)` autorise des callbacks sans authentification lorsque le secret est absent. Un payload de statut `paid` passe alors vers la file `WebhookEvent` et la logique d'activation, sans authentification indépendante dans cette route.

La correction appelle `authorizeMaishaPayCallback()` **avant** la lecture du JSON et toute écriture DB :

- Production + `MAISHAPAY_CALLBACK_SECRET` absent/vide : **HTTP 503**, aucune écriture, aucun traitement et aucune réponse de succès trompeuse.
- Secret configuré + jeton incorrect/absent : **HTTP 401**, aucune écriture.
- Jeton correct : traitement historique conservé ; comparaison par SHA-256 puis `timingSafeEqual`, sans valeur de secret dans la réponse.
- Header `x-dtsc-webhook-secret` privilégié ; ancien `?secret=` autorisé pour compatibilité **uniquement lorsque le secret est correctement configuré**. Planifier la suppression du paramètre URL après certification du transport officiel par MaishaPay.
- Environnement de développement sans secret : mode local historique conservé pour ne pas perturber les tests hors Production ; il ne doit jamais servir à simuler une confirmation bancaire fiable.

## NO-GO avant fusion

1. Confirmer par opérateur que `MAISHAPAY_CALLBACK_SECRET` est défini **pour Production** du bon projet Vercel, sans afficher sa valeur dans ChatGPT, GitHub ou les logs. Le secret doit contenir au moins 24 caractères suivant le schéma `lib/env.ts`.
2. Vérifier avec MaishaPay le mode de transport réel (header `x-dtsc-webhook-secret` ou requête `?secret=`). Si seul le paramètre d'URL est utilisé, vérifier la rotation et l'absence de conservation du jeton dans les logs/proxies/referrers.
3. Exécuter le QA `pnpm qa:maishapay-callback-auth` et les Quality Gates (type-check, lint, regression, build, migration chain) sur le SHA final.
4. E2E propriétaire en environnement contrôlé : secrets absent/mauvais/valide, aucun objet en DB en cas de refus, callback valide compatible et double callback idempotent. **Pas de simulation de versement réel en production.**
5. Recevoir la validation **OWNER_E2E #1174 BON** et une autorisation explicite de fusion distincte. Déploiement exclusivement via `main` (aucun Preview ni `--prod` manuel), surveillance d'éventuels 503/401 et plan incident.

## Limites de sécurité encore P0 #1170 / #992

Un secret partagé correctement comparé authentifie un porteur de jeton : **ce n'est pas une signature native MaishaPay, ni une attestation du statut PSP, ni une preuve de crédit sur le compte bancaire**. La vérification de référence, montant, devise, PSP, compte réellement crédité, unicité comptable, remboursement et rapprochement restent entièrement à résoudre.

## Rollback

Revert de code sous politique de release ; **ne pas retirer le secret pour déverrouiller des callbacks non authentifiés**. En cas de 503, traiter la configuration opérateur et le transport PSP ; conserver les événements non traités pour rapprochement, jamais déclarer un abonnement payé sur une preuve insuffisante.

## Variables

- Existant : `MAISHAPAY_CALLBACK_SECRET` (Production Vercel), ne jamais committer la valeur.
- Aucune nouvelle variable d'environnement et aucune migration Prisma.
