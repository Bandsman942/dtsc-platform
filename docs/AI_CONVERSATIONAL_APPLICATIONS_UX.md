# IA conversationnelle DTSC — langage métier, applications connectées et copilote de rédaction

## Objectif

Cette évolution corrige trois problèmes produit transversaux :

1. les assistants ne doivent jamais exposer aux utilisateurs normaux des identifiants techniques qui ne sont pas visibles dans l’interface ;
2. les applications MCP doivent être présentées comme des applications métier compréhensibles, avec un état réel et non simulé ;
3. l’IA DTSC doit aider à rédiger dans **Mes collaborateurs** sans contourner la sécurité ni envoyer un message à l’insu de l’utilisateur.

## Contrat de langage utilisateur

`lib/ai/prompts.ts` porte désormais un contrat commun de présentation utilisateur appliqué par les routes qui réutilisent `buildLanguageInstruction()`.

Sont interdits dans une réponse métier normale :

- codes internes de modules ;
- enums bruts ;
- clés camelCase ;
- noms de champs de base de données ;
- variables d’environnement ;
- noms bruts d’outils et de fournisseurs ;
- payloads MCP ;
- routes techniques ;
- flags d’implémentation ;
- secrets, tokens, logs protégés ou configuration cachée.

L’assistant doit convertir un fait interne en **libellé visible + effet métier**. Exemple :

- interdit : `blockExpiredBatchSale: true` ;
- attendu : `Les lots expirés ne peuvent pas être vendus.`

La règle ne bloque pas un diagnostic technique demandé explicitement par un utilisateur autorisé ; elle empêche seulement les fuites de détails d’implémentation dans une conversation métier normale.

## Centre Applications connectées

Route UI : `/ai/apps`

Le catalogue initial présente :

- Gmail ;
- Google Calendar ;
- Notion ;
- GitHub ;
- Linear ;
- Jira & Confluence ;
- Stripe.

Le catalogue est éditorial ; **la disponibilité est calculée à partir du vrai registre `MCP_SERVER_REGISTRY`**. Une application n’est affichée comme certifiée DTSC que lorsqu’un serveur correspondant est réellement déclaré et `CERTIFIED` dans l’environnement courant.

Le centre rappelle la chaîne de sécurité existante : session → contexte/tenant → abonnement → permission → classification des données → binding certifié → Tool Gateway → audit.

### Limite actuelle volontaire

Le runtime MCP actuel supporte seulement les authentifications serveur `NONE` et `BEARER_ENV`. Il ne possède pas encore de coffre OAuth personnel par utilisateur.

Par conséquent, cette évolution **n’affiche aucun faux bouton « Connecté »** et ne stocke aucun token utilisateur en clair. Le centre indique honnêtement qu’une autorisation personnelle apparaîtra seulement après livraison du runtime OAuth utilisateur.

Pour rendre la connexion personnelle complète, la prochaine couche doit implémenter le flux d’autorisation HTTP MCP conforme OAuth 2.1 avec :

- Protected Resource Metadata ;
- découverte de l’Authorization Server ;
- PKCE ;
- `state` anti-CSRF ;
- Resource Indicators ;
- stockage serveur chiffré des credentials ;
- rotation/expiration/révocation ;
- scopes minimaux ;
- audit de connexion/déconnexion ;
- aucun token dans le navigateur, les logs ou les prompts ;
- révalidation des permissions DTSC avant chaque appel MCP.

Aucun serveur découvert ne peut s’auto-certifier ou s’auto-activer.

## Mes collaborateurs — Copilote IA DTSC

Le composant partagé `VoiceConversationComposer` expose maintenant une action **Copilote IA DTSC**. Elle est donc disponible dans les interfaces de conversation qui utilisent ce composer.

Actions initiales :

- Reformuler ;
- Professionnaliser ;
- Raccourcir ;
- Plus chaleureux ;
- Proposer une réponse à partir d’un message fourni.

API : `POST /api/collaborators/ai/compose`

La route :

- exige une session ;
- exige same-origin ;
- applique un rate limit ;
- valide les entrées avec Zod ;
- réutilise `prepareAiTurn()` et `routeAiStream()` ;
- conserve le contexte `PERSONAL`, `ORGANIZATION` ou `DTSC_INTERNAL` courant ;
- applique le contrat de langage humain ;
- journalise l’appel ;
- retourne uniquement un brouillon.

### Pourquoi le message n’est pas envoyé automatiquement

Le copilote prépare le texte dans la zone de saisie, puis l’utilisateur relit et envoie lui-même. Cette première livraison ne donne donc pas au modèle un droit implicite d’écriture dans les conversations privées.

Un futur **Agent de messagerie** pourra proposer des réponses à partir du thread actif et éventuellement exécuter des actions bornées uniquement après ajout d’un contrat explicite : activation opt-in, périmètre de conversations, règles de destinataires, confirmation ou politique d’auto-envoi, kill switch, audit, prévention des boucles agent-agent, quotas et RBAC serveur.

## UX

Les assistants conservent l’interface immersive commune existante. Le composer IA affiche désormais un raccourci vers `/ai/apps`, et les paramètres de conversation contiennent aussi une entrée **Applications connectées**.

Le principe reste :

- réponse centrée lisible ;
- composer mobile-first ;
- réglages accessibles sans quitter le contexte ;
- aucune terminologie d’infrastructure nécessaire pour accomplir une action utilisateur ;
- les détails techniques restent réservés aux surfaces d’administration et de diagnostic appropriées.

## QA

`scripts/qa-assistant-ux-checks.mjs` vérifie désormais aussi :

- le contrat de langage humain ;
- l’existence des applications du catalogue ;
- la dérivation de disponibilité depuis le registre MCP réel ;
- l’absence de fausse connexion OAuth ;
- la présence du Copilote IA DTSC dans le composer collaboratif ;
- l’usage du runtime IA canonique ;
- les contrôles same-origin, session et rate limit ;
- l’absence d’auto-envoi implicite.

## CI/CD

Le workflow reste celui imposé par `AGENTS.md` :

`feature branch → contrôles → PR → Quality Gates → revue → merge main → unique déploiement Production`.

Aucun déploiement Vercel manuel depuis la branche feature n’est autorisé.
