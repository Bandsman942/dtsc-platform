# Versionnement des prompts IA

Source : `lib/ai/prompts.ts`.

Les prompts critiques ont un code, une version, une date d’effet et un contenu versionné : assistant global, assistant entreprise, classification, extraction, outils et sécurité. Les routes enregistrent la version utilisée dans `AiModelCall`.

Tout changement critique doit être revu, testé, lié à un commit, observable et rollbackable. Les instructions de projet ou de conversation restent subordonnées aux règles système, à l’isolation, aux permissions et à la politique linguistique.
