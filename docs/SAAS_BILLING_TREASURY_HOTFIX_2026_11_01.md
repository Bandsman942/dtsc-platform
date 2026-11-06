# Correctifs du circuit SaaS, de validation et de trésorerie — DTSC

Date de préparation : 1er novembre 2026. Branche : `fix/994-saas-manual-approvals`.

## Circuit des paiements manuels

1. Un opérateur habilité crée une demande avec bénéficiaire, offre, montant, devise, moyen de paiement, référence externe vérifiable et validateur RH/CFO actif distinct. Une même référence externe/moyen/devise ne peut être réutilisée pour une autre demande non rejetée.
2. Le validateur reçoit une notification en application (avec tentative de web push) pointant vers `/billing?manualApproval=<id>`. Il voit les demandes qui lui sont attribuées, même sans permission globale de lecture de toutes les souscriptions.
3. La décision ne peut être donnée que par le validateur attribué, actif dans DTSC, et jamais par le demandeur. Un refus motivé conserve une trace sans activer l'abonnement.
4. Une approbation réalise dans **une transaction de base de données** : activation/prolongation d'un mois sans retrancher les jours déjà payés ; `Payment` réellement `PAID` ; `Invoice` à référence déterministe ; écriture `HrcfoExpense` validée sur un compte de règlement certifié de même devise ; état final `APPROVED`. Verrouillage de la demande et du bénéficiaire pour la concurrence et nouvelle lecture pour l'idempotence.
5. Les e-mails de facture et notifications de décision sont déclenchés **après** le commit. Un échec d'e-mail n'annule pas une approbation déjà comptabilisée ; l'état d'envoi reste consultable pour relance. La notification initiale en erreur retourne un 503 explicite ; réessayer avec le même identifiant de demande.

## Contrôles trésorerie et comptabilité interne

- Migration additive `20261101100000_internal_treasury_currency_controls` : devise de compte et anomalie de rapprochement. **Aucune conversion ou reclassification automatique de comptes existants**.
- Les nouveaux encaissements sont séparés par type de règlement (banque, espèces, mobile money) **et devise** (`USD`, `CDF`, `EUR` dans les formulaires). Les écritures sont refusées si la devise du compte n'est pas certifiée ou ne correspond pas.
- Les soldes et indicateurs ne somment pas des devises différentes. Les comptes historiques non certifiés/multi-devises sont signalés ; l'équipe financière doit valider les soldes et les pièces.
- La section RH & CFO présente les encaissements `PAID`, les écritures d'abonnement comptabilisées, les factures payées non liées à une écriture, les demandes manuelles en cours, les comptes et les anomalies. Elle reste soumise aux autorisations de la Console.
- **Limite assumée :** ce registre de contrôle n'est pas encore un ERP comptable complet en partie double ; il manque notamment écritures débit/crédit, plans comptables, clôtures, taxes, lettrage bancaire et audit externe.

## Échéance et renouvellement abonnés

- L'espace `/billing` affiche la date de fin des périodes payées, les échéances proches (30 jours) et l'expiration, pour le compte personnel et l'organisation active.
- Un bénéficiaire peut demander à DTSC un renouvellement manuel : ticket de support traçable `SAAS_SUBSCRIPTION_RENEWAL`, dédoublonné tant qu'ouvert, notification de l'équipe DTSC, accessible dans le support.
- Le paiement en ligne existant demeure **ponctuel** et n'est proposé que si le fournisseur est configuré ; le même plan expiré peut être renouvelé. L'organisation doit être administrée par un membre propriétaire ou administrateur.
- **Aucun débit récurrent automatique n'est annoncé ou activé** sans mandat/jeton de prélèvement et processus PSP certifiés ; un tel module nécessite une évolution distincte et un consentement explicite.

### Hotfix #1001 — parcours entreprise accessible et suivi

- Sur le tableau de bord client `/dashboard`, une alerte de renouvellement apparaît lorsque l'abonnement de l'organisation active est expiré/inactif ou à 30 jours ou moins de l'échéance. Le bouton renvoie directement à `/billing#renouvellement-entreprise`. Un membre sans pouvoir de facturation peut consulter les options sans déclencher de paiement.
- Sur `/billing`, une section **Renouvellement de l'abonnement entreprise** est affichée avant les accordéons. Elle présente l'offre payée précédente, l'échéance, le statut de la dernière demande, les deux possibilités distinctes **demande manuelle DTSC** / **paiement en ligne ponctuel** (uniquement si MaishaPay est disponible), les offres disponibles, et le contact Support.
- Sans abonnement payant précédent, le service ne prétend pas à un « renouvellement » : il oriente vers la première souscription ou l'accompagnement DTSC. Aucune tentative de demande manuelle n'est proposée si le serveur la refuserait.
- Le ticket `SAAS_SUBSCRIPTION_RENEWAL` conserve la règle d'unicité tant qu'il est `OPEN`/`IN_PROGRESS`. La dernière demande est visible avec dates, statut et note de résolution éventuelle. Le lien `/support?ticketId=<id>#tickets` est proposé **uniquement au créateur** : les autres administrateurs voient l'état organisationnel dans Facturation, sans acquérir l'accès aux échanges privés du créateur.
- Un deep link autorisé vers un ticket Support reste exploitable même si le ticket n'est pas sur la première page de pagination. La recherche supplémentaire est bornée par `supportTicketVisibilityWhere` ; aucun élargissement d'accès entre utilisateurs ou organisations.
- `POST /api/billing/renewal-request` conserve la validation stricte `{ scope: "PERSONAL" | "ORGANIZATION" }`, la session, le contrôle same-origin, le rate limit, le rôle organisation `OWNER`/`ADMIN`, la déduplication transactionnelle, la notification et l'audit. La réponse ajoute seulement `canViewInSupport` pour éviter un faux lien d'accès au ticket d'un autre administrateur. Codes : 201 création, 200 déjà existant, 400 contexte/validation, 401 session absente, 403 droits, 404 aucun abonnement payant, 429 limite de requêtes.
- i18n des nouvelles surfaces client FR/EN via `locales/experience.*.json`, commandes `pnpm qa:hotfix-1001-renewal-journey`, sans migration ni nouvelle variable d'environnement. Aucun prélèvement récurrent n'est ajouté.

**Recette E2E #1001 (OWNER_E2E requis) :** à 320/360/375/390/414/768/1024 px et en FR/EN, vérifier une organisation active payante avant expiration (J-30), expirée, sans offre payée et un membre non administrateur ; soumettre une demande, observer le toast, le statut et le lien ticket ; répéter la demande (pas de doublon) ; faire traiter le ticket côté DTSC (mise à jour visible) ; ouvrir le lien ciblé d'un ticket historique paginé ; essayer depuis un deuxième administrateur (statut visible mais conversation réservée au créateur) ; tester paiement en ligne disponible et indisponible, mode clair/sombre, focus clavier et absence de scroll horizontal. Ne pas fusionner avant validation.

## Vérifications exigées avant mise en production

- Validation du schéma Prisma et de la migration sur une base de staging sauvegardée ; contrôle de la table des comptes existants avant affectation manuelle de devise.
- Compilation TypeScript, lint ciblé, QA de contrats, build Next.
- E2E propriétaire à **effectuer, non exécuté ici** : création / notification au validateur / lien ciblé / validation / refus motivé / tentative par un tiers / double clic simultané / même référence externe / affichage facture / échec e-mail / contrôle des écritures en `USD`, `CDF`, `EUR` / échéance proche et expirée / renouvellement anticipé / ticket de renouvellement / droits organisation.
- Contrôler les paiements électroniques sur un environnement PSP de test ; vérifier la non-déduction de jours payés, les exports RH-CFO et la confidentialité tenant.
- Déploiement, migration réelle, envoi réel de notifications et rapprochement bancaire **non effectués** par ce correctif. Prévoir plan de retour arrière et approbation DTSC.

Suivi : GitHub #994 (validation), #992 (trésorerie), #995 (renouvellement), #993 (comptabilité). Le correctif doit être examiné en **pull request brouillon**, sans fusion automatique.
