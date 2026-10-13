## 2026-10-13 — AI-AGENT-01 : capacité conversationnelle de lecture des applications

### Première tranche
- Le mode Agent général et le mode Agent entreprise peuvent demander un outil `CONNECTED_APPS_STATUS_READ` certifié de type READ, sans écriture ni faux résultat distant.
- Cet outil lit les **seuls états d'applications du compte et du contexte actif** et retourne le chemin canonique `/ai/apps`, sans jetons, permissions OAuth brutes, endpoints, contenus des fournisseurs ni identité d'organisation.
- L’état OAuth connecté n'est **jamais** présenté comme une lecture d'e-mail ou d'agenda réalisée. L'exécution MCP réelle reste l'autorité distincte.
- La passerelle commune revalide l'identité du compte, les droits entreprise, les schémas d'entrée/sortie et l'audit avant exécution.
- Le contexte personnel ne peut plus utiliser une organisation fournie dans un contexte d'outil.

### Restant à terminer dans #805
- Parcours conversationnels guidés depuis les statuts OAuth vérifiés jusqu'aux outils MCP READ certifiés, avec preuves E2E réelles.
- UX complète de préparation d'actions, confirmation humaine structurelle, reprise et diagnostic des budgets épuisés.
- QA complète, E2E propriétaire et fusion interdite avant clôture des critères de #805.
