# Suivi E2E propriétaire — Itération 7

## Périmètre

Cette correction traite les constats E2E du propriétaire concernant Activités DTSC, la boîte à outils transversale, les abonnements personnels et d’entreprise, les factures HR & CFO et Mes collaborateurs.

## Contrats livrés

### Activités DTSC

- chaque bloc de données expose son propre choix Kanban/liste ;
- les axes de regroupement sont modifiables selon statut, priorité, type ou progression ;
- les prestations hebdomadaires sont groupables par mode de travail ;
- l’historique des prestations est groupable par statut ou période ;
- les seules transitions rapides ajoutées concernent les tâches canoniques et utilisent l’API idempotente déjà partagée avec Administration DTSC ;
- les autres entités continuent d’ouvrir leur détail canonique afin de ne pas inventer de mutation générique non autorisée.

### Boîte à outils

Une boîte à outils globale et responsive fournit des notes rapides, une calculatrice sans `eval` et un pense-bête. Les brouillons sont privés au navigateur et ne deviennent jamais des données métier sans action explicite de l’utilisateur.

### Abonnements et facturation

- les offres portent une audience `PERSONAL`, `ENTERPRISE` ou `BOTH` ;
- les paiements automatiques personnels et d’entreprise utilisent des routes séparées et le même callback MaishaPay idempotent ;
- un paiement manuel exige une validation Console avant activation ;
- la validation crée une facture typée, l’envoie aux destinataires et crée une recette HR & CFO canonique ;
- les factures d’abonnement et les factures de transaction HR & CFO sont séparées par `invoiceType` ;
- les capacités `CONSOLE_FINANCE_INVOICES_READ` et `CONSOLE_FINANCE_INVOICES_MANAGE` gouvernent l’accès aux factures opérationnelles.

### Mes collaborateurs

- un utilisateur peut rechercher de manière bornée un utilisateur actif, lui envoyer une invitation professionnelle et accepter/refuser/annuler la demande ;
- une relation acceptée alimente ensuite l’autorisation canonique des conversations directes, groupes et appels ;
- les blocages existants restent prioritaires ;
- le mode appel réutilise le même workspace de conversation et monte uniquement la salle LiveKit canonique dans un dialogue.

## Migration

Migration additive : `20260805203000_iteration07_e2e_followup`.

Elle ne supprime aucune donnée et ajoute les dimensions d’audience/facture, les relations professionnelles et les demandes de paiement manuel.

## E2E manuel après Production

À rejouer :

1. Kanban/liste de chaque bloc Activités sur mobile et desktop.
2. Transitions de tâches et synchronisation immédiate avec Administration DTSC.
3. Notes, calculatrice et pense-bête sur plusieurs modules.
4. Paiement personnel automatique.
5. Paiement entreprise automatique par un administrateur de l’organisation.
6. Paiement manuel soumis, rejeté puis validé ; contrôle facture, email et chiffre d’affaires.
7. Séparation des factures abonnement/HR & CFO selon permission.
8. Invitation professionnelle entre deux comptes Client, acceptation, conversation, groupe et appel.
9. Appel audio/vidéo sans changement du design de conversation.

Statut initial : `NON_EXÉCUTÉ`. Aucune promotion automatique vers `COMMERCIAL_READY`.
