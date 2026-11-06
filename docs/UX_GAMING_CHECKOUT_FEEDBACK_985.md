# UX-03B #985 — feedback HTTP typé Gaming checkout

Portée : une tranche de #938 limitée à `EnterpriseGamingCheckoutWorkspace`, sans mutation backend ni changement de permission.

## Contrat

- L'état HTTP est autoritaire : tout statut non-2xx est un échec, y compris un corps JSON contenant des mots évoquant une réussite.
- Le code métier n'est utilisé que pour les messages explicitement mappés dans le catalogue Gaming FR/EN ; les détails techniques et les messages arbitraires du backend ne sont pas affichés.
- Les contrôles propres aux champs (`sessionId`, `warehouseId`, `financialAccountId`, `amount`, `approverUserId`, `reason`) rendent les erreurs adjacentes. Les erreurs Zod structurées contenant plusieurs chemins connus déclenchent un résumé accessible.
- Une nouvelle tentative refusée recrée un objet de notification ; le formulaire reste ouvert, les saisies et le contexte ne sont pas effacés.

## Vérification

`node scripts/qa-ux-985-gaming-checkout-feedback.mjs` vérifie les statuts et codes, FR/EN, le masquage, les chemins de champs et les protections structurelles de l'écran.

**OWNER_E2E #985 — en attente** : dans un tenant Gaming autorisé, préparer une session, créer un encaissement et tester les refus côté serveur : caisse fermée, montant trop élevé, approbateur refusé et conflit de révision. Répéter deux fois un même refus ; la notification réapparaît sans fermeture ni perte du formulaire. Contrôler clavier seul, iOS étroit, thème sombre, lecture du résumé d'erreur avec lecteur d'écran. Répéter le refus 403 dans un autre tenant, vérifier qu'aucune information financière n'est révélée. Ne pas approuver de mouvement financier réel comme simple test.

La fusion et la validation Production sont bloquées jusqu'à CI verte, `OWNER_E2E` signé, revue et déploiement Vercel Production READY selon le runbook du dépôt.
