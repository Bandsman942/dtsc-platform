## 2026-10-13 — AI-MCP-02 : autorisation personnelle dans le runtime MCP certifié

### Corrigé (première tranche)
- Les outils et ressources MCP certifiés pour un contexte personnel peuvent désormais utiliser une autorisation OAuth propre à l'utilisateur, sans organisation artificielle.
- Une autorisation personnelle ne peut jamais être utilisée lorsque le contexte actif est une entreprise : identité utilisateur, scope d'organisation et session active sont vérifiés avant la découverte et l'appel distant.
- Les serveurs réservés aux entreprises continuent à exiger une organisation active et une autorisation correspondante.
- Les contrôles READ-only, permissions, classifications de données, versions de discovery, hashes de schémas et Tool Gateway restent obligatoires.

### Limites et validation nécessaires
- Aucun serveur externe, outil ou fournisseur supplémentaire n'est automatiquement activé par cette correction.
- L'utilisation réelle de Gmail et Google Calendar nécessite toujours une configuration certifiée, des scopes OAuth réels, des bindings approuvés et une preuve E2E réseau sur le fournisseur.
- La présence au catalogue et une connexion OAuth ne valent pas succès d'appel MCP.

### Preuve opérationnelle sans faux positif
- Centre IA/MCP : métrique historique de succès de lecture provenant exclusivement des audits `TOOL_CALL`/`SUCCESS`, avec horodatage du dernier succès et état de mesure indisponible si la base ne répond pas. Les autorisations OAuth et `tools/list` n'y comptent jamais comme lecture réussie.
- Aucun serveur Gmail/Calendar n'est déclaré opérationnel tant que la preuve de connexion réelle au compte volontaire, des outils READ sélectionnés et du `OWNER_E2E` n'est pas fournie.
