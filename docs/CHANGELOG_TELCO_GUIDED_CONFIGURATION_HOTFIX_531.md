# Hotfix #531 — Télécom et forfaits : formulaire guidé et configuration

Date : 2026-08-29  
Baseline : `main@8e2dec7436d80f149a763dd3ee136e34d29146db`

## Contexte

Le module `TELCO_TOPUPS` disposait déjà d'une autorité backend professionnelle pour les comptes opérateur multi-devise, les sessions de caisse, les encaissements, les opérations manuelles/connectées et les écritures Finance. Son interface restait cependant sur le workspace opérateur générique, contrairement au Point de vente et à l'Agence Mobile Money.

Le diagnostic a surtout identifié une incohérence bloquante : `getCommercialRetailDashboard()` calculait `telcoConfiguration`, mais la route dashboard la supprimait du payload `TELCO_TOPUPS`. L'interface pouvait donc considérer qu'aucun réseau n'était configuré alors que les mappings réels existaient en base.

## Corrections

- `TELCO_TOPUPS` possède désormais un workspace professionnel dédié `TelcoTopupsWorkspace`.
- La route dashboard Télécom restitue `telcoConfiguration` au lieu de la perdre lors du scope de réponse.
- Le bloc **Configuration** charge directement la source canonique `/retail/telco-topups/accounts`.
- Chaque réseau est affiché une seule fois, avec ses comptes opérateur par devise et son état de readiness.
- En RDC, CDF + USD restent les devises attendues par la policy canonique existante.
- La configuration expose uniquement `executionMode = MANUAL | CONNECTED`; aucun credential, webhook secret ou secret provider n'est envoyé au navigateur.
- Plusieurs caisses ouvertes peuvent rester disponibles. La caisse sélectionnée fixe la devise d'une recharge cash.
- Pour un encaissement non-cash, le compte financier réel sélectionné fixe la devise.
- Les réseaux proposés sont filtrés selon l'existence d'un mapping `TELCO_FLOAT` dans cette devise et ne peuvent pas utiliser le même compte que l'encaissement.
- Le compte opérateur est résolu automatiquement : le navigateur continue d'envoyer `operatorFloatAccountId: null` et le serveur reste autoritaire.
- Une offre réelle du Catalogue peut préremplir le libellé, le prix indicatif et le coût indicatif, sans inventer de donnée.
- Le formulaire fournit aides contextuelles, marqueurs obligatoires, erreurs par champ avec `aria-invalid` / `role=alert`, et toast foreground.
- Une erreur conserve la saisie afin de permettre la correction.
- Une revue plein écran/mobile-first précède toute mutation et affiche réseau, offre, bénéficiaire, devise, encaissement, compte opérateur, coût, marge et mode d'exécution.
- En `MANUAL`, la référence est obligatoire uniquement pour un succès et le motif est obligatoire pour un échec.
- En `CONNECTED`, l'agent ne force ni référence ni résultat : l'intégration provider reste l'autorité.
- La contrepassation n'utilise plus `window.prompt` sur le parcours routé ; elle passe par un dialogue contrôlé avec motif obligatoire.

## Sécurité et données

Aucune migration Prisma n'est nécessaire. Le hotfix réutilise :

- `EnterpriseRetailProviderAccount` avec `accountUse = TELCO_FLOAT` ;
- les comptes financiers réels du tenant ;
- les sessions `EnterpriseCashSession` de l'agent ;
- les routes RBAC `TELCO_TOPUPS` existantes ;
- la validation Zod et les contrôles serveur existants ;
- le stockage historique de `tenderFinancialAccountId` et `operatorFloatAccountId` pour garantir un reversal exact même après reconfiguration.

Aucun ID navigateur n'est considéré comme une autorisation. Les références Catalogue, encaissement, opérateur et session de caisse restent revalidées dans le même `organizationId`.

## QA

La nouvelle QA `scripts/qa-531-telco-guided-configuration.mjs` protège :

- le routage vers le workspace dédié ;
- le bloc Configuration ;
- le contrat MANUAL/CONNECTED sans exposition de secrets ;
- les caisses concurrentes et la devise dérivée de l'encaissement ;
- la résolution serveur du compte opérateur ;
- les formulaires guidés et la revue plein écran ;
- l'absence de `window.prompt` sur le parcours Télécom ;
- les dictionnaires FR/EN ;
- le reversal sur les comptes historiques ;
- RBAC, audit et isolation multi-tenant.

La QA historique `qa-310-telco-multicurrency.mjs` a été migrée vers le workspace dédié sans suppression de ses garde-fous.

## Livraison

Conformément à `docs/CONTRIBUTING.md` :

- Issue : #531 ;
- branche : `fix/531-telco-guided-configuration` ;
- aucun déploiement Preview Vercel utilisé comme preuve ;
- production uniquement depuis `main` après gates CI et `OWNER_E2E` explicite ;
- rollback applicatif par revert du hotfix ; aucune donnée historique ni mapping existant n'est supprimé.
