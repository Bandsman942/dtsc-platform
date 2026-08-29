# Hotfix #525 — Continuité comptable Business et readiness par événement

## Statut

Hotfix P1 Finance/Retail lié à l’Issue #525.

Baseline de départ : `main@908e6e12b293c050e710a725648bc4ba8852df5a`.

## Problème corrigé

Les modules opérationnels disponibles au plan `BUSINESS` peuvent produire des faits financiers réels alors que l’interface `FINANCE_ACCOUNTING` reste réservée au plan `ENTERPRISE`.

Avant ce hotfix, `postBusinessEvent()` exigeait une readiness Finance globale. Une conversion Mobile Money pouvait donc rester `PENDING` parce qu’un mapping sans rapport avec l’opération courante (paie, achats, ventes, stock, etc.) n’était pas configuré.

Le hotfix conserve la séparation commerciale : **le moteur comptable est une infrastructure interne DTSC ; l’accès à l’interface Comptabilité reste un entitlement Enterprise.**

## Readiness de posting par événement

`finance-readiness-service.ts` reste l’unique autorité de readiness. Il accepte désormais, pour un posting, la liste exacte :

- des mappings sémantiques consommés par le document ;
- des journaux consommés par le document ;
- de la date comptable servant à résoudre les mappings datés.

`posting-service.ts` construit d’abord le document de posting, extrait ses clés sémantiques en ignorant les lignes directes `ACCOUNT_ID:*`, puis appelle la readiness avec ce scope.

Les invariants globaux restent obligatoires : devise fonctionnelle, plan actif et traçable, comptes actifs et couverture du template. La période applicable reste contrôlée par `getPostingPeriod()`.

## Baseline comptable système

Lorsqu’une configuration Finance est enregistrée et que l’organisation ne possède encore ni plan actif, ni plan/draft personnalisé à préserver, ni écritures `POSTED`, DTSC prépare automatiquement le socle comptable système :

- template par défaut provenant exclusivement de `getDefaultChartTemplate()` ;
- plan comptable actif ;
- comptes du template ;
- mappings sémantiques ;
- journaux du template.

Aucun numéro réglementaire n’est dupliqué dans un service Retail. Pour la baseline actuelle, le registre canonique reste `OHADA_SYSCOHADA@0.1.0`.

Le provisioning est non destructif : tout plan existant, y compris un draft vide créé volontairement par un utilisateur, ou tout historique comptable existant empêche le remplacement automatique par le plan système.

### Continuité fiscale du plan système

Une comptabilité cachée Business ne peut pas être réellement continue si aucun exercice/période n’existe. Le hotfix ajoute donc un calendrier **uniquement lorsque le plan actif est le plan système `DTSC-SYSTEM-OHADA` créé par DTSC**.

Pour une date de posting non encore couverte, DTSC crée de façon idempotente :

- un exercice système correspondant à l’année civile UTC ;
- douze périodes mensuelles ouvertes ;
- l’exercice ouvert.

Cette règle n’est jamais appliquée à un plan comptable client/personnalisé. Si un exercice couvrant déjà la date existe, quel que soit son statut, il est respecté : DTSC ne le rouvre pas, ne le remplace pas et ne modifie pas sa politique de clôture. Le calendrier système se renouvelle uniquement tant que le plan système DTSC reste le plan actif.

## Mobile Money et sous-comptes

Avant un posting FX Mobile Money, DTSC tente de granulariser les wallets lorsqu’ils utilisent encore directement le compte résolu par la clé sémantique `MOBILE_MONEY`.

Le service :

- résout le parent via `resolveSemanticPostingAccount()` ;
- ne connaît jamais le numéro OHADA du compte ;
- crée un enfant tenant-scoped et devise-scoped lorsque cela peut être fait sans casser un historique déjà posté sur le parent ;
- rattache le `EnterpriseFinancialAccount` au sous-compte ;
- conserve un compte explicite/personnalisé choisi par l’entreprise ;
- conserve le parent lorsqu’un historique `POSTED` rendrait un cutover silencieux dangereux.

`EnterpriseRetailProviderAccount` reste l’autorité opérateur + devise → compte financier.

## Conversion FX

Le posting de base reste :

- débit du compte ledger du wallet cible ;
- crédit du compte ledger du wallet source.

Le moteur ne crée aucun compte artificiel « conversion FX ».

Lorsque la conversion des lignes dans la devise fonctionnelle laisse un écart réel, le document FX autorise une ligne d’équilibrage sémantique :

- déficit de débit → `FX_LOSS` ;
- déficit de crédit → `FX_GAIN`.

Avec `OHADA_SYSCOHADA@0.1.0`, ces clés sont déjà mappées par le template canonique. Aucun gain/perte n’est créé lorsque les montants fonctionnels sont déjà équilibrés.

## Plans commerciaux

Le hotfix ne modifie pas le registre commercial :

- `FINANCE_TREASURY` reste `BUSINESS` ;
- `MOBILE_MONEY_AGENCY` reste `BUSINESS` ;
- `FINANCE_ACCOUNTING` reste `ENTERPRISE`.

Les écritures générées par les opérations autorisées restent persistées dans le moteur commun même lorsque l’utilisateur n’a pas accès à l’interface Comptabilité. Un upgrade ultérieur vers Enterprise révèle cet historique existant ; il ne déclenche aucun backfill et ne réécrit aucune écriture passée.

## Prisma / données

- Aucun changement de `schema.prisma`.
- Aucune migration.
- Aucune migration historique réécrite.
- Aucune écriture `POSTED` modifiée.
- Aucune suppression destructive.

## Sécurité

- Isolation `organizationId` conservée.
- Les entitlements des modules restent appliqués par le résolveur canonique d’accès.
- La comptabilisation interne ne devient pas un moyen de contourner `FINANCE_ACCOUNTING`.
- Aucun UUID, erreur Prisma ou numéro de compte réglementaire nouveau n’est exposé au client par le hotfix.

## QA permanente

`scripts/qa-525-accounting-continuity-business.mjs` vérifie notamment :

- readiness event-scoped ;
- absence de dépendance de `postBusinessEvent()` à l’entitlement de visibilité Comptabilité ;
- maintien de `FINANCE_ACCOUNTING = ENTERPRISE` ;
- maintien de `MOBILE_MONEY_AGENCY` et `FINANCE_TREASURY = BUSINESS` ;
- provisioning fiscal limité au plan système et respect des exercices existants ;
- utilisation des comptes ledger réels des wallets ;
- présence de `FX_LOSS` / `FX_GAIN` pour les seuls écarts fonctionnels ;
- résolution sémantique `MOBILE_MONEY` sans `552` codé en dur dans le service Retail/provisioning ;
- mappings du template SYSCOHADA par défaut.

Cette QA est ajoutée au runner de régression CI.

## Dette de contribution

- Dette créée : aucune connue.
- Dette maintenue : la dette transactionnelle métier + posting déjà suivie par #521 reste distincte de ce hotfix.
- Dette remboursée : readiness globale sans rapport avec l’événement ; absence de baseline comptable système lors du paramétrage Finance ; absence de continuité fiscale du plan système ; absence de granularisation sûre des wallets avant FX.
- Dette reportée : aucune nouvelle dette silencieuse.

## Rollback

Revert applicatif des commits du hotfix. Les écritures `POSTED` éventuellement créées pendant l’utilisation du hotfix ne doivent jamais être supprimées ou modifiées par le rollback. Les sous-comptes et calendriers système créés restent des données comptables historiques et ne sont jamais supprimés automatiquement par un rollback applicatif.
