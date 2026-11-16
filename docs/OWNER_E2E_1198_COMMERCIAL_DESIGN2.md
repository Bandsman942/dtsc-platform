# OWNER E2E — #1198 | Devis Prisma + cinq modules ERP en Design DTSC 2.0

**Statut : CANDIDAT NON CERTIFIÉ.** Aucune fusion avant CI verte au dernier SHA et déclaration explicite **E2E final #PR BON**.

## Préparation des données d'essai
- Deux organisations isolées **A = SHOP BCN MULTI TEST** et B = entreprise factice distincte ; deux utilisateurs avec rôles différents pour A et B.
- Un tiers client **DIMER (donnée de test)**, un prospect sans compte ChatGPT/DTSC, un fournisseur, un catalogue d'au moins deux produits et un service, une opportunité, un contrat soumis à validation indépendante ; offres et opérateurs TELCO disponibles en USD et CDF.
- Préparer deux lignes d'un devis CDF : « Chargeur 20 W » × 10 à 45 000 CDF, « Chargeur Anker » × 9 à 19 900 CDF. Total attendu sans remise/taxe = **629 100 CDF**. Le serveur doit calculer les montants, pas le navigateur.
- Au moins 65 tiers, articles, prospects, opportunités, contrats et opérations Télécom de test afin de vérifier pagination, filtres multipages et exports ; une seconde devise pour vérifier qu'on n'additionne pas CDF et USD comme une seule monnaie.
- Exécuter en environnement de recette isolé, sans écrire de fausses opérations réelles dans la caisse ou la comptabilité de production.

## 1. Incident Prisma et chaîne commerciale
1. Ouvrir « Nouveau devis », sélectionner le tiers DIMER, devise CDF, validité 22/11/2026 et les deux lignes. Enregistrer. Vérifier réponse HTTP 201, création d'un seul devis et deux lignes exactes en base, devise/taxes/remises/totaux fidèles. **Aucune PrismaClientValidationError**, et aucun « Unknown argument organizationId ».
2. Sauvegarder un autre devis puis modifier son état autorisé de DRAFT à SENT puis ACCEPTED, convertir en commande. Vérifier création des lignes de commande, liens `EnterpriseQuote.convertedOrderId` et `EnterpriseSalesOrder.quoteId`, total et devise identiques, sans doublon de commande après retry.
3. Vérifier contrôle B2B : une ligne catalogue d'une autre entreprise est refusée, aucune écriture hors tenant, droits SALES_QUOTES_ORDERS appliqués ; pas de facture ni de paiement automatiquement créé par un devis.
4. Tester un formulaire incomplet et un article introuvable ; l'erreur reste contextualisée, les données du formulaire restent saisies, aucune trace Prisma ou identifiant technique secret dans un toast.

## 2. Tiers, prospects et clients — CRM_CUSTOMERS
5. Vérifier 4 KPI colorés, tabs type/rôle, rail ACTIVE/INACTIVE, recherche nom, email et code, calendrier date exacte/période ; le filtre serveur et la pagination sont cohérents ; 65 fiches donnent plus d'une page.
6. Exporter CSV / XLSX / PDF après filtrage sur client et date. Contrôler en-tête de l'entreprise, données de toutes les pages filtrées, colonnes métier, zéro résultat interentreprise, limite 1000 signalée. Tester la fiche 360°, consentement identités sans compte DTSC obligatoire et lien vers devis/contrats.

## 3. Produits et services — CATALOG
7. Vérifier Produits / Services / Catégories / Unités, KPI colorés, rail de statut et calendrier pour la liste des produits/services uniquement. Les importations de modèles CSV/XLSX et unités restent opérationnelles ; aucun lot ou péremption n'est géré dans la création de l'article.
8. Exporter plusieurs pages de catalogue filtré en CSV/XLSX/PDF. Contrôler SKU, prix indicatif, coût, devise, catégorie, suivi de stock et statut. Le stock reste géré dans INVENTORY_LOGISTICS ; pas de mouvement physique fictif.

## 4. Prospects et opportunités — CRM_PIPELINE
9. Vérifier le tableau de pipeline, les vues Leads/Opportunities, les étapes métiers, filtres de statuts et dates appliqués côté API. La recherche trouve aussi le nom du tiers lié sur les opportunités. Exporter les leads et les opportunités séparément avec probabilité, échéances, valeurs indicatives et devise.
10. Convertir un prospect validé sans nouveau compte global, préserver le tiers canonique. Créer une opportunité, associer un devis et s'assurer que la fiche client, l'opportunité et le devis utilisent les mêmes références métier.

## 5. Contrats commerciaux — CONTRACTS
11. Vérifier les KPI colorés, états DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/SUSPENDED/EXPIRED/TERMINATED/CANCELLED, rail horizontal touch, dates de **création** et recherche par titre/référence/nom du tiers. Les exports CSV/XLSX/PDF incluent référence, client, type, statut, montant/devises, période, version, toutes les pages filtrées.
12. Soumettre un contrat à une personne APPROVER habilitée différente du demandeur ; approuver, activer, suspendre, renouveler et vérifier pièces privées, historique, versionnement et messages de refus. Aucun statut ne change directement en frontend.

## 6. Télécom & forfaits — TELCO_TOPUPS
13. Vérifier les onglets opération, historique, configuration, rapports ; KPI colorés par devise. L'historique doit afficher une liste paginée de toutes les recharges autorisées, et non seulement `dashboard.recent.topups`. Recherche numéro, offre, référence opérateur, téléphone **masqué** ; statuts SUCCESS/FAILED/REVERSED et date précise/intervalle.
14. Exporter CSV/XLSX/PDF des recharges filtrées : opérateur, offre, prix, coût, marge, devise, statut, date, référence et numéro masqué. Vérifier aucune révélation de téléphone complet, aucune combinaison USD + CDF sans règle explicite, jamais de mutation déclenchée par l'export.
15. Vérifier la saisie d'une recharge idempotente et une annulation autorisée ; l'historique se rafraîchit, les effets caisse/float/Finance viennent du service canonique et le retry ne poste pas deux fois. Confirmer les liens vers catalogue, POS, caisse, trésorerie.

**Contrôle multidevise obligatoire :** vérifier séparément CDF et USD dans les indicateurs et exports, sans consolidation implicite de montants non convertis.

## 7. UX, permissions et sécurité
16. Essayer sur desktop Chrome et mobile Samsung Internet / PWA à 320, 360, 375, 390, 414, 768, 1024px en **clair/sombre FR/EN**. Tester navigation latérale, retour, menus, rails tactiles défilant sans scroll global, formulaire plein écran, focus clavier, toasts de succès/erreur et performance sur connexion lente.
17. Tester le compte lecture seule : extraction uniquement des listes autorisées, aucune création/modification. Tester l'entreprise B : toute URL directe, recherche, filtre et export doit être refusé pour A (403 ou 404). Aucune fuite par un endpoint client ou télécom ; code et rôle de l'entreprise vérifiés côté API.
18. Vérifier le plafond d'export à 1000 éléments, absence de « premier page seulement », dates invalides/fin antérieure au début donnant une erreur 400 sans requête Prisma abusive.

## 8. Livraisons et comptabilité — périmètre
- La refonte ne doit pas dupliquer facture, encaissement, écriture, inventaire, opération Télécom, contrat ou tiers.
- La lacune existante des mouvements physiques de livraisons non Retail demeure suivie par **Issue #1196**. Ne pas la certifier corrigée ici.
- Les exports professionnels sont des rapports. Ils ne constituent ni une facture fiscale, ni une signature, ni une preuve de paiement.

## Preuves et décision
Joindre : liens GitHub Actions du SHA final, sorties QA dédiées, TypeScript/lint/build/régression, références des opérations fictives, captures et échantillons de CSV/XLSX/PDF, tests tenant A/B et navigateurs. Les QA statiques ne remplacent pas une recette navigateur. En cas de test non exécuté, déclarer NON EXÉCUTÉ.

**Validation finale attendue : `E2E final #<PR> BON`.** Après validation : squash merge dans main et déploiement Vercel Production automatique. Aucun preview ni déploiement de branche.
