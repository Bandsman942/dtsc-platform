# Hotfix — Import catalogue : modèles aller-retour et aperçu complet (13/11/2026)

**Statut : correctif #1143, candidat v1.17.1 en branche dédiée, NON FUSIONNÉ, NON DÉPLOYÉ.** Le routage ROUTES-01→04 est maintenant fusionné dans main via PR #1136. Les Quality Gates et l'E2E propriétaire restent obligatoires avant la fusion. Les Quality Gates et l'E2E propriétaire restent obligatoires. Aucune migration, aucun secret, aucun changement de quota (200 lignes/fichier).

## Problème observé

SHOP BCN a rencontré l'erreur générique « fichier Excel endommagé, non pris en charge ou non sûr » avec un classeur dérivé d'un modèle DTSC. La conversion CSV du même lot a retourné **200 lignes valides sur 200**, confirmant que les lignes métier et les codes étaient recevables. L'erreur XLSX précise demeure à qualifier par logs ; le service regroupait plusieurs causes dans un seul message.

Le bouton modèle historique produisait ses XLSX par le moteur de rapports `professional-export.ts`, alors que l'import repose sur `ExcelJS`. Le présent hotfix réduit ce risque de divergence structurelle en donnant aux **modèles importables** leur générateur natif ExcelJS et leur contrat de colonnes commun.

## Changements

1. **Téléchargement serveur** : `GET /api/enterprise/:organizationId/catalog/import?format=csv|xlsx`, accessible uniquement avec session, adhésion active à la même entreprise, module `CATALOG`, permission `write`, limite d'appels, journalisation expurgée, `Cache-Control: private, no-store`. Les unités et catégories sont chargées en lecture tenant-scoped depuis les référentiels actifs, sans faire confiance au navigateur.
2. **Modèle Excel** : feuille `Données` (en-têtes canoniques et validations contrôlées) et `Interprétation` (codes d'unités et catégories de l'entreprise). Aucun exemple importable. Export `ExcelJS` et réimport par **le même moteur**. Le modèle CSV partage les mêmes colonnes et la même langue ; il contient seulement l'en-tête.
3. **Aperçu obligatoire** : les 200 lignes peuvent être visualisées avant enregistrement, valides et erronées, avec SKU, type, catégorie, unité, prix, devise, état, erreurs contextualisées, recherche, filtre et pagination par 20 ; cartes mobiles et tableau desktop. Un changement de fichier efface l'aperçu précédent.
4. **Contrôles de doublons** : distinction entre conflit de nom+type dans le catalogue, conflit SKU existant, et doublon sur une autre ligne du même fichier (numéro de ligne affiché). Le serveur refait la validation au moment de confirmer et recherche les conflits dans la transaction sérialisable ; aucun doublon n'est ajouté.
5. **Sécurité et intégrité** : contrôles déjà en place (limite 2 Mo, ZIP sûr, formules/liens interdits, 200 lignes, codes isolés par entreprise, validation Zod, transaction atomique et audit) maintenus. Les cellules Excel avec mise en forme de texte enrichi **sans formule ni lien** sont désormais acceptées.
6. **Documentation et tests** : FR/EN, guide ERP, journal des changements, contrat QA aller-retour CSV et XLSX avec doublons et vérification des règles de sécurité.

## Tests automatiques

- `pnpm qa:catalog-roundtrip` (ou `node scripts/qa-hotfix-catalog-roundtrip-20261113.mjs`) : générer les modèles dans les deux langues, charger le XLSX via ExcelJS, écrire une ligne, la relire par le parseur d'import, contrôler les champs et références, vérifier CSV, doublons catalogue et intra-fichier, contrat de route et i18n.
- Le script est inclus dans `qa:regression`; exécuter aussi `pnpm prisma:generate`, `pnpm type-check`, `pnpm lint`, `pnpm build`, `git diff --check`, les Quality Gates existants et les tests métier d'ERP Catalogue.

## Scénarios E2E propriétaire (avant fusion)

1. **Après intégration du routage**, télécharger depuis SHOP BCN les deux modèles ; remplir des produits et services aux codes autorisés. Vérifier que les deux formats passent avec **zéro erreur** et que le nombre de lignes est exact. Vérifier le fichier exporté par le système, pas seulement un fichier créé à la main.
2. Prévisualiser les 200 lignes : recherche SKU, filtre Valides/À corriger, pagination jusqu'à la 10e page, cohérence mobile 320/360/375/390/414 px, desktop, FR/EN, mode sombre/clair. **Ne rien enregistrer** pendant la prévisualisation.
3. Introduire une référence SKU existante, un nom+type déjà présent et deux lignes dupliquées dans le fichier : vérifier les trois diagnostics et les numéros de ligne ; bouton Créer bloqué. Corriger et vérifier de nouveau.
4. Valider 200 lignes, importer, recharger le catalogue : 200 nouveaux articles, prix, suivi de stock configurés sans entrée de quantité. Réimporter à nouveau pour vérifier rejet. Tester l'organisation B : ses codes et articles restent isolés.
5. Tester formule, lien, fausse ZIP, plus de 200 lignes et plus de 2 Mo : erreurs explicites, aucune mutation, fichier conservé pour correction.
6. Pendant qu'un aperçu sain est affiché, créer ailleurs un même SKU, puis confirmer : échec atomique sans création partielle ; éviter les doubles clics.
7. Confirmer que `ROUTES-01→04` et les autres changements de routage n'ont pas été écrasés par le rebasage, puis exécuter le E2E propriétaire final. **Ne fusionner qu'après retour explicite « E2E #PR BON ».**

## Déploiement, dépendance et rollback

- Développement sur `fix/1143-catalog-import-roundtrip` depuis `main` vérifié ; PR en brouillon vers `main`.
- La PR reste **non fusionnée** pendant le chantier de routage ; après ce chantier, actualiser la base sur `main`, résoudre les conflits et relancer tous les contrôles.
- Aucune preview Vercel et aucun `vercel --prod`. Le déploiement Production est déclenché **uniquement après fusion sur main**.
- Retour arrière : revert du commit de merge après diagnostic, sans suppression des catalogues déjà importés.

## Limites

Le fait que les 200 lignes CSV passent prouve la validité de cet échantillon, pas une certification de chaque fichier XLSX externe. Les fichiers à structure inhabituelle doivent être testés séparément. L'import accepte **200 lignes par fichier**, pas 1 000 d'un coup ; les 1 000 tests SHOP BCN doivent être divisés en 5 lots.
