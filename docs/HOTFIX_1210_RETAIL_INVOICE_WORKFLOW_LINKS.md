# Hotfix #1210 — Parcours POS de la facture au paiement

**Date** : 17 novembre 2026
**Priorité** : P1 / impact élevé
**Version candidate** : 1.23.3
**Base** : main `79a134027781d304bd93dc9c06f1d34bb5de0ac8` (#1209)
**Branche** : `fix/1210-retail-invoice-workflow-links`

## Parcours métier

1. Registre : la liste existante reste autorisée par serveur. Pour chaque facture visible en attente de validation, la file `/retail/invoices/workflow?view=approvals` confirme que l'utilisateur courant est le validateur désigné, que sa permission Finance ou dérogation explicite est effective, et que la boutique est autorisée. Si l'identité exacte et `canApprove` concordent, le raccourci « Ouvrir pour valider » apparaît. Une facture approuvée peut aussi proposer « Ouvrir pour émettre » si la file `view=issue` confirme `canIssue`.
2. Validation : le lien profond contient la boutique, le numéro, l'identifiant et la vue. Il ouvre le détail ciblé dans la file existante ; aucun clic ne valide automatiquement. Après validation explicite réussie, une nouvelle lecture de la file d'émission vérifie le droit d'émettre cette facture. Si accordé, celle-ci est mise en évidence dans la vue Émission. Sinon, une confirmation de validation informe l'utilisateur et la décision d'émission reste à un acteur autorisé.
3. Émission : le POST canonique existant conserve révision, droits, statut, transaction et comptabilisation. Après émission réussie, la confirmation reste affichée dans le module ; une nouvelle lecture de la file `/retail/invoices?view=collections` confirme `checkoutReady`, `canCollect`, état émis et reste dû positif. Le lien Encaissements reprend le ciblage #1209 et ouvre le dialogue de paiement commun. Si l'utilisateur n'est pas habilité, si la facture est réglée, ou si la vérification ne peut être effectuée, le lien est absent.
4. Les utilisateurs disposant d'une dérogation d'auto-approbation facture explicitement accordée par boutique peuvent accéder à la file correspondante lorsque checkout et isolation sont actifs. L'approbation indépendante demeure la règle ; aucune attribution n'est ajoutée ou modifiée.

## Architecture et débit

Les routes et leurs gestionnaires immuables ROUTES-05A ne sont pas modifiés ; aucune nouvelle route ni source de vérité. La recherche existante par numéro est suivie d'une concordance stricte boutique + ID + numéro, du statut et de la capacité réellement renvoyée par le serveur ; aucun nom affiché ni succès local n'est utilisé comme autorité.

Les contrôles de navigation concernent exclusivement les factures actionnables de la page visible (10 maximum dans le registre), avec trois recherches simultanées maximum, annulées lors du remplacement de la page. Une recherche parcourt au plus cinq pages de 100 résultats (fail-closed en cas de recherche pathologiquement large, panne ou refus). Aucun polling, aucun chargement de tout le registre, aucun ajout de routes/préviews. Le reçu d'émission est un état de cette interaction, non une nouvelle donnée persistée. Le rafraîchissement du module réinterroge la file avant de rendre le raccourci disponible.

## Sécurité

Les CTA sont non mutantes. Les API de transition, les validations de révision, les contrôles de statut/organisation/boutique, les écritures comptables, les créances et le paiement indépendant restent inchangés. La présence d'un CTA ne remplace jamais les contrôles backend : une révocation ou une modification de la facture intervenant après lecture doit être refusée au moment d'agir. Aucun succès ne doit être annoncé pour une lecture refusée.

## QA et recette propriétaire

`pnpm qa:retail-invoice-workflow-links-1210` teste réellement le helper de navigation avec des réponses HTTP simulées (succès, mauvais ID/site, mauvais statut, droit absent, recherche paginée, lien encodé, refus, réseau, annulation). Elle est intégrée à `qa:regression` ; les assertions de raccordement UI sont statiques, non un E2E navigateur.

OWNER_E2E sur deux boutiques, avec une facture préparée et soumise :

- Facturier A sans droit de validation : aucun bouton « Ouvrir pour valider ».
- Validateur B désigné, accès Finance + boutique effective : bouton visible dans le registre, ouvre exclusivement la bonne facture et le panneau de décision. Un validateur C non désigné ne voit pas ce bouton.
- B valide : si B peut émettre, la même facture est sélectionnée dans Émission ; sinon aucun bouton d'émission n'est disponible et la confirmation de validation reste affichée.
- Un gérant habilité ouvre une facture approuvée directement et l'émet. Vérifier facture, créance, écritures et unicité de la comptabilisation.
- B ou le gérant émet avec/sans droit COLLECT_PAYMENT : seul le premier profil voit le CTA après vérification canonique ; il ouvre la même facture dans Encaissements, sans créer de paiement automatiquement. Tester paiement séparé et solde partiel/total.
- Manipuler les paramètres de boutique, numéro, identifiant ou vue, retirer un droit, réassigner le validateur, annuler/régler la facture entre deux lectures : aucune ouverture d'une autre facture ni mutation non autorisée. Tester déclaration concurrente, refus/correction et révision obsolète.
- Tester avec auto-approbation INVOICE explicitement accordée puis révoquée, sans octroi implicite à d'autres factures.
- FR/EN, thème clair/sombre, clavier/focus, 320/360/375/390/414/768/1024 px, tablette/desktop, navigation de retour et rafraîchissement.

Aucune migration Prisma, variable ou modification de schéma. Rollback : revert de la PR via main après validation ; aucune opération SQL. Livraison Production uniquement depuis main après Quality + Migration + suites CI + `E2E final #PR BON`.
