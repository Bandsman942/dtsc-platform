# Guide utilisateur — Référentiels, CRM et contrats

## Créer un client ou une organisation

Ouvrez **Tiers et clients**, choisissez **Personne** ou **Organisation**, renseignez les informations utiles puis vérifiez les correspondances proposées. Confirmez manuellement la création si une fiche similaire existe. Pour une personne, la liaison à un compte DTSC reste facultative.

## Inviter une personne

Dans la section **Relation DTSC**, choisissez le type d’invitation, saisissez l’adresse exacte communiquée par la personne et précisez la finalité. L’invitation ne révèle pas publiquement si un compte existe. La personne accepte ou refuse depuis son compte.

## Révoquer une relation

Ouvrez **Mes relations d’entreprise**, sélectionnez la relation puis retirez l’autorisation. Les accès sont coupés immédiatement ; la fiche métier et les historiques légitimes restent conservés.

## Créer un produit ou service

Créez d’abord une catégorie et une unité, puis ajoutez l’article. Renseignez le prix, la devise et la fiscalité. Une modification tarifaire conserve l’ancien prix dans l’historique.

### Importer plusieurs produits ou services en CSV / Excel

1. Dans **Produits et services**, configurez d’abord les **unités de mesure** et, si besoin, les **catégories**. Les droits d’écriture sur le catalogue sont requis.
2. Téléchargez **Modèle CSV** ou **Modèle Excel** : les noms de colonnes sont traduits selon la langue de l’application. Le modèle Excel comporte une feuille **Données** à remplir et une feuille **Interprétation** rappelant les codes des unités et catégories de votre entreprise.
3. Ajoutez au maximum **200 lignes de produits ou services** par fichier. Valeurs de type : `PRODUCT` / `SERVICE` (ou Produit / Service). Pour l’unité et la catégorie, utilisez leurs **codes**, jamais les identifiants techniques. Les montants sont positifs avec deux décimales maximum ; pour les options booléennes, utilisez `Oui/Non` ou `Yes/No`. Le suivi physique du stock n’est autorisé que pour les produits.
4. Cliquez **Importer un fichier**, choisissez le fichier rempli puis **Vérifier le fichier**. Corrigez les erreurs indiquées par ligne (références manquantes, doublons, devise, montant, fiscalité) avant de réessayer.
5. Une fois toutes les lignes valides, cliquez **Créer N articles**. L’import est atomique : si une ligne échoue au moment de la sauvegarde, **aucun article du lot** n’est créé. Les prix et fiches de suivi de stock sont créés via le service métier existant.

Une importation répétée du même fichier déclenche un avertissement de doublon : ne répétez pas une sauvegarde en cas de connexion incertaine sans vérifier le catalogue. Les données restent isolées par entreprise. Le modèle CSV contient les colonnes sans fiches d’exemple ; supprimez ou remplissez les lignes vides avant l’import.

## Configurer une implantation

Créez un site, rattachez-y un entrepôt, puis ajoutez ses zones et emplacements. La vue hiérarchique reste utilisable sur mobile.

Pour le fuseau horaire du site, recherchez et sélectionnez un **fuseau IANA** (par exemple `Africa/Kinshasa`, `Africa/Lubumbashi`, `Europe/Paris`) dans la combobox. Une chaîne arbitraire n’est plus acceptée par l’API.

## Gérer le pipeline

Créez un prospect, affectez un responsable et une prochaine action. Utilisez la vue liste ou pipeline. Lors de la conversion, choisissez une fiche existante ou confirmez la création d’une nouvelle fiche.

## Créer et valider un contrat

Sélectionnez le client, renseignez les dates, la valeur et le renouvellement, puis enregistrez. Soumettez ensuite à l’approbateur désigné. Les actions disponibles dépendent du statut et de vos permissions.
