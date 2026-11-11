# Programme correctif POS Retail — cinq lots (11 novembre 2026)

## Cadre de livraison

- Développement exclusivement sur `hotfix/retail-pos-five-lots-20261111`, jamais sur `main` avant validation finale du propriétaire.
- Aucun déploiement manuel ni Preview Vercel ; la production reste publiée depuis `main`.
- Une E2E finale ne peut être déclarée **BON** que sur preuves CI et parcours réel validé par le propriétaire.
- Ne pas transformer une opération hors connexion en paiement Finance sans approbation/émission.

## Modifications effectivement codées dans la branche — première tranche

1. **Navigation publique** : ouverture des groupes au survol sur dispositif souris, maintien clic et clavier, délai de fermeture et fermeture Escape préservés.
2. **Hors connexion / sécurité métier** : erreur explicite pour incompatibilité avec facture Finance active ; synchronisation tentée au chargement en ligne ; message de reprise plus prudent.
3. **Mise en service** : le score 15/15 est présenté comme la validation des prérequis Finance, et non une garantie générale d'offline, équipements ou conformité.
4. **Équipements POS** : création et modification de profils depuis la vue, recherche, filtrage, pagination frontend, affectation boutique et signalement non trompeur des interfaces matérielles. Le pilote matériel et le test physique restent à implémenter.
5. **Péremptions** : recherche serveur par nom/code article, dates d'expiration, statut de gravité ; contrôles correspondants dans l'interface, tout en préservant la pagination SQL et l'isolation de boutique.
6. **Paiements Finance** : recherche serveur par numéro de paiement, facture ou boutique ; filtres calendaires sur le registre canonique ; interface correspondante sans créer un ledger Retail parallèle.

## Travaux non achevés — ne pas interpréter la branche comme une livraison des cinq lots

### Lot 1 — Offline Finance compatible (P0)
- [ ] Nouveau modèle de brouillon offline compatible avec le workflow facture/validation/émission/encaissement, interdiction d'encaissement financier local définitif.
- [ ] Shell POS accessible après relance hors ligne sans mise en cache des réponses API privées.
- [ ] Chiffrement segmenté par entreprise/utilisateur/appareil ; gestion révocation et nettoyage de session.
- [ ] Synchronisation durable avec relectures réseau, conflits stock/lot/prix/taxe, quotas, double saisie, reprise et accusés serveur.
- [ ] Tests réels coupure/reconnexion, multisession, période fermée, idempotence.

### Lot 2 — Cohérence commerciale/Finance
- [ ] Unification source de commande et vente pour POS, omnicanal et facture Finance ; transitions et états séparés.
- [ ] Historique fiable des promotions/remises/taxes appliquées sur les factures canoniques.
- [ ] Unification retours et avoirs POS historiques/Finance/omnicanal sans double remboursement.
- [ ] Recherche, dates et pagination de l'ensemble du suivi et non uniquement des paiements Finance.

### Lot 3 — Stock et équipement
- [ ] Avertissement stock WARN réellement propagé dans toutes les opérations et permissions.
- [ ] Test effectif du matériel, adaptateurs réseau/bridge/USB/Bluetooth/série et workflow d'association.
- [ ] Filtrage serveur et pagination des profils d'équipements ; statuts matériel remontés réellement.
- [ ] Alertes stock faible paginées (au-delà des 80 premiers), actions lots/FEFO et historique.

### Lot 4 — Design 2.0 global
- [ ] Filtres dynamiques, recherche, pagination serveur, actions contextuelles « … » et exports professionnels sur tous les sous-modules.
- [ ] États chargement/vide/erreur, toasts, responsive mobile, accessibilité, FR/EN et cohérence esthétique.

### Lot 5 — Country packs et onboarding
- [ ] Corriger chaque deep link vers une vraie action de configuration.
- [ ] Ajouter référentiels de pays progressivement après preuve métier/réglementaire.
- [ ] Séparer score vente, équipements, offline et conformité réglementaire.
- [ ] Guide de configuration taxes/remises/numérotation et preuve comptable.
- [ ] Documentation et matrice de tests intégrées à la recette finale.

## Recette obligatoire avant demande E2E propriétaire

- `pnpm lint`, `pnpm typecheck` (ou scripts équivalents du dépôt), tests métier ciblés.
- Tests E2E Playwright desktop/mobile FR/EN : navigation, filtres, droits boutique/admin, périphériques.
- Scénarios stock/paiement : PENDING_SYNC / CONFLICT / REJECTED / SYNCED, facture rejetée/resoumise, dédoublement interdit, paiement partiel/complet, TVA et remise, avoir et retour.
- Vérification des migrations additives et de la compatibilité de production, sans migration appliquée à la production pour l'essai.
- **Statut actuel : travaux partiels, CI non vérifiée, E2E finale non délivrée.**
