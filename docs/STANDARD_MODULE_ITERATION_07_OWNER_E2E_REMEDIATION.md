# Itération 07 — Correctifs E2E propriétaire

**Baseline vérifiée :** `168b3d7c6e5428185161efb84564fe3a87f42f16`
**Date :** 2026-08-06
**Statut :** implémentation technique ; validation Production et nouvelle acceptation E2E propriétaire requises avant toute promotion commerciale.

## 1. Activités DTSC

Le tableau de bord conserve les sources de vérité des modules Administration DTSC. Il ajoute une représentation professionnelle par bloc sans copier les données :

- bascule indépendante `Liste` / `Kanban` pour les blocs à cycle évolutif ;
- regroupements filtrables par statut, priorité, entité ou progression selon la nature du bloc ;
- prestations hebdomadaires regroupées en Kanban par mode de travail et disponibles en liste compacte ;
- historique des prestations regroupé par statut de soumission ;
- actions rapides sûres sur les cartes ; les transitions sensibles exigent un motif dans le détail ;
- route de transition canonique, idempotente et concurrent-safe avec historique `OperationalStatusTransition` ;
- synchronisation immédiate avec les mêmes enregistrements COO, CEO, MPO, CTO, SCO et demandes internes lus dans Administration DTSC ;
- aucune écriture parallèle ni double autorité.

Les transitions vérifient l’utilisateur impliqué, son poste officiel, sa permission individuelle, le statut courant et les règles métier. Une répétition de la même transition retourne un succès inchangé et ne crée pas un second événement.

## 2. Boîte à outils professionnelle globale

Une action flottante est montée au niveau racine et reste accessible depuis les modules applicatifs :

- notes privées par module, enregistrées dans le stockage local du navigateur ;
- calculatrice arithmétique sans `eval`, limitée aux opérateurs autorisés ;
- pense-bêtes privés avec échéance, état terminé et suppression ;
- composant mobile-first, clavier accessible et safe-area.

Ces données ne deviennent pas des objets métier, ne sont pas envoyées au serveur et ne contournent aucune validation.

## 3. Abonnements et facturation

### 3.1 Deux périmètres explicites

Les plans portent désormais une audience `PERSONAL`, `ORGANIZATION` ou `BOTH`. Les écrans et routes empêchent qu’un plan entreprise soit utilisé pour un abonnement personnel, ou inversement.

### 3.2 Paiement automatique entreprise

Le checkout entreprise :

- exige un administrateur actif de l’organisation ;
- accepte uniquement une offre entreprise active ;
- crée une référence déterministe par requête cliente ;
- réutilise le même paiement lors d’un nouvel essai ;
- active l’abonnement lors du callback canonique ;
- crée un enregistrement de facturation, une facture entreprise, un revenu HR/CFO et réconcilie les modules ;
- envoie la facture aux administrateurs actifs de l’entreprise.

### 3.3 Paiement manuel gouverné

La Console permet de créer une demande personnelle ou entreprise avec : bénéficiaire, offre, montant, devise, moyen de paiement, référence, motif et validateur désigné distinct du demandeur.

Seul le validateur désigné, ou un administrateur global autorisé, peut approuver ou refuser. L’approbation est reprenable et idempotente : abonnement, paiement, facture, transaction de revenu et e-mail ne sont pas dupliqués lors d’un nouvel essai.

### 3.4 Séparation des factures

Les catégories sont séparées :

- `PERSONAL_SUBSCRIPTION` ;
- `ORGANIZATION_SUBSCRIPTION` ;
- `HR_CFO_TRANSACTION`.

Les factures HR/CFO ne sont plus présentées dans l’historique SaaS de l’utilisateur. Leur lecture passe par les capacités dédiées `HR_CFO_INVOICES_READ` et `HR_CFO_INVOICES_MANAGE` configurables dans Administration DTSC.

## 4. Mes collaborateurs

Un utilisateur Client peut chercher un autre utilisateur par adresse exacte ou via un profil ayant explicitement autorisé sa découverte, puis envoyer une invitation de contact.

- demandes entrantes et sortantes ;
- acceptation, refus et annulation idempotents ;
- prévention des doublons et respect des blocages ;
- création/résolution d’une conversation directe canonique après acceptation ;
- groupes et appels restent accessibles selon les permissions existantes.

Pendant un appel audio ou vidéo, l’espace de conversation ne change plus de moteur visuel. La conversation courante reste affichée avec ses messages, réponses, pièces jointes et actions, tandis que la salle d’appel s’ouvre dans un panneau superposé réutilisant le composant LiveKit existant.

## 5. Données et migration

Migration additive : `20260805234500_iteration_07_e2e_remediation`.

Elle ajoute :

- les demandes de contact ;
- l’audience des plans et de leurs versions ;
- les liaisons organisationnelles des paiements et factures ;
- les paiements manuels gouvernés ;
- les catégories et destinataires de facture ;
- les index et contraintes de référence nécessaires.

Aucune migration historique n’est modifiée. Aucun enregistrement métier n’est supprimé.

## 6. Sécurité et idempotence

- same-origin sur les mutations ;
- session et contexte organisation vérifiés ;
- rate limiting ;
- validation Zod ;
- contrôle des permissions serveur ;
- séparation demandeur/validateur ;
- références de checkout déterministes ;
- `updateMany` conditionné par le statut courant pour les transitions concurrentes ;
- audit et API logs ;
- factures et revenus créés par clés de source stables ;
- aucune promotion automatique vers `COMMERCIAL_READY`.

## 7. Rollback

Le rollback applicatif peut masquer les nouvelles vues, la boîte à outils ou les nouveaux parcours sans supprimer les tables additives. Les demandes de contact, paiements, factures, revenus, abonnements et historiques de transition doivent être conservés.
