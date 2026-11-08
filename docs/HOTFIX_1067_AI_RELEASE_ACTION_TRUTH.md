# Hotfix A #1067 — Contexte IA de release et vérité des actions

## Diagnostic vérifié
La conversation fournie montre une réponse fondée sur des notes datées du 13 octobre alors que le code principal dispose de notes de novembre, suivie d'une affirmation « ticket transmis » sans preuve d'un ticket réel. Deux causes ont été identifiées : `lib/ai/product-awareness.ts` priorisait les fragments d'archives avant le changelog récent et exigeait `### Ajouté/Corrigé` alors que les derniers hotfixes sont des puces sous `## date`. De plus, l'exécuteur mail acceptait `sent:false` comme résultat `SUCCESS`, tandis que le service Zoho excluait son adresse contact dans le mode par défaut.

## Implémentation
- La version courante est importée de `package.json` et la révision de déploiement vient de `VERCEL_GIT_COMMIT_SHA`. `docs/CHANGELOG.md` est lu avant les archives de `docs/changelog`. Les puces de release récentes entrent désormais dans le contexte même sans sous-titre `###`.
- Le contexte dynamique est injecté à chaque tour via `buildLanguageInstruction` dans l'IA générale **et** dans l'assistant entreprise. Le code actuel inclut déjà `docs/CHANGELOG.md` et `docs/changelog/*.md` dans le tracing Next.js ; aucun second index RAG à reconstituer pour les notes de release. La nouvelle image de déploiement rend les anciennes versions inapplicables. Les données privées continuent à passer par leur propre resolver d'autorisation.
- Les prompts FR/EN interdisent de présenter une simple confirmation utilisateur ou un texte antérieur comme la preuve d'une action accomplie.
- Le transport contact utilise le mode mail direct et autorise l'adresse destinataire officielle. Le résultat du mail est strictement `sent: true`; un échec de l'envoi est enregistré comme `FAILED` par `AiToolExecution`. Le numéro du `ContactMessage` n'est pas inventé comme un numéro de message fournisseur.
- Le ticket doit porter un `ticketId` non vide. Les actions utilisent toujours `AiToolConfirmation`, `AiToolExecution`, les permissions existantes, la limitation de débit, l'isolation tenant et le journal d'audit, sans nouvelles tables.
- `GET /api/ai/tools/history` renvoie jusqu'à 12 événements de la session avec preuve filtrée (statut réel, référence ticket/contact), sans arguments ou données sensibles, avec `private, no-store`; filtre optionnel de conversation et tenant.
- L'UI d'actions vérifiées n'annonce `SUCCEEDED` que si l'exécution réelle en base possède la preuve requise ; un échec affiche « non effectué ». Les confirmations restent sous contrôle explicite de l'utilisateur.

## Limites explicitement conservées
`sent:true` signifie une acceptation par le transport (Zoho/webhook) et **non** une lecture ou une livraison garantie à la boîte de réception. Les notes de version sont des déclarations de fonctionnalités livrées, pas une preuve du plan du client ni de l'état live d'un connecteur. Toute action nouvelle requiert sa propre exécution autorisée ; un modèle de langage ne peut pas se donner ce droit.

## Validation
```bash
node scripts/qa-hotfix-1067-ai-action-truth.mjs
pnpm qa:assistant-ux
pnpm qa:regression
pnpm type-check && pnpm lint && pnpm build
```
E2E : nouvelle conversation demande « nouveautés de novembre » : la version active est citée. Demander création d'un ticket : contrôle de confirmation visible, aucun ticket avant clic, puis véritable ID en historique. Refuser la confirmation : aucune action envoyée. Répéter pour un mail à DTSC ; mettre le transport en échec dans un environnement de test, exiger statut FAILED, jamais « envoyé ». Tester français/anglais, offres, droit de lecture et isolation de deux comptes.

Pas de Preview Vercel, pas de migration ni modification de secrets. Production seulement après fusion sur `main` et E2E final global A+B+C du propriétaire. **Rollback** : revert de la PR ; les lignes `AiToolExecution` restent l'historique canonique.
