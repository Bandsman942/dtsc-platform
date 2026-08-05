# Contrat i18n de la Console DTSC

Les namespaces canoniques sont `console.*`, `admin.commercialMaturity.*` et `userGuides.*`. Navigation, sections, filtres, KPI, erreurs, confirmations, statuts, guides et exports utilisent la locale du compte.

Les `reasonCode` restent stables et indépendants de la langue. Les noms d’utilisateurs, entreprises, tickets, messages, contrats et documents ne sont jamais traduits automatiquement.

Dates, heures, devises, pourcentages, durées et pluralisation utilisent les formateurs de locale. Tout nouveau texte visible doit avoir une clé FR et EN ; une exception doit être documentée et temporaire.
