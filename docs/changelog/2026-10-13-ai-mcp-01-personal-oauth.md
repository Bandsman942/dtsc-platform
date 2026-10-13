## 2026-10-13 — AI-MCP-01 : connexions personnelles et entreprises distinctes

### Corrigé
- L'utilisateur individuel peut maintenant autoriser les applications MCP certifiées pour le contexte personnel, **sans appartenir à une entreprise**.
- Les autorisations OAuth restent strictement isolées entre le compte personnel de l'utilisateur et chaque entreprise active.
- Les serveurs réservés aux entreprises exigent toujours un contexte entreprise actif et un membership vérifié ; la page Applications connectées signale clairement ce prérequis.

### Sécurité
- La migration additive autorise `organizationId = NULL` pour les connexions personnelles et garantit l'unicité par utilisateur/serveur.
- Les identifiants restent chiffrés en AES-256-GCM avec une AAD liée à l'utilisateur, au contexte réel et au serveur ; les autorisations déjà liées à des organisations restent compatibles.
- OAuth PKCE, vérifications de scopes, restrictions d'hôte, contextes et révocation demeurent actives.
- Une connexion OAuth **ne signifie pas** qu'un outil MCP est certifié, activé ou accessible.

### Limites
- Les capacités réelles de lecture via MCP nécessitent encore les outils et bindings certifiés (#803).
- Les connecteurs qui ne sont pas configurés par DTSC ne deviennent pas disponibles avec ce correctif.
