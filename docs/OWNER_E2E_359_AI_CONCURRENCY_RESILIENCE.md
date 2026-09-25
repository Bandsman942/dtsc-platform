# OWNER_E2E — SCALE-6 AI concurrency & provider resilience

Statut initial : **NOT_EXECUTED**.

Tester uniquement le SHA final de la PR #678 après réussite des gates CI.

1. **Accès CTO** : avec un utilisateur autorisé `SECURITY_READ`, ouvrir Administration DTSC > CTO > Scalabilité. Avec un utilisateur sans cette capacité, vérifier le refus d’accès.
2. **FR/EN** : basculer FR puis EN et vérifier les nouvelles métriques IA : tentatives actives, saturations/429, timeouts, provider indisponible, tokens, coût estimé USD, fallbacks et budgets Agent.
3. **Responsive** : vérifier 320, 360, 375, 390, 414, 768 et 1024 px. Les cartes IA restent lisibles, sans scroll horizontal global ni métrique coupée.
4. **Chat** : effectuer plusieurs conversations IA autorisées et confirmer que les réponses fonctionnent normalement lorsque la capacité est disponible.
5. **Agent** : lancer un run Agent Entreprise autorisé ; vérifier que les budgets existants restent opposables et qu’aucune limitation artificielle ne survient hors saturation.
6. **Saturation utilisateur** : déclencher des appels concurrents au-delà du garde-fou de l’utilisateur de test. Vérifier un refus `RATE_LIMITED` explicite, sans erreur 500 ni impact sur les modules ERP.
7. **Saturation organisation** : simuler la saturation du tenant de test. Les appels excédentaires doivent être bornés/refusés ; les autres organisations restent utilisables.
8. **Saturation provider** : avec provider mock/staging prévu pour le test, saturer un provider et vérifier que le routeur peut sélectionner un autre provider autorisé lorsque la policy le permet.
9. **429 provider** : provoquer un 429 contrôlé. Vérifier trace provider, fallback éventuel, absence de double comptage de l’appel applicatif et métrique CTO de saturation.
10. **Timeout provider** : provoquer un timeout contrôlé. Vérifier fallback éventuel, reason code sûr et compteur timeout CTO.
11. **5xx / indisponibilité** : provoquer une indisponibilité provider contrôlée. Le health registry doit dégrader/ouvrir le circuit selon les preuves récentes ; aucun secret ni message provider brut ne doit apparaître au client.
12. **Cancellation** : annuler un stream ou quitter la réponse. Vérifier qu’un appel ultérieur n’est pas bloqué par un lease fantôme.
13. **Isolation** : vérifier que le dashboard CTO ne révèle ni userId, organizationId, clé Redis, prompt, message, token provider ou secret.
14. **ERP non impacté** : pendant une saturation IA de test, ouvrir au minimum un module Finance et un module Core ; leurs lectures/actions non IA restent fonctionnelles.

Après validation, confirmer explicitement : `E2E #359 bon`, pour le SHA final testé.
