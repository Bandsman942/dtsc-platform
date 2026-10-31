# UX-03C #989 — Retours typés Banque/Rapprochement

## Portée

- Parent : #938, complément indépendant de #986 / PR #988.
- Écrans actifs : Finance Banque, Rapprochement ; les formulaires partagés de Caisse bénéficient aussi de la locale explicite.
- Source de vérité inchangée : réponses des routes Finance réelles, permissions et contexte entreprise résolus côté serveur.
- Aucun changement métier, de devise, d'écriture, de route API, de schéma ou de migration.

## Contrat du feedback

1. Les lectures de liste et de détail conservent le code métier et le statut HTTP dans un `FinanceApiError` ; le message libre du serveur n'est jamais exposé par cette couche de lecture.
2. Les pannes réseau sont distinguées des refus HTTP, sans deviner si une écriture a réussi. La locale du workspace est transmise aux messages sûrs FR/EN.
3. Quand un changement de filtre ou d'entreprise annule la requête précédente, cette dernière ne peut pas réinitialiser les éléments, la pagination ou le chargement de la nouvelle requête.
4. Un match financier ne peut être annoncé comme rejeté si l'écriture a été confirmée mais la lecture de détail échoue ensuite. Dans ce cas, le dialogue se ferme et une notice indique que le match est enregistré, puis demande de consulter la liste avant une nouvelle action.
5. Sur un refus de mutation, le formulaire de saisie reste ouvert, ses valeurs conservées et aucun toast de succès n'est envoyé.

## Vérification locale

Commande : `node scripts/qa-ux-989-finance-bank-feedback.mjs`.

Assertions : codes/status HTTP 400/401/403/409/422/429/500, raison métier de conflit, absence de message privé brut, panne réseau, réponse illisible, lecture par identifiant, annulation, propagation de la locale et séparation écriture/rafraîchissement.

## Recette propriétaire — OWNER_E2E #989 (non exécutée)

Sur deux entreprises distinctes de recette, avec un initiateur, un approbateur et un utilisateur non autorisé :

1. Naviguer Banque/Rapprochement à 320, 390 et 1024 px en FR/EN, clair/sombre ; contrôler focus clavier, zoom et absence de double défilement.
2. Charger liste vide puis liste paginée ; lancer deux recherches rapidement, faire échouer la première, vérifier que seule la seconde détermine le résultat. Changer d'entreprise et confirmer l'absence de données croisées.
3. Ouvrir un relevé via lien direct ; simuler un refus HTTP 401, 403, 409, 422, 429 puis 500 (sur environnement isolé ou avec interception de test). Vérifier le message sûr, l'absence de SQL, stack, ID d'entreprise ou jeton ; rejouer la même erreur pour observer le nouveau feedback.
4. Importer un CSV valide et invalide, créer un rapprochement, matcher une ligne et soumettre une décision autorisée. En cas de rejet, confirmer la préservation des champs et l'absence de message de réussite.
5. Après un match accepté par le serveur, simuler uniquement l'échec du GET de détail : vérifier l'indication « enregistré, mais détail non actualisé », la fermeture de la saisie, le rafraîchissement de liste et l'absence de second POST automatique.
6. Vérifier qu'un non-approbateur et une entreprise distincte ne peuvent ni consulter ni décider les objets interdits. Contrôler l'audit serveur et l'idempotence/révision existantes.

## États et livraison

- `LOCAL_EXECUTED` : QA statique/runtime #989 (compléter la matrice de PR avec les résultats réels de TypeScript, lint et régression).
- `NOT_EXECUTED` : CI distante, parcours navigateur multi-rôles, OWNER_E2E, merge, Production.
- Aucun Preview Vercel. Après CI verte et signature E2E propriétaire, fusion sur `main` puis contrôle du déploiement Production unique.
- Rollback : revert applicatif de la PR, sans mouvement de données.
