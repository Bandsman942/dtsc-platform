# Banque et relevés professionnels

## Formats

L’itération expose le CSV réellement supporté. Les formats additionnels ne sont pas simulés : ils seront ajoutés lorsqu’un parseur et des tests existent.

## Assistant d’import

1. choisir le compte bancaire ;
2. sélectionner un CSV ;
3. contrôler type et taille ;
4. détecter les colonnes ;
5. prévisualiser ;
6. vérifier période, devise et soldes ;
7. confirmer ;
8. ouvrir le résultat.

Le navigateur borne le fichier à 5 Mo et 10 000 lignes. Le backend reste l’autorité pour le tenant, la devise, l’unicité et les doublons. Les valeurs de type formule sont neutralisées avant usage et aucune donnée bancaire complète n’est journalisée.

## Détail

Le détail affiche compte masqué, période, soldes, lignes, statut de rapprochement et historique. Une ligne suspecte n’est jamais supprimée automatiquement.

Maturité : `PROFESSIONAL_READY`, avec validation E2E manuelle en attente.
