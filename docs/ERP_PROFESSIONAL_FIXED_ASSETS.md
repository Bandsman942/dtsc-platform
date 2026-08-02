# Comptabilité professionnelle des immobilisations

## Frontière métier

Un actif opérationnel devient une immobilisation comptable uniquement après une action de capitalisation autorisée. La création d’un équipement dans le module Actifs ne génère donc pas automatiquement une immobilisation.

## Capitalisation

La fiche comptable contient : actif lié, source, devise, coût d’origine, valeur résiduelle, durée utile, date de mise en service et comptes d’actif, d’amortissement cumulé et de dotation.

La capitalisation génère l’écriture comptable via le moteur unique et crée un plan d’amortissement.

## Méthode supportée

L’itération 5 expose uniquement la méthode réellement implémentée : amortissement linéaire mensuel. Les méthodes dégressives ou par unités de production ne sont pas affichées comme disponibles.

## Exécution

Les échéances exigibles sont comptabilisées de manière idempotente. Une même immobilisation ne peut pas recevoir deux dotations pour la même période et la même clé métier.

## Cession

La cession conserve l’actif opérationnel et son historique. Elle calcule valeur brute, amortissements cumulés, valeur nette et gain ou perte, puis suit un processus comptable contrôlé.
