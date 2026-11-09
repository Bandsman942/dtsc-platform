# Hotfix RETAIL POS — factures, paiements, stocks, caisses et pilotage

**Version candidate : 1.7.0** · 9 novembre 2026 · **Branche :** `fix/retail-pos-approval-payment-stock-session-kpi` · **Statut :** en attente d'E2E final du propriétaire, pas fusionnée.

## Factures / encaissements

- Le registre affiche le nom du validateur Finance assigné à une facture `PENDING_APPROVAL`, depuis l'affectation `EnterpriseApproval` active. Il n'invente pas de nom lorsque l'affectation est manquante.
- La soumission Finance crée déjà une notification personnelle et une tâche de push ; le contenu de la notification identifie maintenant la facture et renvoie à sa validation.
- La file du caissier **exclut intentionnellement** les brouillons, factures en attente de validation et factures déjà soldées. Seules `ISSUED`, `PARTIALLY_PAID`, `OVERDUE` sont encaissables. Le message vide explique la chaîne *préparer → valider → émettre → encaisser*.
- Recherche par numéro ou description d'article, boutique, date initiale/finale ou date exacte ; filtrage et pagination côté serveur, sur les deux postes.
- Les dates civiles des factures utilisent le fuseau de la boutique sélectionnée (ou celui de l'entreprise pour le registre transversal), avec bornes UTC calculées correctement y compris lors des changements d'heure.
- Les impressions A4 et ticket 80 mm réutilisent le logo privé de l'organisation via son proxy authentifié, sans URL arbitraire injectée dans le HTML. Les documents en brouillon conservent leur filigrane de non-émission.

## Source comptable et trésorerie

- Le POS crée uniquement un `EnterprisePayment` DRAFT Finance et un lien `EnterpriseRetailInvoicePaymentProposal` ; il ne maintient pas une seconde créance ou trésorerie.
- Lors de la **confirmation Finance** d'un paiement Retail lié, son encaissement, mouvement de caisse, mouvement de trésorerie, mise à jour de solde, allocation de créance et journal d'allocation sont désormais effectués dans **la même transaction sérialisable** ; en paiement total, la délivrance du stock et les avantages omnicanaux restent dans cette transaction.
- Une indisponibilité de stock ou une créance devenue insuffisante annule **toute** la confirmation ; aucun paiement de trésorerie isolé ne doit être enregistré.
- L'endpoint historique d'affectation subsiste pour les opérations anciennes non encore affectées. Ne pas cliquer de nouveau sur les paiements déjà automatiquement affectés.
- Les journaux comptables doivent disposer des règles `CUSTOMER_PAYMENT_CONFIRMED` et `PAYMENT_ALLOCATION_CONFIRMED`. Les sous-comptes et journaux de chaque entreprise restent sous le contrôle de Finance.

## Stocks et péremptions

- Le catalogue exploite les champs existants `minimumQuantity`, `reorderQuantity`, `lotTracking`, `expiryTracking`. La fiche de création/édition propose ces réglages ainsi qu'un **lot initial facultatif**, par dépôt, numéro et date de péremption.
- L'enregistrement d'un lot ne crédite **jamais** artificiellement le stock. Les quantités sont entrées par ajustement soumis à approbation, avec choix du lot ; les mouvements doivent préciser un lot daté pour les articles suivis en péremption.
- Activer les lots pour un article possédant des stocks historiques sans lot est refusé avec une explication de régularisation préalable.
- Alertes de péremption par dépôt, et alertes de stock faible incluant les articles à zéro stock, périmètre strict de la boutique autorisée. Les 80 alertes de stock faible les plus urgentes sont visibles ; les alertes de péremption sont paginées.
- Le mécanisme de consultation couvre les boutiques autorisées sans exiger un dépôt artificiel pour le propriétaire. Les dates et lots appartiennent au stock d'un dépôt, pas au produit global : deux boutiques peuvent posséder des lots/date différents pour le même SKU.

## Sessions de caisse et habilitations

- Permission POS distincte `OPEN_CASH` ; les affectations de boutique de l'administration RETAIL sont la référence, y compris lorsque l'utilisateur entre via le module Finance commun sur une entreprise avec isolation RETAIL active.
- Le compte financier sélectionné impose son site : impossible d'ouvrir une session pour une boutique choisie dans le navigateur mais étrangère au compte.
- Les anciens droits explicitement enregistrés **ne sont pas élargis automatiquement** : l'administrateur doit accorder `OPEN_CASH` aux caissiers devant ouvrir une nouvelle session.
- Affichage du nom de l'ouvreur et de l'horodatage d'ouverture. Une clôture soumise affiche l'auteur de soumission et sa date ; la clôture validée affiche le responsable de validation et sa date (deux actes distincts).

## Pilotage multi-boutiques

- Réservé à l'administrateur/propriétaire ; filtres de période rapide, jour exact, plage début/fin, boutique et devise, graphiques compacts interactifs par boutique et métrique.
- Exports Excel et PDF réels et professionnels sur les mêmes données filtrées, sans conversion implicite des devises. Les ventes POS, ses encaissements, les factures Finance émises, les allocations à date et les dépenses restent **des indicateurs séparés**, sans double comptage.
- Les exports préexistants du grand livre provisoire Excel/PDF restent disponibles séparément ; les graphiques de PDF opérationnels ne comparent pas des montants en devises différentes sans sélection d'une devise.
- Les indicateurs de résultat comptable demeurent **provisoires** : aucune marge certifiée n'est inventée lorsque des lignes historiques sont sans boutique.

## Scénarios de validation E2E avant fusion

1. Facturier Gombe prépare une facture et l'assigne à un validateur autorisé ; voir `À valider (Nom)` et la notification du bon destinataire. Un autre utilisateur ne peut pas la valider.
2. Vérifier l'absence dans Encaissements avant émission, puis la présence **après** validation et émission, avec filtre par date exacte, plage et numéro/produit (au moins 11 factures pour vérifier la pagination).
3. Caissier Gombe crée un paiement partiel CDF, Finance l'approuve et le confirme : valider créance, facture, trésorerie, mouvement de caisse et journal **sans** bouton d'affectation supplémentaire. Répéter en solde intégral ; vérifier la sortie de stock et l'idempotence.
4. Paiement concurrent dépassant le solde ou stock épuisé : le paiement demeure non confirmé et la trésorerie ne bouge pas.
5. Impression A4 et 80 mm avec logo téléversé, écran en français et anglais, statut pro-forma/draft bien visible.
6. Créer un produit avec seuil 3, lot `BCN-TEST-01` expirant dans 5 jours, enregistrer un ajustement entrant de 2 et le faire approuver. Voir les deux alertes (stock faible et péremption). Tester un lot périmé et l'interdiction d'un mouvement sans lot.
7. Retirer `OPEN_CASH` à un caissier tout en laissant `COLLECT_PAYMENT` : les endpoints POS **et Finance** doivent refuser toute nouvelle ouverture. Rétablir le droit ; session ouverte puis clôturée/validée par deux acteurs avec noms et dates.
8. Comparer boutiques Gombe et autres, filtrer jour exact, plage, devise ; Excel/PDF doivent reproduire le filtre et ne pas additionner CDF/USD.

## Politique de diffusion

Ne pas fusionner dans `main`, déployer en production ni appliquer une migration manuelle sans E2E final « BON » du propriétaire. Les déploiements Vercel restent déclenchés exclusivement depuis `main` après CI validée.
