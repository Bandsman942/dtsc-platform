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
6. **Paiements Finance et historiques** : recherche et filtres calendaires côté serveur ; menus contextuels de consultation de facture et encaissements pour les paiements Finance ; aucun nouveau ledger.
7. **Commandes omnicanales** : pagination navigation UI, filtres de statut, mode de livraison, période et recherche par référence/titre côté serveur, périmètre d’entreprise/boutique préservé.


## Suite effective — branche `fix/1116-retail-pos-five-lots`, PR #1118

> PR #1115 fermée sans fusion et remplacée par #1118. `main` et la production ne sont pas touchées.

### Implémentations complémentaires présentes sur cette branche
- [x] Parcours hors connexion Finance **brouillon uniquement** : snapshot en mode `draftOnly`, queue locale chiffrée, synchronisation vers `prepareRetailInvoice` pour générer une facture DRAFT et ne jamais émettre ni encaisser directement.
- [x] Interdiction stricte de proposer un tender sur un brouillon hors connexion, nouvelles vérifications de prix/taxe/stock, idempotence UUID+payload+site+snapshot, contrôle des droits `PREPARE_INVOICE` réactualisé.
- [x] Vérification de stock lots datés : articles avec lots exclus de la capture sans sélection de lot (parcours Finance en ligne requis).
- [x] Drain séquentiel de toute la file PENDING_SYNC avec verrou in-flight, maintien des conflits pour réconciliation.
- [x] Recherche/filtrage/pagination SQL : matériels, commandes omnicanales, paiements Finance/historiques, lots en péremption et alertes de stock faible.
- [x] Registres tarification/offres/retours historiques : pagination et filtres serveur ; composant frontend 2.0 avec rail de statuts, recherche, dates et menus de consultation.
- [x] Mise en service : lien direct vers les sous-modules réellement disponibles et avertissement explicite des limites du score Finance 15/15.
- [x] Équipements : formulaire administrateur, filtres/pagination serveur, sélection de boutique, test scanner clavier, impression navigateur et pairing WebUSB/WebSerial/WebBluetooth **uniquement de permission**.
- [x] QA `scripts/qa-retail-five-lots-1116.mjs` ajoutée à Quality Gate, vérifications de brouillon Finance et de non-duplication.

### Améliorations complémentaires enregistrées

- [x] Isolement des données IndexedDB et des clés AES-GCM par entreprise, acteur connecté et installation navigateur. Les données locales historiques non attribuées restent conservées sans migration automatique afin d'éviter une divulgation à un autre compte ; récupération explicite de ces données toujours à concevoir.
- [x] Moteur de tarification/Finance : prévisualisation et création de brouillons utilisent la même tarification serveur, hors avantages relationnels non comptabilisés ; les promotions/coupons Retail sont **bloqués explicitement** dans le circuit Finance tant qu'un registre de consommation/réversion des promotions lié à `EnterpriseSalesInvoice` n'existe pas. L'ancien `EnterpriseRetailPromotionRedemption` exige un `saleId` Retail et ne peut pas être réutilisé sans fausse vente.
- [x] Mode WARN de stock : avertissement lot expiré/lot non sélectionné détecté par le serveur, conservé dans `EnterpriseSalesInvoice.notes` pour les valideurs Finance ; toast contextualisé pour le préparateur. La protection réglementaire de certaines marchandises reste une responsabilité métier spécifique.
- [x] Registre commercial : exports premium CSV, XLSX et PDF respectant les filtres et les autorisations, avec plafonnement explicite à 5 000 enregistrements pour éviter les exports massifs en mémoire.
- [x] Paiements Finance/historiques et péremptions : exports premium filtrés CSV, XLSX et PDF à partir des données du serveur.
- [x] Origine de commande omnicanale séparée du mode de livraison : POS, ONLINE, WHATSAPP, PHONE, MARKETPLACE, sélection manuelle, filtrage du registre et attribution aux décisions tarifaires. Il ne s'agit pas d'un connecteur e-commerce ou WhatsApp automatisé.
- [x] Règles de livraison et modes de traitement des commandes existants préservés ; menus d'actions contextuels regroupés.

- [x] Tarification multirègles : suppression de l'écrasement de la première règle par prix Catalogue. Création de règles distinctes par boutique/canal/quantité, édition par identifiant et numéro de révision, rejet des conditions identiques et mises à jour obsolètes.
- [x] Nettoyage en fin de service des données locales d'un utilisateur sur un navigateur, uniquement lorsqu'aucune opération n'est en attente, rejetée ou conflictuelle ; vérification et suppression atomiques dans une transaction IndexedDB. Les factures serveur ne sont jamais supprimées.

### Limites de déploiement non levées
- [ ] Un shell POS autonome capable de recharger hors connexion en garantissant l'authentification locale et l'isolation entreprise/utilisateur/appareil ; les pages privées ne sont volontairement pas mises en cache.
- [ ] Déverrouillage local réellement sécurisé, nettoyage contrôlé à déconnexion, scénarios multisession ; ne pas perdre une file comptable non synchronisée.
- [ ] Résolution interactive des conflits de prix, lots, changements de TVA et données expirées, plus tests réseau avec horloges et quotas.
- [ ] Unification des commandes issues de tous les canaux et registre de remises/promotions **propre aux factures Finance** (consommation, quotas, reversement/avoirs) ; les remises Retail non traçables sont bloquées dans le checkout Finance. Les retours historiques demeurent séparés des avoirs Finance.
- [x] Avertissement WARN dans la préparation Finance, conservé dans les notes de la facture ; reste la couverture des autres traitements Inventory.
- [ ] Adaptateurs certifiés des imprimantes ESC/POS, balances, terminaux de paiement, tiroirs-caisses ; permission navigateur ≠ appareil prêt.
- [x] Export PDF/XLSX/CSV pour paiements Finance/historiques, lots périmés, règles commerciales, équipements et commandes omnicanales, avec contrôles serveur RBAC et plafonnement à 5 000 lignes ; restent l’harmonisation définitive FR/EN/mobile/accessibilité et les exports propres aux autres registres spécialisés.
- [ ] Extension des packs pays hors RDC et configuration réglementaire de numérotation ; aucune disponibilité fiscale ne doit être inventée.
- [ ] Recette E2E complète sur configuration SHOP BCN multi-boutiques et validation propriétaire.

### Vérifications observées
- CI de PR #1118 : gouvernance validée sur plusieurs runs ; QA dédiée `Retail five lots #1116` exécutée avec message PASS sur un run intermédiaire. Un run ultérieur antérieur à ces derniers correctifs a échoué sur Type check/Build : **la validation complète n'est pas acquise**. Les nouveaux commits nécessitent un run vert et l'analyse des logs.
- La réussite de cette QA ciblée **ne constitue pas** une preuve de conformité des cinq lots, ni de la CI complète.
- Aucun E2E final n'est déclaré réussi ; la PR est maintenue en Draft.

### Règles de sécurité et d'interprétation
1. La donnée locale d'une vente Finance n'a jamais la valeur d'une facture émise ni d'un paiement comptabilisé.
2. Le mode historique de vente directe reste séparé du nouveau mode Finance ; la politique de droit et de stock est vérifiée au retour en ligne.
3. Les périphériques web nécessitent HTTPS, consentement navigateur et un pilote certifié pour les opérations matérielles effectives.
4. Le score 15/15 reste le score des **pré-requis** de facturation Finance, pas une certification complète du POS.
5. `main` reste la seule source de production après fusion autorisée et E2E final BON explicite.

## Travaux non achevés — ne pas interpréter la branche comme une livraison des cinq lots

### Lot 1 — Offline Finance compatible (P0)
- [ ] Nouveau modèle de brouillon offline compatible avec le workflow facture/validation/émission/encaissement, interdiction d'encaissement financier local définitif.
- [ ] Shell POS accessible après relance hors ligne sans mise en cache des réponses API privées.
- [x] Chiffrement local segmenté par entreprise/utilisateur/installation navigateur ; restent la récupération des anciens brouillons et l’effacement à déconnexion sécurisé.
- [ ] Synchronisation durable avec relectures réseau, conflits stock/lot/prix/taxe, quotas, double saisie, reprise et accusés serveur.
- [ ] Tests réels coupure/reconnexion, multisession, période fermée, idempotence.

### Lot 2 — Cohérence commerciale/Finance
- [ ] Unification source de commande et vente pour POS, omnicanal et facture Finance ; transitions et états séparés.
- [ ] Historique fiable des promotions/remises/taxes appliquées sur les factures canoniques, avec plafonds et avoirs ; l’octroi de promotions Finance non traçables est actuellement empêché.
- [ ] Unification retours et avoirs POS historiques/Finance/omnicanal sans double remboursement.
- [x] Recherche, dates et pagination des deux registres de paiement ; restent à ajouter les exports et actions contextuelles complètes.

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

### Durcissement supplémentaire de la file locale (#1118)

- La capture d'une opération hors connexion utilise désormais l'ajout IndexedDB exclusif (`add`) plutôt que l'écrasement (`put`) : un UUID réutilisé par erreur ou simultanément dans plusieurs onglets ne peut plus remplacer silencieusement une opération financière en attente.
- Une réponse HTTP ancienne ou un autre onglet ne peut plus rétrograder un brouillon déjà confirmé `SYNCED` vers `CONFLICT` ou `REJECTED` dans la file locale.
- Le QA ciblé vérifie explicitement ces deux invariants. Leur présence dans le code **ne vaut pas** certification navigateur, multionglets ou E2E physique ; scénarios POS-02, POS-05 et POS-07 restent à exécuter.
