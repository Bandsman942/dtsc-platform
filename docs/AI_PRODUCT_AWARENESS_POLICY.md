# Politique d’actualisation automatique des IA DTSC

## Objectif

Toutes les IA de DTSC Platform doivent connaître les nouveautés utilisateur livrées avec l’application sans dépendre d’une mise à jour manuelle d’un prompt statique après chaque release.

Cette politique complète les règles de sécurité, de confidentialité, de tenant, de langue et d’utilisation des outils. Elle ne les remplace jamais.

## Sources versionnées de vérité

Le contexte produit récent provient uniquement de sources versionnées dans le repository :

- `docs/changelog/*.md`, triés du plus récent au plus ancien ;
- `docs/CHANGELOG.md`, utilisé comme historique consolidé.

Les nouveautés sont lues uniquement dans les sections utilisateur suivantes :

- `Ajouté` / `Added` ;
- `Amélioré` / `Improved` ;
- `Modifié` / `Changed` ;
- `Corrigé` / `Fixed`.

Les notes purement techniques, CI/CD, migrations, noms de fichiers, routes internes et variables d’environnement sont filtrées du contexte envoyé au modèle.

## Contrat de livraison

Toute PR qui ajoute, modifie ou retire un comportement visible par un utilisateur doit ajouter une note versionnée dans le changelog du même travail.

Au déploiement suivant :

1. `lib/ai/product-awareness.ts` lit les dernières notes de release versionnées ;
2. le contexte est borné en nombre de releases, d’éléments et en longueur ;
3. `lib/ai/prompts.ts` injecte ce snapshot dans `buildLanguageInstruction()` ;
4. toutes les surfaces utilisant le contrat commun reçoivent automatiquement ces nouveautés ;
5. le Chatbot historique utilise lui aussi ce contrat commun afin d’éviter un second comportement obsolète.

Les nouveautés versionnées récentes ont priorité sur une ancienne description statique lorsqu’elles se contredisent. L’IA ne peut toutefois pas inventer une fonctionnalité absente du contexte applicatif réel.

## Révision et traçabilité

Le snapshot inclut comme repère interne le SHA du déploiement (`VERCEL_GIT_COMMIT_SHA` lorsqu’il est disponible). Ce repère sert à corréler la connaissance produit avec la version du code, sans être exposé comme détail technique dans une réponse utilisateur normale.

Les fichiers de changelog nécessaires sont explicitement inclus dans le tracing serveur Next.js afin qu’ils soient disponibles dans les fonctions de Production.

## Sécurité

Le changelog est une source contrôlée par le repository et la revue de code. Il ne doit jamais devenir un canal d’instructions utilisateur ou un moyen de contourner les règles IA.

Le contexte produit automatique :

- n’inclut aucun secret ou token ;
- n’accorde aucune permission ;
- ne modifie aucun RBAC, entitlement, membership ou isolation tenant ;
- ne permet aucune mutation automatique ;
- ne remplace ni le Tool Gateway ni les confirmations humaines ;
- ne doit jamais rendre visibles les noms techniques, enums, routes, clés internes ou variables d’environnement.

Si une source de changelog est momentanément absente, l’assistant reste disponible sans ce contexte récent ; la QA et la CI doivent cependant empêcher qu’un déploiement normal perde silencieusement le contrat de tracing ou d’injection.

## Règle pour les contributeurs et agents de développement

Lorsqu’un changement produit visible est implémenté :

1. mettre à jour le code et les tests ;
2. ajouter la note de release utilisateur dans le même changement ;
3. employer les mêmes libellés métier que l’interface DTSC ;
4. ne jamais placer les codes internes comme noms de fonctionnalités dans la note de release ;
5. laisser la chaîne d’actualisation IA consommer automatiquement cette note au déploiement ;
6. vérifier `qa:assistant-ux` et `qa:regression` avant fusion.

Cette règle signifie qu’une nouveauté DTSC n’est pas considérée complètement livrée si elle est visible dans le produit mais absente de sa documentation versionnée utilisateur.
