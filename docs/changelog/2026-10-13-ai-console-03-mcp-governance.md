## 2026-10-13 — AI-CONSOLE-03 : gouvernance MCP et assistants

### Ajouté
- Panneau « Serveurs MCP et assistants » dans le Centre IA de la Console DTSC.
- Vue des serveurs du registre certifié, configuration (sans secrets), autorisations OAuth agrégées, bindings actifs, dernier snapshot de découverte et compatibilité des schémas.
- Statut de joignabilité **non mesuré** : un serveur certifié, un compte autorisé ou un binding activé ne prouve jamais qu’un outil est opérationnel.
- Registre des assistants et de leurs politiques (outils, connaissance, classification des données).
- Commande d’urgence **suspendre/réactiver un serveur MCP** soumise à `CONSOLE_AI_MCP_MANAGE`, confirmation explicite, motif obligatoire, révision concurrente et historique audité.
- Vérification de cette suspension directement avant tout appel réseau MCP, y compris la découverte.

### Protection
- La console n’édite pas de JSON brut et ne certifie ni n’active automatiquement les outils découverts.
- L’isolation des utilisateurs et entreprises, les politiques Tool Gateway, les scopes OAuth et les permissions métier restent obligatoires.
- Les métriques OAuth ne sont que des comptes agrégés, jamais des jetons ou des données personnelles.
- Migration additive de l’état des contrôles MCP, sans altérer les autorisations existantes.

### Limites
- La validation opérationnelle d’un serveur distant exige toujours un test réseau authentifié et les E2E de #803.
- Aucun nouveau connecteur MCP ou outil en mutation n’est activé par ce hotfix.
