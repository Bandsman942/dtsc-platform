# DTSC AI — Assistant Runtime

## Objectif

Le runtime assistant unifie la préparation d'un tour IA sans fusionner les historiques existants.

Sources de vérité conservées :

- chatbot global : `Conversation` / `Message` ;
- assistant entreprise : `EnterpriseAiConversation` / `EnterpriseAiMessage`.

Aucun troisième historique n'est créé.

## Chaîne d'exécution

```text
Conversation existante
  -> prepareAiTurn()
  -> AssistantProfile
  -> Context Engine
  -> CAG Pack
  -> Policy Router V2
  -> Provider adapter
  -> streaming normalisé
  -> persistance dans l'historique d'origine
```

## AssistantProfile

Le registre canonique est `lib/ai/assistant-registry.ts`.

Profils actuels :

- `DTSC_GENERAL` ;
- `ENTERPRISE_GENERAL` ;
- `PHARMACY_ASSISTANT` ;
- `HEALTH_ASSISTANT` ;
- `SHOP_ASSISTANT` pour le secteur canonique `COMMERCE_RETAIL`.

Un profil demandé n'est jamais accepté uniquement parce que son code vient du client. Le registre revalide contexte, secteur et module. Un profil sectoriel invalide retombe sur le profil général autorisé.

## Context Engine

`lib/ai/context-engine.ts` assemble côté serveur :

- utilisateur ;
- contexte IA ;
- organisation active ;
- membership et rôle ;
- poste ;
- plan effectif ;
- modules réellement lisibles ;
- module explicitement demandé après revalidation ;
- capacité de lecture clinique Health explicitement résolue ;
- version de contexte calculée sans contenu métier.

Les tours rattachés à une organisation sont classés au minimum `CONFIDENTIAL` par défaut.

## Préparation commune

`lib/ai/assistant-runtime.ts` expose `prepareAiTurn()`.

Cette primitive est utilisée par :

- `app/api/chat/v2/route.ts` ;
- `app/api/enterprise/ai/chat/route.ts`.

Elle retourne le profil, le contexte, le CAG, les paramètres de policy et des métadonnées d'audit non sensibles.

## Audit

`AiModelCall.metadataJson.runtime` peut conserver :

- code/version du profil ;
- type de résolution du profil ;
- code/version du CAG ;
- hit/miss cache ;
- hash/version du contexte ;
- code/version du prompt.

Le contenu complet du CAG, les prompts, documents et secrets ne sont pas persistés dans ces métadonnées.

## Limites de cette itération

- pas de MCP ;
- pas d'agent loop ;
- pas d'exécution automatique de tool calls modèles ;
- pas de fusion des historiques ;
- pas de profil Finance/RH/Legal tant que leurs frontières de données ne sont pas explicitement garanties par policy et QA.
