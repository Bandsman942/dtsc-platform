# Consolidation RETAIL POS — cinq lots, candidat 1.12.0 du 11 novembre 2026

## Politique de livraison

Branche `feat/1112-retail-pos-five-lots` uniquement. Ne jamais déployer une branche de travail vers Vercel (production uniquement depuis `main`, previews désactivées). Le candidat attend les tests CI, les E2E métier et une validation humaine explicite avant fusion. Cette documentation distingue les capacités implémentées des limites restantes.

## Lot 1 — Offline sécurisé et facturation Finance

- `buildRetailOfflineSnapshot` sélectionne l'autorisation `PREPARE_INVOICE` si `invoiceCheckoutEnabled` est activé, `COLLECT_PAYMENT` sinon.
- Le snapshot inclut `checkoutMode = FINANCE_DRAFT | LEGACY_SALE`. Un snapshot Finance exclut les articles avec soldes suivis par lots : un traitement offline sans identifiant de lot ne peut être légitimement facturé.
- IndexedDB chiffre les brouillons. Le retour en ligne et la réouverture de l'onglet relancent la reprise des opérations en attente.
- La synchronisation Finance revalide accès boutique, version/validité du snapshot, prix, remises et taxes, puis appelle `prepareRetailInvoice`. Seule une **facture en brouillon Finance** est créée. Le personnel habilité doit ensuite soumettre, faire approuver, émettre et encaisser la facture dans le circuit canonique.
- Une ancienne vente directe hors ligne ne devient jamais implicitement une facture Finance : elle reste en conflit à rapprocher. Aucun paiement cash automatique lors de la synchronisation Finance.
- **Limite encore ouverte** : l'interface privée PWA ne se recharge pas entièrement hors réseau ; pour l'instant le POS doit avoir été ouvert avant la coupure. La clé locale historique n'est pas encore isolée par utilisateur, et les scanners/lot tracking hors ligne exigent un chantier dédié.

## Lot 2 — Commerce et Finance

- Le suivi des paiements distingue les allocations Finance canoniques des transactions historiques et ajoute recherche, plage de dates, boutique et pagination.
- Les commandes omnicanales disposent de filtres et d'une pagination serveur, sans duplication des objets `EnterpriseSalesOrder`, réservations ou paiements.
- **Limite encore ouverte** : une vraie orchestration OMS multi-source (web, WhatsApp, marketplace), le registre commercial complet avec pagination serveur pour promotions/règles de prix/retours Finance, les exports premium et l'historisation canonique des promotions sur factures ne sont pas livrés par ce candidat. La logique Finance reste autoritative, sans contournement.

## Lot 3 — Stock et équipements

- Équipements : interface d'administration par boutique, formulaire conforme à l'API POST, recherche et pagination serveur, visibilité restreinte au périmètre de boutique des opérateurs.
- Les modes NETWORK et NATIVE_BRIDGE ne sont plus déclarés « prêts » du seul fait de l'existence du profil ; l'interface distingue les capacités de navigateur de la preuve d'un appareil réellement appairé.
- Alerte de péremption : filtres serveur par lot/article, dates, gravité, dépôt ; liste de faibles stocks paginée.
- Politique ALLOW/WARN explicitement étiquetée comme permissive ou indicative. Les contrôles BLOCK/FEFO et transfert `CONFIRMED` existants restent inchangés.
- **Limite encore ouverte** : un logiciel pilote/companion et l'intégration matérielle réelle, les workflows de quarantaine et l'avertissement bloquant/approbation des lots ne sont pas considérés comme terminés.

## Lot 4 — UI/UX

- Navigation publique au survol des menus desktop, tout en conservant clic, clavier et fermeture progressive.
- Suivi de paiements, alertes de péremption, périphériques, commandes omnicanales : filtres compacts, menus contextuels et pagination.
- **Limite encore ouverte** : refonte exhaustive tarification/promotions/retours et exports Excel/PDF premium sur toutes les sections.

## Lot 5 — Mise en service et validation

- Le score 15/15 est un score du **socle**. Diagnostics additionnels non certifiants : codes fiscaux et taux actifs, blocages du mode offline, nombre de profils matériels et numérotation non attestée.
- Seul le country pack RDC est réellement présent ; aucune certification artificielle de pays supplémentaire.
- Contrôles CI proposés : `node scripts/qa-retail-five-lots-20261111.mjs`, `pnpm type-check`, tests historiques, suites Shop E2E, protection anti-régression et `pnpm build`.

## Critères de recette E2E à valider

1. Boutique A/B, profils caissier/facturier, révocation d'accès et absence de fuite inter-boutiques.
2. Snapshot Finance, coupure, brouillon local, reprise réseau, **facture brouillon unique**, validation/émission/encaissement dans Finance, absence de double écriture et de paiement avant émission.
3. Ancienne file offline tentant de rejouer un cash sale avec Finance actif : conflit conservé sans émission automatique.
4. Recherche/pagination statut/date des paiements, commandes, alertes, appareils et permissions.
5. Prix TTC/HT, taxe de catalogue, remise promotionnelle et écritures comptables : rapprochement sur facture test.
6. Desktop/mobile/FR/EN ; menus desktop au survol et au clavier ; aucun déploiement depuis la branche.

**État : candidat en développement et vérification. Ne pas marquer les cinq lots comme achevés avant fermeture des limites ci-dessus.**
