# Contrat i18n IA

Le moteur existant `lib/i18n.ts`, les locales `locales/fr.json` et `locales/en.json`, ainsi que la préférence `User.language` restent les sources canoniques. Aucun second moteur i18n n’est introduit.

## Règles

1. L’interface suit la locale du compte ; une demande de réponse dans une autre langue ne modifie pas cette préférence.
2. La réponse suit : langue explicitement demandée → langue du compte → langue de conversation → français.
3. Les documents, messages, titres et citations utilisateur ne sont jamais traduits silencieusement.
4. Les APIs renvoient des `reasonCode` stables. La présentation traduit le message.
5. Dates, nombres, tokens et devises utilisent `Intl` et la locale active.
6. Les namespaces ajoutés sont `ai.*`, `admin.commercialMaturity.*` et `userGuides.ai.*`.
7. Une clé manquante doit utiliser le fallback officiel, jamais afficher `undefined` ou une enum brute.

## Couverture

Chatbot, Assistant entreprise, modèles, fournisseurs, outils, connaissance, citations, usage, erreurs, guides et Kanban de maturité sont couverts en français et anglais. Les tests statiques vérifient les deux catalogues et l’absence de contrats linguistiques parallèles.
