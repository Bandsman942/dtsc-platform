# P0 PAY-4B #1174 — secret de callback MaishaPay obligatoire en production

**État : PR candidate v1.17.7, NON FUSIONNÉE, sans modification des variables ni des paiements Production.**

## Références fournisseur vérifiées le 14/11/2026

- [Documentation MaishaPay — Webhooks](https://docs.maishapay.net/) : annonce une signature `X-MaishaPay-Signature` de forme `sha256=<hex HMAC-SHA256 du corps brut>`.
- [Documentation MaishaPay — FAQ](https://maishapay.net/faq?lang=fr) : décrit une signature HMAC-SHA256 et des réessais des callbacks en cas d'acquittement non reçu.
- Les pages plus anciennes et la page Webhooks en cours de rédaction montrent plusieurs formats. L'intégration actuelle DTSC conserve un schéma de payload historique à champs plats ; **un webhook au format enveloppé moderne pourrait échouer la validation de payload malgré une signature correcte**. La certification fournisseur/sandbox reste donc une condition NO-GO.

## Risque actuellement vérifié

Dans `app/api/billing/maishapay/callback/route.ts`, la condition historique `if (env.MAISHAPAY_CALLBACK_SECRET && secret !== env.MAISHAPAY_CALLBACK_SECRET)` autorise des callbacks sans authentification lorsque le secret est absent. Un payload de statut `paid` passe alors vers la file `WebhookEvent` et la logique d'activation, sans authentification indépendante dans cette route.

La correction appelle `authorizeMaishaPayCallback()` **avant** la lecture du JSON et toute écriture DB :

- Production + `MAISHAPAY_CALLBACK_SECRET` absent/vide : **HTTP 503**, aucune écriture, aucun traitement et aucune réponse de succès trompeuse.
- Secret configuré + jeton incorrect/absent : **HTTP 401**, aucune écriture.
- En-tête officiel `X-MaishaPay-Signature` présent : vérification prioritaire `HMAC-SHA256` sur les **octets UTF-8 exacts** du corps brut, comparaison `timingSafeEqual` sur digests, rejet si signature malformée/erronée. Aucun retour au jeton partagé en cas de signature incorrecte.
- En absence de signature officielle uniquement, jeton partagé correct : traitement historique conservé ; comparaison par SHA-256 puis `timingSafeEqual`, sans valeur de secret dans la réponse.
- **Signature HMAC prioritaire**. Sans elle, le header de compatibilité `x-dtsc-webhook-secret` est privilégié ; ancien `?secret=` autorisé pour compatibilité **uniquement lorsque le secret est correctement configuré**. Prévoir la suppression de ce transport legacy après certification du webhook officiel par MaishaPay.
- Environnement de développement sans secret : mode local historique conservé pour ne pas perturber les tests hors Production ; il ne doit jamais servir à simuler une confirmation bancaire fiable.

## NO-GO avant fusion

1. Confirmer par opérateur que `MAISHAPAY_CALLBACK_SECRET` est défini **pour Production** du bon projet Vercel, sans afficher sa valeur dans ChatGPT, GitHub ou les logs. Le secret doit contenir au moins 24 caractères suivant le schéma `lib/env.ts`.
2. Vérifier avec MaishaPay que les notifications du compte marchand utilisent bien l'en-tête officiel `X-MaishaPay-Signature`, le format `sha256=<hex>`, la même clé webhook et un payload JSON à champs compatibles. S'il existe un ancien mode à jeton, documenter séparément et certifier la transition ; ne pas présumer que les deux générations d'API sont interchangeables.
3. Exécuter le QA `pnpm qa:maishapay-callback-auth` et les Quality Gates (type-check, lint, regression, build, migration chain) sur le SHA final.
4. E2E propriétaire en environnement contrôlé : secrets absent/mauvais/valide, aucun objet en DB en cas de refus, callback valide compatible et double callback idempotent. **Pas de simulation de versement réel en production.**
5. Recevoir la validation **OWNER_E2E #1174 BON** et une autorisation explicite de fusion distincte. Déploiement exclusivement via `main` (aucun Preview ni `--prod` manuel), surveillance d'éventuels 503/401 et plan incident.

## Limites de sécurité encore P0 #1170 / #992

La signature HMAC du corps brut authentifie son intégrité si MaishaPay utilise effectivement la clé webhook certifiée. **Elle ne prouve pas que le paiement est réglé sur le compte bancaire.** Le fallback historique au jeton partagé, lui, n'est pas une signature native. Le contrôle indépendant de référence, montant, devise, statut PSP, compte crédité, unicité comptable, remboursement et rapprochement restent ouverts.

## Rollback

Revert de code sous politique de release ; **ne pas retirer le secret pour déverrouiller des callbacks non authentifiés**. En cas de 503, traiter la configuration opérateur et le transport PSP ; conserver les événements non traités pour rapprochement, jamais déclarer un abonnement payé sur une preuve insuffisante.

## Variables

- Existant : `MAISHAPAY_CALLBACK_SECRET` (Production Vercel), ne jamais committer la valeur.
- Aucune nouvelle variable d'environnement et aucune migration Prisma.
