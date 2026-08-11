# Changelog — 2026-08-11 — Google Calendar MCP

## 2026-08-11 — Autorisations Google Calendar alignées

### Corrigé

- Google Calendar utilise désormais les permissions de lecture recommandées pour le serveur MCP officiel : consultation de la liste des calendriers, vérification des disponibilités et lecture des événements autorisés.
- Une connexion Google Calendar déjà enregistrée n’est plus présentée comme pleinement connectée si ses autorisations ne couvrent plus le contrat actuel de l’intégration certifiée.
- Lorsqu’une autorisation doit être actualisée, l’utilisateur voit une action claire **Renouveler l’autorisation Google Calendar** et repasse par la page sécurisée de Google.

### Sécurité

- DTSC ne transmet aucun appel MCP avec une connexion dont les autorisations enregistrées sont devenues insuffisantes ; une nouvelle autorisation utilisateur est exigée avant reprise.
- La vérification de compatibilité des permissions utilise uniquement la liste des autorisations accordées stockée côté serveur et ne déchiffre pas le jeton pour déterminer l’état affiché.
- La baseline Google Calendar reste strictement en lecture seule dans DTSC ; aucune mutation Calendar n’est activée par ce changement.

### Compatibilité

- Aucune migration de base de données n’est nécessaire : les autorisations accordées sont déjà stockées avec chaque connexion OAuth.
- Gmail conserve sa baseline DTSC en lecture seule et ne demande pas de nouvelle permission d’écriture dans cette livraison.
