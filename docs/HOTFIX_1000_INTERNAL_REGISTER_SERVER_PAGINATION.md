# #1000 — Registres internes : pagination, filtres et comptages serveur

## Périmètre

- Nouveau point de lecture `GET /api/admin/internal-registers/{section}/{datasetId}` pour les 35 registres des sections HR&CFO, SCO, COO, CEO, MPO, CTO et Juridique/LA.
- Liste blanche explicite des modèles et des colonnes de recherche ; authentification interne DTSC, permission du bloc administratif et limitation de débit par utilisateur.
- Filtres composables `search` (120 caractères maximum), `status`, `from`, `to` (dates de création inclusives, fuseau Kinshasa), `page` et `pageSize` (12 par défaut, 25 maximum).
- Recherche et comptages réalisés dans PostgreSQL avant pagination ; compte exact du filtre courant, répartition exacte des statuts dans le contexte recherche + dates, ordre déterministe `(createdAt DESC, id DESC)`.
- Pages client récupérées au fil de l'eau. Réponses obsolètes annulées, recherche temporisée, affichage de chargement/erreur et nouvel appel après mutation.
- Les métriques de la page d'accueil des départements sont explicitement qualifiées d'« aperçu » car leur calcul historique s'appuie encore sur les premiers éléments chargés. **Ne pas les utiliser comme indicateurs financiers certifiés.**

## QA technique

```bash
node scripts/qa-hotfix-1000-internal-register-pagination.mjs
node scripts/qa-console-internal-workspaces.mjs
NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit --pretty false
```

Ces vérifications statiques ne remplacent pas le test sur une base contenant plus de 60 lignes, ni les contrôles RBAC en session.

## OWNER_E2E requis avant fusion

1. Dans un environnement contenant **au moins 65 éléments d'un même registre**, ouvrir chaque direction et un registre représentatif ; confirmer que page 6 (12 lignes/page) est accessible et que les éléments 61–65 sont visibles.
2. Chercher un élément qui se trouve au-delà des 60 premières lignes ; vérifier le bon résultat et le total renvoyé par le serveur.
3. Combiner statut, texte et plage de dates ; vérifier que les puces de statuts présentent les chiffres correspondant à la recherche/période, et que le décompte filtré correspond aux lignes accessibles par pagination.
4. Sur deux éléments ayant une date identique, changer de page puis revenir : aucune duplication ou disparition liée à l'ordre (date puis identifiant).
5. Avec les rôles CEO, COO, SCO, HR&CFO, CTO et MPO : vérifier les accès autorisés et obtenir `403` en appelant un registre d'une direction interdite, y compris en modifiant directement l'URL de l'API. Vérifier `401` hors session.
6. Créer, modifier puis supprimer un élément dans un registre accessible en écriture ; vérifier le rafraîchissement de la liste, des totaux et des statuts, y compris si l'élément ne correspond plus au filtre actif.
7. Vérifier les erreurs de filtres (`from > to`, date invalide, `pageSize > 25`), l'anti-abus `429`, les versions mobile (320–430 px), bureau, thème clair/sombre et connexion lente.

## Limites et suivi

- Les formulaires de création et de modification conservent les listes de références chargées par le rendu initial : les listes d'options très volumineuses peuvent justifier une API de sélection distante dédiée.
- Les tableaux de bord agrégés de départements et les soldes financiers devront évoluer vers des agrégations certifiées, distinctes de cette pagination des registres.
- Examiner `EXPLAIN (ANALYZE, BUFFERS)` sur le volume réel en préproduction pour les requêtes `where + createdAt/id`; proposer les index composés utiles seulement après mesure afin d'éviter une migration spéculative en production.
- La pagination à décalage (`skip/take`) sert les volumes courants ; pour de très hauts volumes, évaluer une pagination par curseur avec une UX dédiée.

**Statut de validation :** `LOCAL_EXECUTED` uniquement pour les commandes réellement exécutées ; `CI_PROVEN` et `OWNER_E2E` en attente.
