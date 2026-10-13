# Centre de pilotage IA — Console DTSC (AI-CONSOLE-01)

## Emplacement et responsabilités

- URL canonique : `/admin/ai-control-center`.
- Groupe de navigation : « Réglages de la plateforme ».
- Contrôle de contexte : `isDtscInternalSession(session)` et `canAccessAdministration(role)` dans `DtscConsolePage`.
- Capacité dédiée de consultation : `CONSOLE_AI_READ`. Capacité réservée d'administration : `CONSOLE_AI_MANAGE` (aucune mutation activée dans ce hotfix).
- Le mapping `CONSOLE_PLATFORM_SETTINGS` est **volontairement partagé** comme famille de module de Console, pas comme permission. `CONSOLE_SECTION_ADMIN_BLOCK["ai-control-center"] = null` supprime l'accès implicite hérité du bloc Settings; seuls admin global en contexte DTSC et permissions individuelles explicites peuvent lire.

## Sources des indicateurs et unités

`lib/console/console-ai.ts` produit exclusivement des **métadonnées agrégées**. Pas de `userId`, `organizationId`, texte de message, prompt, argument d'outil, ressource MCP ni jeton.

| Mesure | Autorité | Définition | Statut inconnu |
| --- | --- | --- | --- |
| Appels IA | `AiModelCall` | Comptage des lignes créées dans la fenêtre UTC `[from,to)` (inclut STARTED) | `—` si DB indisponible |
| Tokens | `AiModelCall.totalTokens` | Somme des appels `SUCCESS` sur la fenêtre | `—` si DB indisponible |
| Taux de réussite | `AiModelCall.status` | `SUCCESS / (SUCCESS+FAILED+CANCELLED)` | `—` sans appel terminal |
| Coût USD estimé | `AiModelCall.estimatedCost` | Somme de `SUCCESS` tarifé `EXACT/ESTIMATED` et devise `USD` uniquement | `—` en absence d'appel tarifé |
| Couverture du coût | `AiModelCall.costKind` | Appels `SUCCESS` tarifés en USD / appels `SUCCESS` | `—` sans succès |
| Latence P95 | `AiModelCall.durationMs` | `PERCENTILE_CONT(0.95)` des durées `SUCCESS` | `—` sans échantillon |
| Fallbacks | `AiModelCall.fallbackUsed` | Nombre d'appels avec fallback, distinct des tentatives provider | `—` en indisponibilité |
| Fournisseurs | `AiModelCall.providerCode` | Top 8 par nombre d'appels, groupement serveur | Aucun élément ≠ panne |
| Runs Agent | `AiAgentRun.status` | Comptage des runs démarrés, terminés, échoués et épuisement du budget | `—` si DB indisponible |
| MCP | Registre certifié + bindings activés | Compte des configurations certifiées et bindings activés | Disponibilité réseau et droit utilisateur **non mesurés** |

**Important :** `AiProviderAttempt` explique les tentatives; `AiAgentRun` représente l'exécution agentique; `UsageLog` représente une vue d'usage historique. **Ne pas additionner** ces compteurs aux appels de `AiModelCall`, sinon le coût et les tokens sont dupliqués. Une absence de tarif n'équivaut jamais à un coût nul. Pour l'instant, le tableau décrit la télémétrie enregistrée, pas une facture de fournisseur.

## UX

- Indicateurs et tables compactes, choix de 24 h / 7 j / 30 j / 90 j.
- Période, unité, source et actualisation visibles.
- FR/EN, mode sombre, responsive mobile, lisibilité des tableaux avec défilement local et navigation clavier.
- Seule la section consultée charge ses agrégats : aucun polling ajouté au shell.
- Les futures vues modèles, quotas, MCP, agents, connaissances et sécurité viendront via #800, #802 et #804. Aucun bouton de configuration factice.

## Sécurité et audit

Section **en lecture seule**; aucune mutation, migration ou backfill. Les actions d'administration IA restent hors périmètre. Les erreurs de lecture sont traitées comme indisponibilité (`null`) et non comme zéro / santé OK. Aucune information de connexion privée ne traverse la Console.

## Contrôles et preuve

- `pnpm qa:console-ai`
- `pnpm qa:standard-dtsc-console`
- `pnpm qa:regression`, `pnpm type-check`, `pnpm lint`, `pnpm build`
- E2E propriétaire : accès admin DTSC, refus utilisateur client / rôle non autorisé, quatre périodes, FR/EN, 320–1024 px, unknown vs 0, absence de données sensibles.

**Rollback :** revert par PR depuis `main` : la section et son service de lecture sont isolés, aucune modification de données ni configuration Vercel. Production exclusivement depuis le `main` validé.


## Hotfix AI-CONSOLE-02 — politique globale versionnée et effective

La configuration des fournisseurs et modèles se présente avec la source du catalogue, l'état de présence des clés (jamais leurs valeurs), les plafonds serveur `SERVER_LIMITS` et les offres commerciales `BillingPlan`. Aucun quota commercial n'est recopié dans une table IA.

L'édition par `CONSOLE_AI_MANAGE` publie une politique **restrictive uniquement** dans `AiPlatformRuntimePolicy` avec révision optimiste. La migration `20261013143000_ai_platform_runtime_policy` ajoute cette table sans réécrire les anciens plans ou les agents en cours. Les changements nécessitent une justification (8–500 caractères), une provenance même origine, un audit de haut risque et `PlatformSettingHistory` transactionnel. Les conflits de version retournent `409 REVISION_CONFLICT`.

La politique publiée contrôle les fournisseurs et modèles désactivés à la sélection de modèle et ajoute, au démarrage **et à la reprise**, des plafonds Agent plus stricts que `SERVER_LIMITS`. Aucun abaissement du degré de classification et aucun ajout de mode outil n'est autorisé ; le catalogue, l'abonnement et la politique serveur gardent priorité. Les erreurs de lecture de la politique ne doivent jamais réactiver silencieusement un fournisseur suspendu : l'orchestration échoue fermée.

**Retour arrière :** consulter l'historique borné à 20 versions, préparer une ancienne configuration puis la republier avec motif, en créant une **nouvelle révision** auditée. En cas de rollback de livraison, conserver la table additive et ses données ; ne jamais supprimer les historiques de sécurité. **Secrets** : seulement un booléen de présence dans la Console ; aucune clé dans les logs, JSON de politique ou navigateur.

**E2E #808 :** droits READ et MANAGE distincts, conflit concurrent 409, désactivation réelle d'un modèle et d'un fournisseur dans le routeur, réduction de budget Agent au début et à la reprise, restauration auditable, FR/EN, mobile, refus des valeurs > plafond serveur, absence de secrets, matrice de coût UNKNOWN correcte.
