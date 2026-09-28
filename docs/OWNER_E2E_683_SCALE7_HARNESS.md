# OWNER E2E #683 — SCALE-7 certification harness

## Objectif

Valider l'intégration produit du harnais SCALE-7 avant sa fusion. Ce test ne lance aucune charge et ne certifie aucun palier.

## Préconditions

- ouvrir la branche / environnement de validation correspondant au SHA final de la PR #682 ;
- se connecter avec un utilisateur DTSC interne disposant de `SECURITY_READ` ;
- ne configurer ni exposer de secret de charge dans le navigateur.

## Scénarios

1. Ouvrir **Administration DTSC → CTO → Scalabilité**.
2. Vérifier que l'observabilité live existante reste visible et fonctionnelle.
3. Vérifier qu'une section **Certification SCALE-7** distincte est présente.
4. Vérifier les quatre paliers : 500, 1 000, 2 500 et 5 000 VU.
5. Sans preuve archivée, chaque profil ramp / soak / spike doit afficher **Non exécuté** / **Not executed**.
6. Vérifier qu'aucun palier n'est présenté comme certifié par défaut.
7. Basculer FR / EN et vérifier les libellés.
8. Vérifier desktop et mobile : aucune carte ne déborde horizontalement.
9. Vérifier mode clair / sombre, focus clavier et lisibilité.
10. Vérifier que la vue n'affiche ni cookie, DSN, organizationId, secret Vercel, clé Redis/provider, prompt ou payload privé.
11. Vérifier qu'un utilisateur sans `SECURITY_READ` ne peut pas ouvrir la vue protégée.
12. Confirmer que la navigation CTO existante reste fonctionnelle.

## Acceptation

Le OWNER_E2E #683 est **bon** si le dashboard distingue clairement :
- métriques live ;
- certification archivée ;
- état NOT_EXECUTED tant qu'aucune preuve réelle n'existe.

La validation #683 n'est pas une preuve de capacité. Les vrais runs restent dans #360 et `docs/OWNER_E2E_360_SCALE7_STAGED_CERTIFICATION.md`.
