## 2026-10-13 — AI-CONSOLE-02 : visibilité sur les modèles, fournisseurs et quotas

### Amélioré
- L'Administration DTSC dispose d'un panneau compact de consultation des fournisseurs IA, modèles du catalogue et indicateurs de présence de clés serveur (sans révéler les clés).
- Les plafonds de sécurité du mode Agent sont présentés séparément des limites commerciales des abonnements.
- Les offres commerciales sont lues directement depuis `BillingPlan` ; aucun nouveau tableau de prix ou de quotas parallèle n'est créé.

### Ajouté

- Des politiques IA mondiales persistées, limitées aux restrictions de modèles, fournisseurs et plafonds Agent, avec contrôle des permissions `CONSOLE_AI_MANAGE`.
- Une publication transactionnelle avec motif obligatoire, révision concurrente et journal d'audit.
- L'application effective au routage et aux budgets Agent, y compris lors de la reprise.
- Un historique des versions permettant de restaurer une ancienne configuration via une nouvelle publication contrôlée.

### Vérifications restantes

- Validation automatique de la PR et E2E propriétaire #808 avant toute fusion.

### Contexte de livraison précédent
- Les politiques et le rollback sont désormais implémentés, en attente de vérification CI et E2E.

### Sécurité
- Panneau de consultation : aucune mutation ou divulgation de secret.
- Les règles d'accès IA, classification de données et droits d'abonnement restent appliqués côté serveur.
