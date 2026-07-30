# Expérience conversationnelle IA DTSC

## Objectif

Cette itération transversale modernise le Chatbot DTSC et l'IA Assistant Entreprise avant le sprint ERP suivant. Elle reprend les principes utiles des assistants IA modernes — lecture centrée, historique compact, projets, composer multiligne, réglages de conversation et sources explicites — sans copier une marque ni exposer une capacité que DTSC ne possède pas.

## Architecture UI commune

Les deux assistants utilisent `components/chat/assistant-conversation-ui.tsx` :

- réponse assistant pleine largeur dans une colonne de lecture centrée ;
- message utilisateur compact à droite ;
- composer multiligne mobile-first ;
- chips de contexte/sources ;
- choix du modèle autorisé ;
- style et longueur de réponse ;
- instructions spécifiques à la conversation ;
- état vide avec suggestions ;
- safe areas et navigation clavier.

Le streaming suit automatiquement le bas uniquement lorsque l'utilisateur est déjà proche du bas. Il n'utilise pas de smooth scroll par token.

## Chatbot DTSC

Le menu conversation expose :

- configuration de la conversation ;
- épinglage / désépinglage ;
- archivage / restauration ;
- renommage et classement dans un projet ;
- partage vers Mes collaborateurs ;
- copie du lien ;
- export Markdown local ;
- informations ;
- suppression.

Les préférences persistées dans `ChatConversationPreference` sont :

- modèle autorisé propre à la conversation ;
- style de réponse ;
- longueur ;
- utilisation du contexte entreprise privé ;
- utilisation du RAG documentaire privé ;
- instructions personnalisées ;
- épinglage ;
- archivage.

La route `/api/chat/v2` conserve les fonctions de la route historique : quotas, contexte entreprise, RAG, actions privées, streaming, usage et feedback. Elle applique en plus les préférences persistées côté serveur.

## IA Assistant Entreprise

Le nouvel espace conserve :

- isolation stricte `organizationId` ;
- projets et historique ;
- sources documentaires privées ;
- RAG sectoriel ;
- outils métier en lecture ;
- quotas organisationnels ;
- paramètres IA d'organisation ;
- partage vers Mes collaborateurs ;
- CRUD logique des messages et conversations.

Il ajoute par conversation :

- modèle autorisé ;
- style et longueur ;
- sources RAG activées ou non ;
- outils métier de lecture activés ou non ;
- instructions personnalisées ;
- épinglage ;
- archivage/restauration ;
- export Markdown.

Les citations déjà stockées dans `EnterpriseAiMessage.citationsJson` sont maintenant visibles sous la réponse. Les résultats d'outils sont signalés sans exposer leur payload brut.

Le feedback Like/Dislike est persisté dans `EnterpriseAiMessageFeedback` et n'est accepté que pour une réponse assistant appartenant à la conversation de l'utilisateur dans l'organisation autorisée.

## Sources : règle de vérité

Aucune option « Web » n'est ajoutée. DTSC ne dispose pas encore d'un moteur de recherche Web audité dans ces routes.

Le Chatbot expose uniquement :

1. contexte entreprise privé ;
2. documents/RAG autorisés.

L'Assistant Entreprise expose uniquement :

1. sources RAG de l'organisation accessibles ;
2. outils métier en lecture autorisés par RBAC et abonnement.

## Instructions personnalisées

Les instructions de conversation améliorent la forme et le cadrage d'une réponse, mais ne peuvent jamais remplacer :

- les règles système DTSC ;
- l'isolation tenant ;
- le RBAC ;
- les règles de confidentialité ;
- les entitlements ;
- les confirmations humaines obligatoires ;
- les restrictions sur les workflows sensibles.

## Migration

Migration additive :

`20260730043000_add_assistant_conversation_preferences`

Tables créées :

- `ChatConversationPreference` ;
- `EnterpriseAiConversationPreference` ;
- `EnterpriseAiMessageFeedback`.

Aucune table historique n'est supprimée, aucune colonne existante n'est supprimée et les anciennes conversations restent compatibles.

## CI/CD

Le chantier respecte le pipeline imposé :

`feature branch → Quality Gates → review → merge normal main → unique Vercel Production → prisma migrate deploy → build`

Aucun déploiement Preview fonctionnel n'est requis et aucun déploiement Vercel manuel ne doit être exécuté.
