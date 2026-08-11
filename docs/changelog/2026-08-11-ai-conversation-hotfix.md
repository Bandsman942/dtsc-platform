# Changelog — 2026-08-11 — IA conversationnelle, MCP et actualisation produit

## 2026-08-11 — IA conversationnelle : UX mobile, applications connectées et contexte produit

### Corrigé

- Le composeur de **Mes collaborateurs** donne désormais toute la largeur utile au brouillon préparé par l’IA et place les actions dans une barre inférieure, afin de conserver une relecture et une édition confortables sur mobile avant l’envoi manuel.
- Le Chatbot général applique le même contrat de présentation enrichie que l’Assistant IA Entreprise : titres courts, listes, étapes, emphase, citations et tableaux compacts lorsque cela améliore réellement la compréhension.
- Les applications connectées distinguent désormais une intégration certifiée mais en attente de configuration OAuth DTSC d’une intégration qui n’a pas encore été certifiée.

### Ajouté

- Gmail et Google Calendar sont intégrés au registre MCP officiel DTSC avec authentification OAuth utilisateur, permissions de lecture minimales et comportement fail-closed.
- La page **Applications connectées** guide l’utilisateur en quatre étapes : choisir une application, vérifier les permissions, s’authentifier chez le fournisseur puis revenir automatiquement dans DTSC.
- Les IA DTSC reçoivent automatiquement un contexte des nouveautés produit récentes à partir du changelog versionné livré avec chaque déploiement.

### Amélioré

- Les permissions OAuth techniques sont présentées avec des libellés métier compréhensibles au lieu d’URLs de scopes.
- Le contexte produit automatique donne priorité aux nouveautés versionnées lorsqu’elles remplacent une ancienne description statique, sans exposer les détails techniques internes.
- Le flux OAuth Google demande un accès durable côté serveur afin de pouvoir renouveler l’autorisation sans exposer de jeton au navigateur ou au modèle IA.
