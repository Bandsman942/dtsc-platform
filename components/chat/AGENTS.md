# Assistant conversation UI — règles pérennes

- Chatbot DTSC et IA Assistant Entreprise partagent le socle `assistant-conversation-ui.tsx` pour le composer, les messages, l'état vide et les réglages de conversation.
- L'expérience doit rester inspirée des standards modernes de conversation IA sans copier une marque : lecture centrée, réponse assistant sans carte volumineuse, message utilisateur compact, historique dense, composer multiligne et menus contextuels.
- Ne pas réintroduire de grands conteneurs imbriqués autour du fil, du header ou du composer.
- Le composer IA utilise un `textarea`, `Entrée` pour envoyer, `Maj+Entrée` pour une nouvelle ligne et respecte la composition IME ainsi que les safe areas mobile/PWA.
- Le streaming ne doit pas déclencher de `scrollIntoView({ behavior: "smooth" })` à chaque token. Suivre le bas uniquement lorsque l'utilisateur est déjà proche du bas, avec une écriture de scroll bornée par frame.
- Les préférences visibles dans le menu sont persistées côté serveur par conversation ; le frontend n'est jamais la source de vérité du modèle, des sources ou des instructions.
- Ne jamais afficher une capacité de recherche Web tant qu'un backend DTSC réel, autorisé et audité ne l'implémente pas.
- Le Chatbot peut seulement proposer les sources réellement disponibles : contexte entreprise privé et documents/RAG autorisés.
- L'Assistant Entreprise peut seulement proposer les sources réellement disponibles : RAG de l'organisation et outils métier en lecture autorisés par entitlement/RBAC.
- Les instructions personnalisées d'une conversation ne contournent jamais RBAC, isolation tenant, confidentialité, confirmation humaine ou autres règles de sécurité DTSC.
- Les actions utiles du menu conversation comprennent au minimum configuration, épinglage, archivage/restauration, renommage/classement, partage, export, infos et suppression selon les capacités du domaine.
- L'IA Assistant Entreprise affiche les citations réellement persistées et le feedback Like/Dislike doit être persistant côté serveur.
- Toute UI nouvelle reste FR/EN et mobile-first.
