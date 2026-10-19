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
- **Retour contextuel :** pile bornée de routes internes non sensibles, conservation des filtres/pagination CRM et du scroll, dialogue DTSC avant abandon de formulaire, et gestion du retour natif pour fermer les détails d’Identités. Prouver sur Android/PWA, autre module et changement d’entreprise dans OWNER_E2E.
- **Historique :** lignes extensibles, datées et filtrées. Les usages Gaming associés à un checkout du tenant courant ouvrent la fiche réelle après vérification des droits de lecture Gaming et de l’appartenance tenant. Les autres modules n’exposent pas de lien profond non certifié.
- **UX FR/EN et accessibilité :** libellés, dates et états du bloc Identités bilingues ; validation finale des parcours clavier, sept largeurs et formulaires existants exigée en navigateur.
- **Sécurité et performance :** vérifier le comportement multi-org, rôles CRM lecture vs admin, tentatives cross-tenant, concurrence et limites de requêtes, absence de poll global et équivalence des bénéfices avec le moteur canonique.
- **Contrôles exécutables :** vérifier les preuves du dernier SHA GitHub pour Prisma, type-check, QA #884, régression, lint, build, Gaming et navigateur. Les preuves d’un SHA précédent n’équivalent pas au SHA final. OWNER_E2E reste humain.

Runbook de validation humaine : `docs/OWNER_E2E_884_RELATIONS_GAMING_NAVIGATION.md`.

## Owner E2E requis

Sur entreprise de test avec au moins deux tiers et plusieurs relations, vérifier : ouverture d'une invitation, demande et historique ; approbation avec cible adaptée ; refus et motif ; conservation des données après erreur 409 ; affichage multi-relations tiers ; avantages avec conditions/quota ; demande non-consommée ; consommation Gaming après émission de facture, annulation et remboursement idempotent ; retour contexte/filtre/formulaire navigateur et Android/PWA ; refus serveur hors tenant ; FR/EN, sombre/clair, mobile 320/360/375/390/414/768/1024.

## Rollback

Revert applicatif par PR. Aucun backfill ni suppression des données d'identité, consentement, avantages, usages, pièces métier ou écritures financières. Aucune sortie Production avant CI, E2E propriétaire, merge dans `main` et vérification du SHA Vercel READY.
