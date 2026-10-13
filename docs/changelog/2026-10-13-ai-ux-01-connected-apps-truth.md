## 2026-10-13 — Hotfix AI-UX-01 : repères vérifiés des applications connectées

### Corrigé
- Les assistants DTSC utilisent désormais le bon sens de MCP (**Model Context Protocol**) et orientent vers **Applications connectées** plutôt que vers des chemins inventés.
- Une application simplement affichée au catalogue, un compte autorisé par OAuth et un outil MCP réellement utilisable ne sont plus présentés comme une seule et même chose.
- En cas d'absence d'organisation active, l'aide explique honnêtement la limite actuelle des connexions personnelles, sans annoncer un parcours OAuth qui n'est pas disponible.
- Les informations sur les offres et les droits individuels ne sont plus censées être déduites d'une conversation ou d'une simple note de version.

### Amélioré
- Lorsqu'une conversation du chatbot général concerne MCP ou les applications externes, l'assistant reçoit les **états de connexion autorisés du compte courant** depuis le catalogue existant, sans lire les e-mails, calendriers ou ressources des fournisseurs.
- Si cet état ne peut pas être vérifié, l'assistant l'indique au lieu d'inventer une connexion réussie.
- Les consignes de présentation FR/EN et les contrôles QA distinguent explicitement le catalogue, OAuth et les outils.

### Limitations maintenues
- Les connexions OAuth purement personnelles sans organisation active restent hors périmètre de ce correctif ; elles seront traitées par AI-MCP-01 (#801).
- Aucun nouveau fournisseur MCP ni outil n'est activé par ce hotfix.
