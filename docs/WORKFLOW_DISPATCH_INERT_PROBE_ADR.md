# WF-06S2E1 — Probe d'inventaire inerte pour futur dispatcher (#853)

## Décision et périmètre
La PR #853 ajoute uniquement `inspectInertLockedWorkflowDispatchInventory`, appelé **nulle part en production**. Elle utilise `SELECT ... FOR UPDATE OF o SKIP LOCKED` pour simuler la contention de plusieurs workers dans une courte transaction, sans mise à jour. Elle n'émet aucun événement et n'appelle pas le moteur d'exécution. Le résultat porte systématiquement `kind: INERT_DISPATCH_LOCK_PROBE_ONLY`.

## Autorité et confidentialité
Filtrage SQL obligatoire sur `organizationId`, entreprise CLIENT ACTIVE, relation schedule tenant-aware et status RESERVED (schedule DISABLED/STAGED). Les métadonnées autorisées ne contiennent que schedule/occurrence/version, clé d'occurrence, UTC/date locale, fuseau et révision. Aucune source ERP, utilisateur, entrée/sortie métier, paiement ou secret. Un appel direct avec un ID arbitraire serait à refuser dans tout futur endpoint : **pas d'API ni de permission d'exécution exposée**.

## Bornes
Fenêtre de 24 h, `asOf` à ±5 min de l'horloge, `LIMIT 21`, 20 entrées max et `truncated` indicatif. Les lignes concurrentes verrouillées sont sautées ; `truncated=false` ne prouve pas qu'aucune autre occurrence n'existe. Les plafonds 50/10 de #848 sont purement techniques et les quotas commerciaux doivent venir des entitlements canoniques.

## Suite impérative sous #852
Le dispatcher devra effectuer **dans une transaction atomique** la revalidation des droits live (acteur/source/plan/tenant), le claim durable avec lease/CAS, l'unique run ou outbox persisté et l'avancement du curseur. Il devra traiter retries/crash/kill-switch/DST sans duplication. Il ne doit jamais accepter ce probe en tant que reçu d'autorisation ni l'utiliser pour lier un paiement.

## Sécurité DB et rollback
Aucune migration, aucun changement des contraintes inert #850. Supprimer le module `.mjs` et la QA si abandon, sans effacer de lignes. Tout test destructif doit utiliser `localhost/*test*`. Pas de Vercel Preview ni de déploiement feature. OWNER_E2E #853 distinct, #852 / #843 toujours ouverts.
