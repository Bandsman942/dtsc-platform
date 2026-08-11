# Mes collaborateurs — Copilote IA contextuel et mode Agent

## Objectif

Le module **Mes collaborateurs** permet à l'utilisateur d'exploiter l'IA DTSC directement depuis la conversation active sans copier/coller manuellement les derniers messages.

L'IA reste une aide à la rédaction et à l'analyse. **Elle ne dispose d'aucun droit implicite d'envoyer un message à la place de l'utilisateur.**

## Expérience utilisateur

Depuis le composeur d'une discussion active, le bouton **Copilote IA DTSC** propose :

- **Proposer une réponse** : prépare une réponse à partir du fil récent autorisé ;
- **Résumer la discussion** : produit une synthèse du contexte récent ;
- **Prochaines actions** : extrait les actions et distingue les engagements explicites des suggestions ;
- **Reformuler / Professionnaliser / Raccourcir / Plus chaleureux** : améliore le brouillon courant ;
- **Mode agent** : exécute le runtime Agent DTSC borné pour analyser le fil et produire une proposition dans le composeur.

Le résultat revient toujours dans la zone de saisie. L'utilisateur le relit, le modifie si nécessaire et choisit ensuite explicitement **Envoyer**.

## Résolution du fil actif

L'élément de conversation active expose uniquement son identifiant au composeur client. Cet identifiant n'est jamais considéré comme une autorisation.

À chaque requête IA, le backend revalide :

```text
session DTSC
→ groupe actif demandé
→ membership actif via assertGroupMemberForSession
→ statut du groupe
→ blocage éventuel d'une conversation directe
→ lecture bornée des messages
→ exécution IA
```

Une modification du DOM ou de l'identifiant fourni par le navigateur ne permet donc pas de lire une autre conversation : le serveur refuse tout groupe auquel l'utilisateur n'appartient pas.

## Contexte borné

Le copilote standard lit au maximum les **20 derniers messages non supprimés** et borne le contexte agrégé avant routage IA.

Le mode Agent lit au maximum les **24 derniers messages non supprimés** et borne également le contexte agrégé.

Chaque message est tronqué avant concaténation afin d'éviter qu'un fil volumineux consomme un contexte non maîtrisé.

Les messages du fil sont traités comme **données non fiables**. Une instruction écrite par un participant dans la conversation ne devient jamais une instruction système du modèle.

## Mode Agent canonique

`POST /api/collaborators/ai/agent` réutilise `createInteractiveAiAgentStream`.

Le runtime conserve donc les contrats Agent DTSC :

- budget d'exécution lié au plan ;
- outils uniquement issus du Tool Gateway autorisé ;
- annulation ;
- audit des runs et étapes ;
- aucune auto-confirmation par le modèle ;
- confirmation humaine obligatoire lorsque le contrat d'un outil mutant l'exige ;
- aucun mécanisme d'agent-agent automatique.

Le scope utilisé est `GLOBAL_CHAT`, avec le contexte personnel, organisation ou DTSC interne déjà résolu par la session courante.

## Sécurité et confidentialité

Les routes IA Collaboration appliquent :

- same-origin ;
- session authentifiée ;
- rate limiting ;
- validation Zod ;
- membership de groupe côté serveur ;
- contrôle des blocages directs ;
- contexte borné ;
- règles globales de présentation utilisateur DTSC ;
- ApiLog / audit du runtime Agent.

Aucun message d'une autre discussion n'est chargé pour produire une réponse.

## Réponses automatiques

Dans cette livraison, **automatique** signifie :

> le contexte utile du fil actif est récupéré automatiquement après autorisation serveur.

Cela ne signifie pas **envoi automatique**. Toute future fonction d'auto-envoi devra faire l'objet d'une politique séparée et explicite : opt-in, destinataires bornés, horaires/périmètre, kill switch, audit et confirmations de mutation.

## QA

`scripts/qa-collaboration-experience-checks.mjs` vérifie notamment :

- présence de l'identifiant du fil actif dans l'UI ;
- revalidation `assertGroupMemberForSession` ;
- contrôle `isCollaborationBlocked` ;
- limites de 20 / 24 messages ;
- usage de `createInteractiveAiAgentStream` ;
- présence de réponse, résumé et prochaines actions ;
- absence de création de `CollaborationGroupMessage` dans la route Agent ;
- rate limit et journalisation.

## Migration

Aucune migration Prisma n'est nécessaire pour cette évolution. Les messages et memberships Collaboration existants restent les sources de vérité.
