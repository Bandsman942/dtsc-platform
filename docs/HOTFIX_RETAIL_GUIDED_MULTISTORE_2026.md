# RETAIL multiboutique — Assistant opérationnel et clôture consolidée

Version : **1.6.0** · Branche : `hotfix/retail-guided-multistore-journey` · Cible : `main` exclusivement après QA, E2E final du propriétaire et PR verte.

## Architecture et contrat

- **Assistant guidé** `RETAIL_POS?section=store-setup` : six étapes — site, entrepôt, caisse, équipe, catalogue/stock, activation. Les trois premières créent leurs vrais enregistrements via les API canoniques `sites`, `warehouses`, `financial-accounts` ; les suivantes conduisent aux modules existants. Le progrès est **recalculé sur les données métier**, pas enregistré dans une seconde table. Les formulaires ne créent aucune donnée de démonstration automatiquement.
- **Préparation opérationnelle par magasin** : projection serveur `getRetailMultiStoreOnboarding()` avec huit contrôles : dépôt actif, caisse active en devise Retail, équipe autorisée, isolation, préparation comptable/Finance, catalogue, présence de stock positif si des articles sont suivis, facturation activée. Une boutique de services sans articles suivis n'exige pas de stock physique. Le comptage des lignes de stock positif est un signal minimum, pas une garantie de disponibilité de chaque produit ; le moteur POS continue les contrôles item par item.
- **Siège et ancien modèle** : lorsqu'au moins un site `STORE` existe, les parcours et le préflight d'activation vérifient ces seules boutiques, sans obliger le siège administratif à ouvrir une caisse Retail. Un ancien tenant dont tous les sites sont `BRANCH` ou autres conserve le préflight historique pour compatibilité.
- **Mes boutiques** : carte pour chaque affectation active, permissions, caisses visibles seulement aux opérateurs habilités à encaisser ou clôturer, liens vers POS, facturation et clôture. L'autorisation demeure contrôlée par les API ; changer `siteId` dans une URL ne crée aucun accès.
- **Clôture multiboutique** : route `GET /api/enterprise/:organizationId/retail/daily-close/summary?date=YYYY-MM-DD`, accessible aux seuls OWNER et ADMIN_ENTREPRISE / ADMIN_ENTERPRISE disposant aussi de l'accès module. Lecture groupée sur `EnterpriseRetailDailyClose` / `EnterpriseRetailDailyCloseLine`, bornée à une journée, tenant-scoped, sans total financier mélangé entre CDF et USD. Statuts SUBMITTED/APPROVED/REJECTED et nombre de lignes avec écart. Les clôtures individuelles restent créées via l'API canonique, obligatoirement pour un magasin précis (filtre et `siteId`). Les historiques sont filtrés côté serveur et la pagination existante est conservée.
- **Compatibilité caisse historique** : les anciennes caisses sans `siteId` restent utilisables avec l'isolation désactivée ; l'interface l'annonce explicitement. Dès qu'un vrai site est choisi, seules ses caisses sont utilisables. Les clôtures sans site et celles de sites archivés restent signalées dans le récapitulatif afin d'éviter des totaux silencieusement incomplets.
- **Sécurité** : aucun contournement MFA, de l'approbation indépendante, de l'entitlement ou de l'activation. Aucune migration de schéma et aucun second moteur de caisse/stock.
- **Performance** : chargements parallèles, groupement SQL côté Postgres pour la synthèse, données de catalogue sous forme de compteurs, composants mobile fluides et FR/EN.

## Données d'essai — SHOP BCN Multi 2026

Toutes les informations ci-dessous sont **fictives**. Les utilisateurs doivent disposer de comptes DTSC réels auxquels envoyer des invitations, avec leurs propres adresses contrôlées et sans partage de mots de passe. Utiliser une entreprise d'essai dédiée si la production contient des données comptables réelles : les ventes et clôtures ne sont pas automatiquement annulables.

### 1. Entreprise et magasins

Société `SHOP BCN MULTI TEST`, secteur `COMMERCE_RETAIL`, profil `RETAIL_TELCO_MOBILE_MONEY`, pays `CD`, fuseau `Africa/Kinshasa`, devise Retail principale `CDF` et fonctionnelle `CDF` pour ce scénario. Trois sites de type STORE :

| Boutique | Ville, repère fictif | Dépôt type RETAIL | Caisse CASH CDF, ouverture 0 |
| --- | --- | --- | --- |
| BCN-GOMBE | Kinshasa, Gombe Centre | DEP-GOMBE | CAISSE-GOMBE-CDF |
| BCN-LIMETE | Kinshasa, Limete 7e Rue | DEP-LIMETE | CAISSE-LIMETE-CDF |
| BCN-MATETE | Kinshasa, Matete Marché | DEP-MATETE | CAISSE-MATETE-CDF |

Les codes `BCN-*` sont des **repères de test**, pas des valeurs garanties pour `EnterpriseSite.code` ou `EnterpriseWarehouse.code` : l'application génère ses propres références. Ne pas tenter de saisir manuellement les UUID.

### 2. Membres et permissions (comptes fictifs à remplacer)

| Personne fictive | Magasin | Rôle Retail | Droits à affecter |
| --- | --- | --- | --- |
| Amina KABUYA | BCN-GOMBE | MANAGER | VIEW_STOCK, VIEW_SALES, PREPARE_INVOICE, COLLECT_PAYMENT, CLOSE_CASH, VIEW_REPORTS, MANAGE_STOCK |
| Patrick LUSAMBA | BCN-GOMBE | CASHIER | VIEW_SALES, COLLECT_PAYMENT, CLOSE_CASH |
| Grâce KAYEMBE | BCN-LIMETE | MANAGER | VIEW_STOCK, VIEW_SALES, PREPARE_INVOICE, COLLECT_PAYMENT, CLOSE_CASH, VIEW_REPORTS, MANAGE_STOCK |
| Junior MBUYI | BCN-LIMETE | INVOICER | VIEW_SALES, PREPARE_INVOICE |
| Ruth ILUNGA | BCN-MATETE | MANAGER | VIEW_STOCK, VIEW_SALES, PREPARE_INVOICE, COLLECT_PAYMENT, CLOSE_CASH, VIEW_REPORTS, MANAGE_STOCK |
| David NGOMA | BCN-MATETE | CASHIER | VIEW_SALES, COLLECT_PAYMENT, CLOSE_CASH |

Un administrateur propriétaire transversal valide les affectations. Prévoir **un autre membre éligible Finance** comme approbateur indépendant des clôtures ; le caissier ne peut valider sa propre caisse. Aucun compte ni invitation n'est créé automatiquement.

### 3. Catalogue et stock initial fictif

| SKU de référence | Article | Prix CDF | Stock Gombe | Stock Limete | Stock Matete |
| --- | --- | ---: | ---: | ---: | ---: |
| BCN-CAB-USB | Câble USB-C 1 m | 15 000 | 20 | 10 | 8 |
| BCN-CHARG-20W | Chargeur 20 W | 45 000 | 10 | 6 | 4 |
| BCN-COQUE-A | Coque téléphone universelle | 12 000 | 15 | 10 | 10 |
| BCN-FO-1GB | Forfait Internet 1 Go (service) | 3 000 | sans stock | sans stock | sans stock |

Créer la catégorie, l'unité de mesure et les prix via `CATALOG`. Pour reproduire exactement les montants ci-dessous, définir ces quatre articles d'essai **sans taxe et sans remise** (`taxable: false`) et conserver la devise CDF. Pour les trois articles physiques, activer `trackInventory`, créer les liens d'inventaire puis enregistrer les réceptions/mouvements positifs dans le dépôt **du magasin correspondant**. Les forfaits sont des services sans stock ; leur traitement Telco dépend aussi de la configuration de l'opérateur et du float.

### 4. Scénario de vente et résultat attendu

Chaque magasin réalise une vente réglée en CDF après ouverture de la session de **sa** caisse par le caissier affecté :

| Magasin | Ticket | Calcul | Encaissement CDF |
| --- | --- | --- | ---: |
| Gombe | 2 câbles + 1 chargeur | 2 × 15 000 + 45 000 | 75 000 |
| Limete | 1 chargeur + 1 coque | 45 000 + 12 000 | 57 000 |
| Matete | 3 coques + 1 câble | 3 × 12 000 + 15 000 | 51 000 |

**Total de contrôle manuel CDF : 183 000**, uniquement parce que tous ces tickets d'essai sont en CDF. Ne pas additionner ce contrôle à d'autres devises et ne pas considérer ce total comme un poste comptable produit par le tableau consolidé. Après ces ventes, les stocks théoriques deviennent : câble Gombe 18, Limete 10, Matete 7 ; chargeur Gombe 9, Limete 5, Matete 4 ; coque Gombe 15, Limete 9, Matete 7 (hors autres mouvements).

### 5. Clôture et contrôle

Dans `RETAIL_DAILY_CLOSE`, sélectionner successivement chaque boutique, déclarer le solde de la session tel que recompté, fournir les coupures (ex. `50000x1,20000x1,5000x1` pour 75 000), choisir un approbateur distinct, soumettre. L'approbateur confirme dans les espaces Finance pertinents puis valide. Pour un scénario d'écart, déclarer à Matete 50 000 au lieu de 51 000 **avec un comptage de coupures correspondant et un motif explicite** ; l'écart attendu est -1 000 CDF si le solde d'ouverture est zéro et qu'aucune autre opération n'a eu lieu.

Consulter la synthèse de la date : trois clôtures au total, trois boutique distinctes, statuts selon décisions, et une ligne d'écart pour Matete seulement. Le dashboard groupe **les nombres de clôtures et d'écarts**, sans additionner les différentes devises.

## Séquence E2E propriétaire (avant merge)

1. Créer la société d'essai ou utiliser un tenant Retail vide ; vérifier modules/sites/finance et devise fonctionnelle.
2. Créer les trois boutiques depuis l'assistant guidé, un dépôt et une caisse CDF chacune ; quitter/revenir pour vérifier la persistance des étapes.
3. Inviter les six utilisateurs réels de test, accepter les invitations, puis enregistrer les six affectations ; vérifier qu'aucune affectation n'apparaît avant acceptation.
4. Configurer plan comptable, journaux, exercice/période, mappings, catalogue, stocks et taxes applicables. Vérifier la readiness opérationnelle de **chaque** boutique.
5. Activer l'isolation puis la facturation via le circuit MFA normal ; aucune activation en contournant les préflights.
6. Se connecter comme caissier Gombe, vérifier son écran Mes boutiques, sa caisse Gombe et l'impossibilité de consulter/encaisser Limete ou Matete (y compris URL et API forgées).
7. Se connecter comme facturier Limete : vérifier facturation de Limete, absence de détails des caisses et absence de droits des autres magasins.
8. Ouvrir une session de caisse par magasin avec les véritables droits ; enregistrer les trois tickets, vérifier montants et stocks.
9. Soumettre une clôture par site, tester approbateur différent, rejet avec motif puis approbation, comparer la synthèse consolidée à la date métier.
10. Tester CDF + USD dans des caisses distinctes pour vérifier l'absence d'addition multidevise ; tester rôle sans permission, révocation, i18n FR/EN, thème, écran 320/375/768/1440 px et Chrome mobile.

## Vérifications techniques

`node scripts/qa-retail-guided-multistore-journey.mjs` ; `node scripts/qa-retail-multistore-onboarding.mjs` ; `node scripts/qa-hotfix-1042-site-staff.mjs` ; `node scripts/qa-hotfix-1044-retail-activation.mjs` ; `tsc --noEmit` ; lint ; régression ; build.

Ne pas confondre QA code et E2E utilisateur : **l'E2E propriétaire demeure requis avant fusion**. Ne pas créer de deployment Preview Vercel ; seuls les commits sur main déclenchent production.
