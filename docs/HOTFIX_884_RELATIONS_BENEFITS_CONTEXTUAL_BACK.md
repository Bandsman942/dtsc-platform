# Hotfix #884 — Relations DTSC, avantages et retour contextuel

> **Statut : implémentation partielle sur branche, non livrée.** Cette note décrit le diff existant, pas une certification E2E ni la disponibilité Production.

## Référence et portée

- Issue : #884, priorité P1, impact de livraison élevé.
- Branche : `fix/884-relations-benefits-contextual-back`.
- Baseline : `main@3840cc7a6aeb217fef01be940bb94ed854ad0896`.
- Contrats : `AGENTS.md`, `docs/CONTRIBUTING.md`, règles API entreprise, ERP, sécurité et UI mobile.
- Source de vérité : `EnterpriseIdentityLink`, `EnterprisePersonBusinessReference` et tables existantes `EnterpriseRelationshipBenefit*`. Aucune table ou migration nouvelle.

## Modifications enregistrées

1. **Identités et consentements.** Les entrées de la liste ouvrent désormais une fiche plein écran réutilisant `FullscreenEntityDetail` et le panneau de relation partagé. La fenêtre dédiée sélectionne sa propre cible métier au lieu de réutiliser la sélection globale du formulaire d'invitation. Les décisions `APPROVE`, `REFUSE` et `CANCEL` réutilisent exclusivement la route existante, son contrôle de révision, la validation serveur et l'audit. Les erreurs conservent le formulaire et affichent un toast global. Le paramètre `link` garde un lien direct vers une relation sans exposer son contenu hors autorisation serveur.
2. **Tiers, prospects et clients.** La réponse CRM expose `identityLinks` pour toutes les relations découvertes sur les références actives de chaque tiers, et conserve `identityLink` pour compatibilité. La fiche d'un tiers montre le panneau `Résumé / Avantages / Historique`, y compris plusieurs relations.
3. **Lecture des avantages.** La route `GET .../identity-links/[linkId]/overview` vérifie contexte d'organisation, autorisations, références du tiers et entitlements. Elle expose uniquement des avantages potentiellement applicables ; l'éligibilité réelle reste évaluée par le moteur métier au moment de l'opération. Historique daté, filtrable par statut, paginé côté serveur (20 lignes par page), avec ouverture des détails de demande, décision, annulation et exécution sans inventer d'effet métier. **Une demande approuvée n'est pas une consommation.**
4. **Création depuis une demande.** Un lien sécurisé `action=create&returnTo=...` ouvre la création de tiers et renvoie à la demande concernée après enregistrement.
5. **Navigation.** `ContextualBackButton` apparaît dans le `ModuleHeader` commun ; un repli dans `AppShell` couvre les pages privées sans cet en-tête et est masqué lorsqu'un en-tête commun existe. Repli interne sans origine externe et conservation de l'URL de navigation lorsqu'elle est connue.
6. **Gaming Checkout (à certifier).** `gaming-adapter.ts` cible les remises monétaires sur `GAMING_CHECKOUT`. Le serveur respecte consentement, abonnement, conditions et quotas du moteur commun. La remise est portée par la facture Gaming existante avec montant brut, réduction et net distincts, et le suivi canonique `EnterpriseRelationshipBenefitUsage`. Une utilisation est d'abord réservée (`APPROVED`), consommée après émission de la facture (`CONSUMED`), puis inversée lors d'une annulation ou d'un remboursement confirmé (`CANCELLED`). Les remises à 100 % sont actuellement exclues, faute de prise en charge canonique de facture nulle.
7. **Contrat QA.** `pnpm qa:hotfix-884` inclut les contrats Gaming ; le parcours navigateur `tests/e2e/issue-884-relations-back.spec.mjs` est présent mais pas encore exécuté.

## Points encore **non terminés** — bloquants avant merge

- **Gaming :** l'adaptateur de remise sur factures Gaming et le cycle réservation → consommation → annulation sont codés, mais **non certifiés**. Les scénarios d'accès, quotas concurrents, factures émises, annulations, remboursements et non-régression Retail exigent CI et E2E. La réservation Gaming sans facture ne déclenche aucun usage : ce comportement est intentionnel.
- **Retour contextuel :** la navigation arrière couvre les en-têtes communs et le shell principal. Il reste à prouver la conservation des filtres internes React, formulaires non enregistrés, piles dialogue/page, scroll, retour Android/PWA, et le changement de contexte entreprise.
- **Historique :** les lignes sont maintenant extensibles, datées et filtrées par statut ; les liens directs vers les opérations métier restent à ajouter après vérification des droits par module et de l'appartenance tenant.
- **UX FR/EN et accessibilité :** finaliser le dictionnaire de toutes les nouvelles chaînes, parcours clavier et vérification sur les sept largeurs contractuelles.
- **Sécurité et performance :** vérifier le comportement multi-org, rôles CRM lecture vs admin, tentatives cross-tenant, concurrence et limites de requêtes, absence de poll global et équivalence des bénéfices avec le moteur canonique.
- **Contrôles exécutables :** exécuter `pnpm prisma:generate`, `pnpm type-check`, `pnpm qa:hotfix-884`, `pnpm qa:regression`, `pnpm lint`, `pnpm build`, QA navigateur et E2E propriétaire. Tous ont le statut `NOT_EXECUTED` tant qu'aucune preuve correspondante n'est produite.

## Owner E2E requis

Sur entreprise de test avec au moins deux tiers et plusieurs relations, vérifier : ouverture d'une invitation, demande et historique ; approbation avec cible adaptée ; refus et motif ; conservation des données après erreur 409 ; affichage multi-relations tiers ; avantages avec conditions/quota ; demande non-consommée ; consommation Gaming après émission de facture, annulation et remboursement idempotent ; retour contexte/filtre/formulaire navigateur et Android/PWA ; refus serveur hors tenant ; FR/EN, sombre/clair, mobile 320/360/375/390/414/768/1024.

## Rollback

Revert applicatif par PR. Aucun backfill ni suppression des données d'identité, consentement, avantages, usages, pièces métier ou écritures financières. Aucune sortie Production avant CI, E2E propriétaire, merge dans `main` et vérification du SHA Vercel READY.
