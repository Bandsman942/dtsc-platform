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


### Résolution ciblée des validations en attente
- Le panneau Agent récupère désormais la **confirmation exacte** annoncée par le run via `GET /api/ai/tools/pending?confirmationId=<uuid>`, au lieu de la chercher dans les cinq derniers éléments de l'utilisateur. Cela évite qu'une confirmation valide soit masquée lorsque plusieurs actions sont en attente.
- L'API refuse un identifiant de confirmation invalide et exige simultanément l'utilisateur authentifié, le contexte entreprise correct, un statut `PENDING` et une expiration future avant de révéler l'aperçu. Aucune donnée d'un autre utilisateur ou tenant n'est renvoyée.
- Le refus d'une action demande maintenant explicitement l'annulation du run sans dépendre de l'état React asynchrone du bouton de validation. Aucun renvoi d'action distante déjà validée n'est déclenché.
- Une nouvelle assertion QA contrôle le filtrage exact et la gestion du refus. L'E2E propriétaire avec compte connecté et données de test reste une preuve humaine distincte.

### Reprise sûre après rechargement
- Ajout de `GET /api/ai/agent/runs/active?variant=chatbot|enterprise` en lecture uniquement, avec session réelle, portée personnelle/entreprise, type d'assistant, fenêtre temporelle bornée et réponse `no-store`.
- Seuls les runs `WAITING_CONFIRMATION` et `READY_TO_RESUME` de l'utilisateur courant sont récupérés après actualisation de la page ; un ancien flux `RUNNING` n'est jamais déclaré vivant sur la seule base du statut persistant.
- Le Dock restaure l'identifiant du run et la conversation sans répéter la requête initiale, sans nouvel appel externe et sans confirmer une action. La reprise reste un geste humain explicite.
- L'E2E propriétaire reste requis pour vérifier la réapparition du run, l'aperçu des arguments et les restrictions entre comptes et entreprises.

### Guidage métier selon la disponibilité réelle
- Le READ `CONNECTED_APPS_STATUS_READ` fournit désormais, pour chaque application, une explication FR/EN et un **code d'étape suivante** à partir de l'état de connexion réellement vérifié (choisir une organisation, autoriser, renouveler, contacter DTSC, attendre la certification ou vérifier une lecture distante réelle).
- Cette logique réutilise le dictionnaire canonique `lib/ai/mcp/product-guidance.ts` et demeure strictement contrôlée par un schéma Zod. Elle n'exécute ni OAuth, ni `tools/call`, ni mutation et ne devine pas l'accessibilité des fournisseurs.
- Le statut `CONNECTED` oriente vers la **vérification** d'une lecture distante, jamais vers l'affirmation qu'elle a déjà réussi.


### Refus transactionnel et révocation des accès
- Le rejet d'une action depuis le Dock utilise uniquement `POST /api/ai/tools/cancel` : cette route met déjà fin au run associé. Un second appel d'annulation déclenchait auparavant une erreur 404 trompeuse après un refus pourtant réussi.
- L'annulation de confirmation et l'arrêt du run sont désormais **transactionnels**, bornés par propriétaire, organisation et statut. La confirmation refusée est invalidée, son contenu sensible purgé et sa date d'annulation enregistrée. L'annulation d'un run par le bouton général invalide également son approbation encore en attente, pour empêcher un envoi ultérieur depuis une autre interface.
- Avant récupération de run, consultation d'un aperçu, approbation ou refus, une session d'entreprise doit encore posséder un membership **actif** dans cette entreprise ; un cookie périmé ne suffit pas.
- La QA contrôle ces invariants. Les races extrêmes entre confirmation concurrente et exécution distante nécessitent encore un test E2E authentifié et ne constituent pas une promesse d'annulation d'une action déjà exécutée.


### Révocation de membership pendant un run

Les endpoints de statut, d'annulation et de reprise d'un run Agent revalident également `requireActiveOrganizationMembership` avant la lecture ou la mutation en contexte entreprise. Une entreprise retirée de la session ne reste pas implicitement autorisée à consulter les étapes, valider, relancer ou annuler un ancien run. Cette règle s'ajoute aux vérifications déjà appliquées aux confirmations, aux aperçus et à la récupération de run. La QA transverse d'isolation accepte maintenant l'implémentation transactionnelle Prisma, qui vérifie `userId`, `organizationId`, `status=PENDING` et purge les arguments, au lieu d'exiger uniquement la forme textuelle de l'ancien SQL ; elle **renforce** le contrat d'isolation plutôt que de le désactiver.
