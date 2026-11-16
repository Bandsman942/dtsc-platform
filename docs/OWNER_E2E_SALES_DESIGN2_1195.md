# OWNER E2E — Issue #1195 · Devis, commandes et livraisons Design 2.0
**Statut : CANDIDAT, validation propriétaire NON EXÉCUTÉE.** Ne pas fusionner tant que les Quality Gates finales ne sont pas vertes et que le propriétaire n'a pas confirmé `E2E final #PR BON`.

## Environnement de recette
- Entreprise A : « SHOP BCN MULTI TEST » avec un administrateur, un commercial, un préparateur de commande, un facturier Finance, un caissier, un client fictif (« Client Test A »), un article stockable et un service.
- Entreprise B : autre organisation avec un client et un devis différents. Aucun document de B ne doit être accessible à A.
- Référentiels : Catalogue, CRM/tiers, entrepôt, configuration taxes et devises, Finance facturation/créances et permissions configurées réellement. Ne jamais forcer les états en base de production.
- Vérifier Chrome desktop, Android/Samsung Internet, PWA si applicable, **320/360/375/390/414/768/1024 px**, clair/sombre, FR et EN.

## 1. Design, navigation et exports
1. Ouvrir SALES_QUOTES_ORDERS avec au moins 28 devis et 28 commandes de test, ou fixtures validées. Les listes sont immédiatement visibles sous la barre de filtres ; le rail KPI est horizontal sur mobile, 5 indicateurs ont des couleurs distinctes, aucun débordement horizontal ni bouton masqué par la barre Android.
2. Filtrer par référence, titre, code ou nom de **client**. Vérifier que le serveur retourne les mêmes résultats que l'UI, y compris recherche combinée avec statut. Changer onglet remet statut/page à leur valeur correcte.
3. Filtrer par statut (boutons tactiles), aujourd'hui, semaine, mois, date précise et intervalle avec calendrier. Pagination page 1/2 puis retour. Aucune donnée client n'est exclue silencieusement à la limite de recherche ; message d'affinage si trop de clients.
4. Exporter les résultats **CSV, XLSX, PDF** après filtres en utilisant plusieurs pages. Contrôler l'entête entreprise, date d'édition, colonnes professionnelles, devise, montants et absence d'extraction de documents hors filtres/boutiques/organisation. Vérifier limite explicite de 1000 lignes.

## 2. Impression des devis — sept statuts
5. Sur un devis `DRAFT`, vérifier **Brouillon — non validé** ; `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONVERTED`, `CANCELLED` : ouvrir chaque aperçu via le menu « … » et la fiche. Statut exact, bandeau d'invalidité pour les états terminés refusés/annulés/expirés, jamais de facture fictive.
6. Sur A4 et « Enregistrer en PDF », vérifier l'entreprise A, son logo enregistré, client réel, référence/titre, dates, validité, lignes, quantités, prix unitaires, remises, taxes, total du serveur, conditions rédigées avec sauts de ligne, pied de page, lisibilité multi-pages et absence de débordement.
7. Modifier le statut d'un devis via le parcours métier autorisé, rouvrir l'aperçu : il doit montrer **le nouvel état** sans ancienne copie servie depuis le cache. Vérifier que l'impression seule ne crée ni commande, ni facture, ni écriture, ni paiement.

## 3. Commandes et livraisons — huit statuts
8. Ouvrir des commandes réellement présentes aux états `DRAFT`, `PENDING_APPROVAL`, `CONFIRMED`, `IN_FULFILLMENT`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CLOSED`, `CANCELLED`. Si un état n'est pas atteignable sans fixture, le noter NON EXÉCUTÉ et ne pas inventer le succès.
9. Imprimer chaque bon de commande (menu, fiche) : titre « Bon de commande client », état explicite, numéro, client, devise, quantités commandées/livrées, totaux historiques et références de livraisons réellement enregistrées. Statut brouillon/en attente/annulé avec avertissement approprié.
10. Pour une commande confirmée, enregistrer une livraison partielle d'article via l'entrepôt réel. Contrôler le reliquat, la livraison idempotente, les mouvements d'inventaire, lots/stock selon politiques existantes ; tenter un dépassement et un second envoi du même identifiant : pas de double mouvement. Réimprimer la commande après livraison.
11. Pour un service, utiliser le choix explicite « Prestation / livraison de service » ; ne jamais créer un mouvement physique de stock fictif ni considérer un bon de commande comme une facture. **Attention :** la synchronisation physique du stock des livraisons non Retail de produits stockables est une limitation existante documentée dans l'Issue #1196 ; noter ce scénario comme NON CERTIFIÉ, sans inventer une preuve de mouvement.

## 4. Communication intermodules et sécurité
12. Partir d'un client CRM et d'un article du catalogue ; créer un devis et accepter puis convertir une fois. Vérifier identité du client, prix/taxe acceptés, lien `EnterpriseQuote.quoteId/convertedOrderId` — plus précisément `EnterpriseSalesOrder.quoteId` et `EnterpriseQuote.convertedOrderId` — aucune double commande sur retry.
13. Depuis la fiche commande, accéder à **Factures clients** et, avec le droit Finance, sélectionner la commande comme source du brouillon de facture. Vérifier les contrôles de la facture, puis son émission avec permission/approbation, créance unique, encaissement/allocation et écritures Finance, sans double comptabilisation ; retour au module ventes : le bon de commande n'est pas lui-même une facture.
14. Retirer le droit SALES_QUOTES_ORDERS ou changer d'organisation : l'API d'impression de A doit refuser à B, et inversement (403/404) même en ouvrant directement les URLs. Vérifier absence d'interprétation HTML des caractères `<script>` dans une description fictive, no-store, audit d'accès, export filtré soumis à RBAC, erreurs compréhensibles.

## Preuve finale
- Joindre références fictives, statut, navigateur, largeur écran, captures anonymisées, fichiers échantillons CSV/XLSX/PDF, résultats QA GitHub sur SHA exact, et écarts éventuels.
- Les **tests de source statiques** ne valent pas acceptance navigateur.
- Signature attendue : `E2E final #<numéro-de-PR> BON`. Après accord, fusion `main` → Vercel Production auto → vérifier READY sur le SHA fusionné. **Aucun déploiement de branche.**
