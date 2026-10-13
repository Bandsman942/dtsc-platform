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

### Expérience Agent améliorée
- Le panneau Agent propose un lien direct vers `/ai/apps` pour consulter et renouveler les autorisations de connexion dans l’espace courant.
- Lorsqu’un run atteint sa limite, l’API renvoie uniquement un motif de budget sur une liste autorisée (étapes, outils, tokens, coût estimé ou durée), sans message technique ou données de modèle privées. Le panneau affiche une explication FR/EN contextualisée.
- Le message rappelle qu’un outil externe déjà exécuté ne doit pas être rejoué automatiquement et qu’une nouvelle demande exige une intention explicite ; il ne promet pas d’extension de quota hors du plan.


### Sécurisation du parcours de confirmation — tranche complémentaire
- Suppression de la double déclaration qui interrompait le script `qa:ai-agent-capability` et la régression globale en CI (l'échec initial provenait d'une `SyntaxError` réelle dans le script QA).
- L'API des confirmations en attente livre **au seul utilisateur authentifié et dans sa portée active** le texte intégral stocké pour les deux mutations prises en charge (`SUPPORT_TICKET_CREATE`, `DTSC_CONTACT_EMAIL_SEND`), avec cache privé désactivé. Les outils inconnus n'obtiennent pas d'aperçu trompeur.
- Le panneau Agent affiche le sujet, la priorité lisible le cas échéant et le message complet avant validation. L'utilisateur peut défiler le contenu long.
- L'approbation est **bloquée** lorsque le contenu n'est pas vérifiable ou qu'il s'agit d'une mutation non prise en charge par cet aperçu ; le refus reste accessible. Les codes d'outils bruts ne sont plus projetés dans le panneau.
- QA ciblée renforcée sur la source des arguments, l'isolation de session, les aperçus complets et l'absence d'approbation aveugle. La validation CI doit être réexécutée avant toute conclusion de réussite.

**Non livré** : E2E propriétaire, exécution Gmail/Calendar réelle et accès MCP certifié. Ne pas fusionner avant ces preuves.
