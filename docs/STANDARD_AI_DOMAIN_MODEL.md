# Modèle canonique du domaine IA DTSC

## Autorité

DTSC conserve les historiques existants `Conversation`/`Message` pour le Chatbot global et `EnterpriseAiConversation`/`EnterpriseAiMessage` pour l’Assistant entreprise. L’itération 05 n’ajoute pas un troisième moteur de conversation. Le registre `lib/ai/` normalise seulement fournisseurs, modèles, routage, erreurs, prompts, outils, coûts et observabilité.

## Objets

- **Conversation** : utilisateur, contexte, organisation éventuelle, locale, projet, stratégie/modèle, statut, visibilité, archivage et suppression logique.
- **Message** : rôle `SYSTEM|USER|ASSISTANT|TOOL`, contenu, langue, pièces jointes, sources, citations, usage, modèle et erreur éventuelle.
- **Tour** : message utilisateur, récupération, tentatives modèle, outils, réponse, tokens, coût, latence, retries et erreur. `AiModelCall` matérialise chaque tentative observable sans enregistrer le contenu sensible complet.
- **Source et citation** : document/version/langue, fragment, page ou section, score et lien autorisé.
- **Outil** : définition canonique, schémas, contextes, permissions, mode, confirmation, idempotence et niveau d’audit.
- **Connaissance** : source, version, fragment, embedding, langue, contexte, confidentialité et état d’indexation.
- **Gouvernance** : usage, coût, feedback, prompt versionné, évaluation, incident et audit.

## Contextes

`PERSONAL`, `DTSC_INTERNAL`, `ORGANIZATION`, `PROJECT`, `MODULE`, `OBJECT`. Toute conversation et tout appel modèle reçoivent un contexte explicite. Une organisation active ne peut jamais être déduite d’un identifiant fourni par le client sans vérification du membership.

## Cycle de suppression

Archivage → retrait visible → suppression logique → purge contrôlée des fichiers/fragments/embeddings. Les preuves d’audit, totaux financiers et transitions de maturité restent conservés selon la politique applicable.
