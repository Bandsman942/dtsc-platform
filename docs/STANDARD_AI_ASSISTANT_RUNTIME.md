# DTSC AI — Assistant Runtime

## Objectif

Le runtime assistant unifie la préparation d'un tour IA sans fusionner les historiques existants.

Baseline de réconciliation AI04 : `main@f0075ba640d9318b3fe5895d24276104b227a643`, c’est-à-dire la Production contenant AI03 et le correctif urgent de la boîte à outils professionnelle. L’ancienne branche `agent/dtsc-ai-04-assistant-runtime-cag` n’est utilisée que comme référence fonctionnelle.

Sources de vérité conservées :

- chatbot global : `Conversation` / `Message` ;
- assistant entreprise : `EnterpriseAiConversation` / `EnterpriseAiMessage`.

Aucun troisième historique n'est créé.

## Chaîne d'exécution

```text
Conversation existante
  -> résolution du contexte depuis la session authentifiée
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

## Résolution canonique du contexte

`lib/ai/session-context.ts` dérive le contexte IA depuis la session authentifiée avant toute inférence liée à l'identifiant d'organisation :

- `DTSC_INTERNAL` reste `DTSC_INTERNAL`, même si `activeOrganizationId = dtsc-internal` ;
- `ORGANIZATION` reste réservé à une organisation cliente active ;
- les contextes globaux/personnels sans organisation active deviennent `PERSONAL`.

Cette règle évite de traiter le tenant interne DTSC comme une entreprise cliente uniquement parce qu'il possède un `organizationId`.

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

### Frontière `DTSC_INTERNAL`

Le tenant interne DTSC est une frontière explicite et fail-closed :

- l'identifiant doit être exactement `dtsc-internal` ;
- l'organisation doit être active, non supprimée et de type `DTSC_INTERNAL` ;
- l'utilisateur doit avoir un membership actif et non supprimé dans ce tenant ;
- le tenant `dtsc-internal` ne peut jamais tomber dans la branche `organizationType = CLIENT` ;
- un contexte `DTSC_INTERNAL` n'utilise pas les modules sectoriels d'une entreprise cliente ;
- le plan de routage modèles reste `ENTERPRISE` pour les collaborateurs DTSC autorisés ;
- les conversations, usages, RAG/CAG et audits restent néanmoins scellés sous `organizationId = dtsc-internal` afin de ne pas les confondre avec le contexte personnel.

Les limites journalières de messages et tokens du tenant interne utilisent les valeurs utilisateur administrables dans la Console DTSC. Elles ne sont pas remplacées silencieusement par un abonnement personnel ou le plan Freemium. Le niveau de modèle reste toutefois `ENTERPRISE`.

## Préparation commune

`lib/ai/assistant-runtime.ts` expose `prepareAiTurn()`.

Cette primitive est utilisée notamment par :

- `app/api/chat/v2/route.ts` ;
- `app/api/chat/agent/route.ts` ;
- `app/api/enterprise/ai/chat/route.ts` ;
- les surfaces IA autorisées de `Mes collaborateurs`.

Les routes du chatbot et des surfaces collaboratives résolvent le contexte depuis la session via la même primitive avant `prepareAiTurn()`. Les refus du Context Engine sont transformés en erreurs HTTP structurées et auditées ; les détails techniques restent dans les journaux protégés et l'interface affiche un message humain.

`prepareAiTurn()` retourne le profil, le contexte, le CAG, les paramètres de policy et des métadonnées d'audit non sensibles.

## Audit

`AiModelCall.metadataJson.runtime` peut conserver :

- code/version du profil ;
- type de résolution du profil ;
- code/version du CAG ;
- hit/miss cache ;
- hash/version du contexte ;
- code/version du prompt.

Le contenu complet du CAG, les prompts, documents et secrets ne sont pas persistés dans ces métadonnées.

## Erreurs utilisateur

Le chatbot consomme les `reasonCode` structurés de l'API et distingue au minimum :

- limite journalière atteinte ;
- rate limit ;
- modèle indisponible ;
- contexte non autorisé ;
- fournisseur IA indisponible ;
- contexte trop volumineux ;
- streaming interrompu.

Aucun message brut de provider, secret ou détail d'autorisation interne n'est présenté à l'utilisateur final.

## Limites de cette itération

- pas de fusion des historiques ;
- pas de profil Finance/RH/Legal tant que leurs frontières de données ne sont pas explicitement garanties par policy et QA ;
- les capacités MCP et agentiques restent soumises aux règles propres des itérations AI06/AI08 et au Tool Gateway ;
- aucune mutation sensible n'est autorisée du seul fait d'être en contexte `DTSC_INTERNAL`.
