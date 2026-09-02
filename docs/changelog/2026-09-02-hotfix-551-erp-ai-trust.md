# Hotfix #551 — fiabilité des créations ERP et confiance IA

## Corrigé

- Les créations des cinq modules commerciaux livrés (tiers, catalogue, pipeline CRM, devis/commandes et contrats) ne sont plus signalées en échec lorsqu'une notification, un journal d'audit ou une télémétrie post-transaction échoue.
- Les erreurs métier de création sont désormais localisées, stables et actionnables, sans exposition des erreurs Prisma ou internes.
- Le chatbot général est limité au périmètre personnel et produit; les données ERP autorisées relèvent d'IA Entreprise, et les actions outillées du mode Agent.
- IA Entreprise exige une provenance réussie avant toute affirmation factuelle sur l'entreprise et n'invente plus de données d'exemple sans demande explicite.
- Les résultats d'outils transmis au modèle sont minimisés afin de ne pas injecter les charges backend brutes dans la conversation.
- Les conversations permettent de choisir un effort de raisonnement automatique, faible, moyen ou élevé quand le modèle sélectionné le prend en charge.

## Migration

- Ajout de `reasoningEffort` aux préférences des conversations générales et Entreprise.
- Le recours aux outils d'IA Entreprise devient explicite (`useTools = false` par défaut), ce qui matérialise la frontière avec le mode Agent.

Voir aussi : `docs/HOTFIX_551_ERP_AI_TRUST.md`.
