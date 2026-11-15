# #1187 — Retail return governance, multi-currency checkout, owner permissions and supplier orders

**Date:** 15 novembre 2026 · **Candidat:** v1.18.3 · **Issue:** #1187 · **Branche:** `fix/1187-retail-returns-fx-owner-procurement-ux`.

## Livraison scindée par sécurité

### Lot prêt pour validation CI

1. **Propriétaire réel** : `Organization.ownerUserId` ou membre de rôle `OWNER` sur la même entreprise, et membership ACTIVE non supprimé. Les administrateurs non propriétaires ne peuvent pas déléguer les exceptions.
2. **POS multi-devises** : toute ligne conserve son prix catalogue d'origine et sa devise ; la facture utilise la devise **fonctionnelle Finance**, et chaque prix étranger est converti au taux Finance actif applicable le jour de la facturation, direct ou inverse. Le contexte tarifaire et l'instantané FX sont enregistrés par ligne comptable. Prix, TVA et total sont recalculés par le serveur et contrôlés lors de la transaction d'émission ; taux manquant = blocage explicite, aucun taux libre saisi côté client. Prévisualisation PRO FORMA avec devises, taux et montants convertis. Le flux ventes Retail historique reste inchangé.
3. **Commandes fournisseurs** : la liste peut identifier l'approbation `EnterprisePurchase` PENDING assignée à l'utilisateur actuel, lui proposer « Examiner et décider », lire la version de soumission puis APPROVE/REJECT par l'API commune (contrôle de relecture `PREPARE_REVIEW`, revision et RBAC). Aucun statut fictif et aucune réception ou écriture comptable à la décision. Rail de filtres par statut, recherche, dates et exports premium CSV/XLSX/PDF paginés côté serveur, mobile/desktop, FR/EN.
4. Handlers RETAIL regroupés par #05A **inchangés** : nouveau endpoint `retail/invoice-fx-preview` pour cotation FX des factures, ne détourne pas les règles du POS historique.

### Reste à implémenter dans #1187 — NE PAS présenter comme livré

- **Annulation / avoir des factures partiellement payées, avances, prestations non stockées et commandes mixtes**, même si les factures totalement réglées sont déjà traitées par le circuit historique. Ce n'est pas un simple changement de condition `PAID`.
- Le moteur actuel utilise `request.refundAmount` pour le montant de **l'avoir ET du remboursement**. Une facture à 100 dont 40 sont encaissés doit produire un avoir 100, un remboursement 40 et une créance résiduelle correcte. Il faut séparer `creditAmount` et `refundPayoutAmount` avec migration additive versionnée, contrôle fiscal (TVA, CDF/USD), compte d'origine, comptabilité et stocks ; revalider la séparation des acteurs.
- Les factures impayées ne doivent produire aucun paiement sortant fictif ; le remboursement nul passe uniquement par l'avoir, avec liquidation et traces Finance. L'inspection ne doit pas exiger un mouvement physique pour une prestation pure. Ne pas désactiver les garde-fous existants avant E2E transactionnel PostgreSQL.

## Parcours E2E proposé

- **Rôle**: acteur admin non propriétaire = 403 ; propriétaire `ownerUserId` actif avec rôle administratif historique = peut cocher ; révocation immédiate ; manager choisi dans la bonne boutique, autre boutique refusée.
- **Devises**: config Finance CDF ; catalogues USD et CDF sur même facture ; taux USD→CDF enregistré : affichage d'origine/taux/date et somme CDF. Taux inversé CDF→USD si seul sens inverse disponible, absence de taux = 409 ; changements de taux entre aperçu et validation = 409. TVA, arrondis, idempotence, stock et écriture par devise.
- **Achats**: soumission par préparateur à un validateur ; l'assigné voit « Examiner et décider », valide après lecture ou rejette avec motif, un tiers voit aucun bouton et API refuse ; ancien compte désactivé, version modifiée ou seconde décision = refus. Validation seule ne commande ni ne réceptionne ni ne paie.
- **Design 2.0**: Android 320/360/390/414 et desktop, FR/EN, clair/sombre, recherche intelligente, dates exactes, exports CSV/XLSX/PDF sur toutes les pages autorisées, aucun débordement.

## Sécurité et exploitation

Aucune production ni fusion avant Quality, Migration, tous gates et **validation E2E final BON** du propriétaire. La présente PR a **un périmètre partiel par rapport à #1187** et ne doit pas clôturer l'issue. Aucun appel à des services FX externes ni nouvelle variable d'environnement. Aucune migration dans les trois premiers lots.
