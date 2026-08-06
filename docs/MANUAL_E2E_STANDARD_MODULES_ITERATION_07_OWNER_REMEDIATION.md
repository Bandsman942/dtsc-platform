# Plan E2E manuel — Correctifs propriétaire Itération 07

**Statut initial : `NON_EXÉCUTÉ`**

## A. Activités DTSC

1. Ouvrir chaque bloc et vérifier la bascule Liste/Kanban sans perte de filtre.
2. Vérifier les prestations hebdomadaires : colonnes par mode de travail, cartes compactes, édition/suppression selon le statut.
3. Vérifier l’historique : colonnes Brouillon, Soumis, Correction demandée, Approuvé, Rejeté et Annulé selon les données présentes.
4. Pour COO, CEO, MPO, CTO et SCO, exécuter une transition avec une personne impliquée puis contrôler la même valeur dans Administration DTSC.
5. Rejouer exactement la même transition : aucune seconde transition ni notification métier ne doit être créée.
6. Tenter une transition non autorisée, une transition par un tiers et une clôture d’opération avec tâches ouvertes.
7. Vérifier mobile, mode sombre, clavier et débordement horizontal local du Kanban.

## B. Boîte à outils

1. Ouvrir la boîte depuis plusieurs modules.
2. Enregistrer une note par module puis recharger la page.
3. Tester calculs, parenthèses, pourcentages et expression invalide.
4. Créer, terminer et supprimer un pense-bête.
5. Contrôler qu’aucune donnée de la boîte ne figure dans une requête API.

## C. Abonnements et facturation

1. Vérifier les catalogues Personnel et Entreprise séparés.
2. Tester qu’un plan entreprise est refusé par le checkout personnel et inversement.
3. Lancer deux fois le même checkout entreprise avec le même identifiant de requête : une seule référence et un seul abonnement en attente.
4. Simuler un échec fournisseur puis retenter la même requête.
5. Confirmer un paiement : abonnement actif, facture entreprise, revenu HR/CFO, modules réconciliés et e-mail aux administrateurs.
6. Créer un paiement manuel avec validateur distinct ; vérifier que le demandeur ne peut pas s’auto-valider.
7. Approuver deux fois : aucune extension, facture ou écriture de revenu en double.
8. Vérifier la facture personnelle à l’utilisateur et la facture entreprise aux administrateurs actifs.
9. Contrôler que les factures `HR_CFO_TRANSACTION` sont absentes de la facturation SaaS et visibles uniquement avec la permission dédiée.

## D. Mes collaborateurs

1. Avec un rôle Client, chercher un utilisateur autorisé et envoyer une invitation.
2. Vérifier demande entrante/sortante, annulation, refus et acceptation.
3. Rejouer l’acceptation : la même conversation directe doit être retournée.
4. Vérifier qu’un utilisateur bloqué ou non découvrable ne peut pas être invité par recherche ouverte.
5. Créer une discussion directe, un groupe et démarrer un appel audio puis vidéo.
6. Pendant l’appel, vérifier que le même fil, les réponses, mentions, pièces jointes, lectures et filtres restent visibles.
7. Quitter et rejoindre par lien profond `?call=` sans basculer vers l’ancien design.

## E. Sécurité, migration et régression

1. Tester les mutations cross-origin, sans session et hors organisation.
2. Tester un identifiant d’un autre tenant.
3. Appliquer toutes les migrations depuis une base vide.
4. Exécuter type-check, lint, QA ciblée, `qa:regression` et build.
5. Contrôler le SHA Production, les migrations Vercel et les erreurs runtime.

La maturité ne passe à `COMMERCIAL_READY` qu’après preuve Production et validation explicite de ce plan par le propriétaire.
