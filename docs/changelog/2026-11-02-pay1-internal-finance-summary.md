# 2026-11-02 — DTSC Payments PAY-1 (#372), suite après fusion du hotfix #1007

## Ajouts isolés dans la PR PAY-1 #1004

- Branche PAY-1 synchronisée avec `main` après la fusion de la fiche de validation mobile #1007 ; les tests de régression gardent les contrats PAY-1 et hotfix.
- `GET /api/admin/dtsc-payments/summary` : lecture interne authentifiée du volume des paiements SaaS, agrégée par **devise** et **statut**, bornée à 366 jours. Vérification en temps réel du contexte `DTSC_INTERNAL`, de l'appartenance active et de la capacité `SUBSCRIPTIONS_READ` ; pas de filtre de tenant client contrôlé par l'appelant.
- Réponse monétaire `Decimal` sérialisée en chaîne et explicite `accountingBalance: false` : ce résumé ne remplace pas le grand livre, les transactions `POSTED` ou le rapprochement de trésorerie.
- Machine d'état durcie : annulation/reprise locale impossible quand une référence externe provider, un checkout ou un callback existe ; seul PAY-4 pourra autoriser une compensation vérifiée.
- QA ciblée complétée par des tests de refus hors contexte interne, filtres invalides, période trop longue, limitation de débit, rendu monétaire par devise et traces PSP.

## Non livrés / critères de sortie

- Aucun webhook, paiement PSP réel, nouvelle mutation exposée, migration ou double écriture.
- Les tests exécutés avec dépôts simulés **ne prouvent pas** encore la concurrence PostgreSQL ni les E2E authentifiés en production.
- PAY-1 reste en brouillon : tests DB, intégration HTTP réelle, `OWNER_E2E` et revue avant fusion ; PAY-2/PAY-4 porteront justificatifs privés, règlement/activation atomiques et confirmation provider.

## Retour arrière

Revert sans donnée à migrer. Les parcours manuels et abonnements déjà en production restent inchangés.
