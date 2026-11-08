# Hotfix #1075 — Contrats de formulaires, catalogue groupé, toasts

Date : 8 novembre 2026. Candidat v1.6.4. Issue : #1075.

## Objet et périmètre

- **Console Administration DTSC** : formulaire de création d’une entreprise cliente. Succès serveur → fermeture, remise à zéro et toast nommant l’entreprise et l’administrateur choisi. Échec de validation/réseau → formulaire conservé et erreur contextualisée. Si l’invitation est enregistrée mais que la notification interne échoue, avertissement dédié. L’invitation `PENDING` ne signifie **pas** email envoyé ou accepté.
- **Sites et entrepôts** : remplacement des champs texte de fuseau horaire des formulaires création/modification par une combobox IANA avec recherche clavier et défilement. Contrôle serveur `isSupportedTimeZone` basé sur l’ICU disponible sur le serveur.
- **Catalogue commun** : téléchargement des modèles CSV et XLSX, codes d’unités et catégories propres à l’entreprise, prévisualisation avec erreurs par numéro de ligne, confirmation explicite et import dans le service canonique (articles, prix, inventaire, événement). Formats acceptés `.csv`, `.xlsx`; taille 2 Mo ; 200 lignes utiles maximum ; pas de formules Excel.
- **Toasts** : couleurs et icônes DTSC par tonalité ; collisions d’émissions strictement simultanées supprimées à moins de 120 ms ; retour de stocks explicite `success`, `error` ou `warning` à chaque opération, même après une action identique précédente.

## Contrôles de sécurité et d’intégrité

1. API import : session, même origine, rate limit, module `CATALOG` en écriture, membership/entitlement tenant-scoped via résolveur commun.
2. Aucune valeur de référence (unité, catégorie, taxe) n’est prise pour autorité : tous les codes du fichier sont résolus à nouveau dans le `organizationId` courant.
3. Validation de structure/format avant création ; rejets fichiers vides, volumineux, Excel chiffré, formules/liens, archive gonflée, données invalides et SKU/nom déjà présent.
4. Réexamen des doublons pendant une transaction `Serializable`. Toute erreur annule le lot entier. Logs API et audit limité aux identifiants, à l’organisation et au nombre d’articles, sans contenu de fichiers.
5. Les modèles ne contiennent aucun objet de démonstration à importer par accident. Le téléchargement reprend les codes actuellement configurés dans l’entreprise.

## Scénario E2E propriétaire (à valider avant fusion)

1. Créer une cliente avec un administrateur ; vérifier toast contextualisé, fermeture immédiate après `201`, invitation en attente côté administrateur. Forcer une erreur serveur et confirmer **formulaire conservé** ; tester la perte réseau puis rechercher la société avant un nouvel essai.
2. Créer puis modifier un site : rechercher `Africa/Kinshasa`, `Africa/Lubumbashi`, `Europe/Paris`, parcourir les résultats au clavier, vérifier l’enregistrement. Appeler l’API avec `timezone: "Zone/Inconnue"` et vérifier le rejet.
3. Créer une catégorie et au moins une unité dans deux entreprises distinctes ; télécharger CSV et Excel dans chacune, vérifier les codes exposés et l’absence des référentiels de l’autre entreprise.
4. Compléter trois lignes : produit stocké avec SKU/prix, service sans stock et produit sans prix. Prévisualiser, confirmer, recharger catalogue et vérifier l’historique de prix et les fiches de stock créées au bon tenant.
5. Ajouter une ligne avec unité inconnue, SKU déjà importé, ligne dupliquée, formule Excel, devise et montant invalides : vérifier erreurs par ligne, zéro écriture, possibilité de corriger/recommencer. Réimporter un lot identique et vérifier aucun doublon. Tester 201 lignes et fichier supérieur à 2 Mo.
6. Stock : soumettre deux fois de suite un formulaire de transfert/inventaire/ajustement en conditions normales et d’échec, contrôler l’affichage **à chaque tentative**. Vérifier la couleur verte/rouge/ambre, puis approbation, rejet et réception. Rechercher les anciennes surfaces où le toast apparaît en double et confirmer une seule notification par action.
7. Responsive 320, 375, 768 et 1440 px, clavier et thèmes clair/sombre ; FR et EN ; changement d’entreprise sans accès croisé.

## QA technique

- `node scripts/qa-hotfix-1075-forms-catalog-import-toasts.mjs` : parseur CSV avec guillemets/délimiteurs, XLSX valide, formules interdites, fichiers invalides et garde-fous de route/UI.
- `node scripts/qa-regression-checks.mjs` charge aussi ce test.
- QA complémentaires : master-data, inventory, i18n, registre modules, commercial readiness, identité/consentement, responsive, standard experience et TypeScript.

## Livraison et retour arrière

Préparer une unique PR liée à #1075. **Ne pas fusionner, ni déclencher de Preview Vercel.** Après CI verte et `E2E #PR BON` explicite du propriétaire, fusionner sur `main` puis surveiller le pipeline normal Vercel (`prisma migrate deploy` → `pnpm build`). Aucun schéma ni migration de données n’est modifié par ce hotfix. Pour un retour arrière, revert du commit de fusion sur `main` après analyse, en préservant les articles déjà importés ; ne jamais supprimer automatiquement les données importées.
