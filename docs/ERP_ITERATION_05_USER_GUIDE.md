# Guide utilisateur — Itération 5 Finance avancée

## 1. Configurer la comptabilité

1. Vérifiez la devise fonctionnelle dans la configuration Finance.
2. Ouvrez **Comptabilité → Plans comptables** et créez un plan.
3. Ajoutez les comptes nécessaires ; utilisez un compte parent uniquement lorsque sa nature est compatible.
4. Créez l’exercice puis ses périodes non chevauchantes.
5. Créez les journaux et activez l’approbation indépendante lorsque nécessaire.

## 2. Créer une écriture manuelle

1. Ouvrez **Écritures** puis **Nouvelle action**.
2. Choisissez le journal, la période et la date.
3. Sélectionnez un compte débité et un compte crédité.
4. Saisissez le même montant : le débit et le crédit doivent être égaux.
5. Enregistrez en brouillon, soumettez, faites approuver par une autre personne puis comptabilisez.

Une écriture comptabilisée ne peut plus être modifiée.

## 3. Contrepasser

Ouvrez une écriture comptabilisée, choisissez **Contrepasser**, sélectionnez une date autorisée et saisissez le motif. Le système crée une nouvelle écriture inversée et conserve l’original.

## 4. Fiscalité

Créez le code, sa catégorie, les comptes fiscaux, le taux et sa date d’effet. Pour changer un taux, créez une nouvelle date d’effet ; ne modifiez pas l’historique.

## 5. Clôturer une période

1. Préparez la checklist.
2. Ouvrez chaque blocage et corrigez les objets concernés.
3. Soumettez la clôture.
4. Faites approuver par une autre personne.
5. Fermez la période.

La réouverture exige un motif et une autorisation indépendante.

## 6. Générer un état financier

Choisissez le type d’état, la période et la devise. Un aperçu reste dynamique. Cochez **Publier** uniquement après vérification : la version publiée devient non modifiable.

## 7. Capitaliser un actif

Sélectionnez un actif opérationnel, renseignez coût, valeur résiduelle, durée, date de mise en service et comptes comptables. La capitalisation crée le profil comptable et le plan linéaire. Utilisez ensuite **Exécuter les amortissements exigibles**.

## 8. Valoriser le stock

Consultez la valorisation calculée depuis les couches de coût moyen pondéré. Vérifiez quantités, devise, coût moyen et valeur. La publication crée une version immuable pour la période choisie.

## Messages fréquents

- **La période financière est fermée** : choisissez une période ouverte ou utilisez la procédure de réouverture.
- **Le total des débits doit être égal au total des crédits** : corrigez les lignes avant soumission.
- **Aucune règle comptable active ne correspond** : complétez les mappings Finance.
- **Cette opération est déjà comptabilisée** : aucune seconde écriture n’a été créée.

## Statut

**Tests E2E manuels préparés — validation du propriétaire en attente.**
