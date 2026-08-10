# Modèle canonique du domaine IA DTSC

## Autorité

DTSC conserve les historiques existants `Conversation`/`Message` pour le Chatbot global et `EnterpriseAiConversation`/`EnterpriseAiMessage` pour l’Assistant entreprise. Le programme IA n’ajoute pas un troisième moteur de conversation. Le registre `lib/ai/` normalise seulement fournisseurs, modèles, routage, erreurs, prompts, outils, coûts et observabilité.

## Objets

- **Conversation** : utilisateur, contexte, organisation éventuelle, locale, projet, stratégie/modèle, statut, visibilité, archivage et suppression logique.
- **Message** : rôle `SYSTEM|USER|ASSISTANT|TOOL`, contenu, langue, pièces jointes, sources, citations, usage, modèle et erreur éventuelle.
- **Tour** : message utilisateur, récupération, tentatives modèle, outils, réponse, tokens, coût, latence, retries et erreur. `AiModelCall` matérialise chaque appel observable sans enregistrer le contenu sensible complet.
- **Source et citation** : document/version/langue, fragment, page ou section, score et lien autorisé.
- **Définition d’outil** : entrée canonique de `AI_TOOL_REGISTRY` avec code, schémas déclaratifs, contextes, secteur/assistant éventuels, modules/permissions, plan minimum, mode, confirmation, idempotence et niveau d’audit.
- **Confirmation d’outil** : `AiToolConfirmation`, preuve structurelle temporaire liée à l’utilisateur, au tenant, à la conversation/tour, au code outil, au hash des arguments et à une expiration. Elle n’est jamais équivalente à un texte « oui » généré ou saisi dans le chat.
- **Exécution d’outil** : `AiToolExecution`, source de vérité transversale de l’identité d’exécution, de l’idempotence, du statut, de la raison et du résultat normalisé. Une exécution Enterprise peut également être projetée dans `EnterpriseAiToolCall` sans créer une deuxième autorité d’idempotence.
- **Connaissance** : source, version, fragment, embedding, langue, contexte, confidentialité et état d’indexation.
- **Gouvernance** : usage, coût, feedback, prompt versionné, évaluation, incident et audit.

## Modes d’outils

- `READ` : lecture autorisée, sans confirmation de mutation.
- `PREPARE` : prépare un brouillon/résultat sans effectuer l’action finale. `TASK_DRAFT_PREPARE` est le premier outil certifié de ce mode.
- `MUTATE` : mutation ou effet externe uniquement après confirmation structurelle.
- `SENSITIVE_MUTATE` : réservé aux futures actions exigeant un contrôle renforcé. AI06 n’autorise ni paiement, ni écriture comptable, ni mutation clinique automatique.

## Contextes

`PERSONAL`, `DTSC_INTERNAL`, `ORGANIZATION`, `PROJECT`, `MODULE`, `OBJECT` décrivent le modèle conceptuel complet. Le runtime de session expose actuellement les contextes compatibles avec les surfaces applicatives actives (`GLOBAL_CLIENT`, `COMMUNITY`, `DTSC_INTERNAL`, `ORGANIZATION`). Toute conversation et tout appel modèle reçoivent un contexte explicite. Une organisation active ne peut jamais être déduite d’un identifiant fourni par le client sans vérification du membership et du contexte de session.

## Frontière d’autorité Tool Gateway

Une proposition d’outil provenant d’un modèle ou d’un fallback déterministe n’a aucune autorité d’exécution. Le Gateway revalide le registre, les schémas, la session, le tenant, les accès Enterprise, le plan, le module, la classification et l’assistant avant tout executor. Les arguments et références issus du modèle sont toujours considérés comme non fiables.

Pour une mutation, l’autorité humaine est représentée par le changement de statut persistant de `AiToolConfirmation`, jamais par le texte de conversation. La clé d’idempotence dérive du scope utilisateur/tenant/conversation/tour/outil/hash des arguments et possède une contrainte unique en base.

## Cycle de suppression

Archivage → retrait visible → suppression logique → purge contrôlée des fichiers/fragments/embeddings. Les confirmations consommées/cancelées effacent leur `argumentsJson`; les preuves d’exécution conservent uniquement les informations nécessaires à l’idempotence et à l’audit. Les preuves d’audit, totaux financiers et transitions de maturité restent conservés selon la politique applicable.
