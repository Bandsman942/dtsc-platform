# OWNER_E2E #884 — Relations DTSC, avantages Gaming et navigation

**Statut : requis avant fusion.** PR #885 sur la branche `fix/884-relations-benefits-contextual-back`. Ne pas valider sur la Production actuelle : les previews Vercel restent désactivées et la branche n'est pas déployée. Utiliser un environnement de QA autorisé qui exécute le SHA exact de la PR, avec une entreprise de test et une base isolée. Aucun effet financier réel.

## Prérequis

- Une entreprise cliente Gaming ayant `CRM_CUSTOMERS`, `RELATIONSHIP_BENEFITS`, `GAMING_SESSIONS`, `GAMING_CHECKOUT` actifs et autorisés par le plan.
- Deux utilisateurs distincts (administrateur + collaborateur), deux tiers dont une fiche PERSONNE avec rôle CUSTOMER, au moins deux relations dont une nouvelle demande à approuver.
- Un service Gaming tarifé positif, deux sessions facturables, un validateur de facture autorisé, une caisse ou un circuit de paiement test valide, devise CDF.
- Vérifier le SHA de QA = SHA de la PR et conserver copies non sensibles des réponses, sans mot de passe/token.

## Parcours humain — cocher seulement après exécution

1. **Identités et consentements.** Cliquer la ligne complète d'invitation, de demande puis d'une relation historique : le détail plein écran s'ouvre. Réouvrir directement `/enterprise-identity-admin?link=<id autorisé>`.
2. **Approuver/refuser.** Sur une demande en attente, sélectionner une fiche du type demandé et approuver ; vérifier le statut après actualisation. Une cible incorrecte doit être refusée côté serveur. Refuser une seconde demande en confirmant le dialogue DTSC ; vérifier toast, motif si renseigné et historique. Une erreur de révision concurrente conserve la saisie et affiche une erreur explicite.
3. **Créer puis revenir.** Depuis une demande sans fiche compatible, « Créer une fiche » ouvre le CRM puis revient exactement sur cette demande avec la fiche créée sélectionnée, sans permission élargie.
4. **Tiers / avantages.** Ouvrir le tiers associé et sélectionner chacune de ses relations. Vérifier les onglets Résumé, Avantages, Historique, les quotas restants, les dates, les montants dans leur devise, la pagination, le filtre par statut et l'ouverture du détail d'usage. Un lien historique non actif n'est pas présenté comme un droit consommable.
5. **Gaming.** Créer une remise `GAMING_CHECKOUT` de 10 % (non cumulable), affectée à une relation active CUSTOMER et limitée à une utilisation par période. Préparer une session à 500 CDF : facture brute 500, remise 50, montant net 450 ; usage au statut APPROVED avec date d'exécution absente. Une réservation non facturée ne crée pas de consommation.
6. **Annulation et quota.** Annuler le checkout avant émission : même usage CANCELLED, quota libéré. Réessayer avec une nouvelle session : remise récupérée sans doublon. Approuver/émettre la facture : usage CONSUMED, date et montant 50 CDF. Une session suivante doit être facturée au prix normal si le quota est épuisé. Rejouer la demande d'encaissement avec la même clé : aucun nouvel usage.
7. **Remboursement.** Après encaissement autorisé, emprunter le circuit canonique de remboursement Gaming et confirmer l'inverse financier ; le même usage relationnel devient CANCELLED. Le retrait du quota dépend uniquement d'une annulation/remboursement métier confirmé, jamais d'un clic « Annuler » depuis les demandes manuelles.
8. **Sécurité.** Tester compte sans droit admin et identifiant d'une autre entreprise : la relation, les usages, les avantages et les opérations doivent être refusés (403/404, sans fuite du nom/montant), y compris en modifiant l'URL.
9. **Navigation.** Naviguer A → B → C, puis Retour C → B → A ; vérifier filtres, onglet, pagination, scroll et absence de boucle. Ouvrir une fiche identité puis bouton retour système/navigateur : la fiche se ferme sans quitter le module. Modifier un formulaire sans sauver : une confirmation DTSC apparaît ; « Rester » conserve la saisie. Tester la navigation lors d'un changement d'entreprise actif : les données de l'ancienne entreprise restent inaccessibles.
10. **Responsive / i18n / accessibilité.** Répéter les parcours aux largeurs 320, 360, 375, 390, 414, 768, 1024 px, FR et EN, modes sombre/clair, clavier et Android/PWA. Aucun débordement, doublon de bouton visible ou élément qui cache une action.

## Preuves techniques attendues en complément

- `CI_PROVEN` : gates GitHub du SHA final (gouvernance, Prisma, type-check, QA #884, régression complète, lint, build, Gaming/browser), sans échec ni skip masqué.
- `OWNER_E2E` : confirmation explicite du propriétaire après les dix parcours, avec erreurs documentées le cas échéant.
- `Vercel READY` : seulement après l'approbation humaine, merge sur `main` et contrôle du SHA réellement déployé.

## Convention de réponse

En cas de succès : `E2E #884 bon — SHA <SHA testé> — parcours 1 à 10 validés`.
En cas d'échec : `E2E #884 KO — parcours <N> — écran/état — attendu vs observé`.

**Rollback :** revert PR sans suppression d'historique métier, de consentement, d'usage financier ou de migration déjà appliquée.
