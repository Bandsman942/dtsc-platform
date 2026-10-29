# UX-03C — Retours métier des validations de prestations CEO/COO (#955)

## Contexte
Le formulaire de validation des prestations internes DTSC utilisait un texte libre pour ses notifications ; l'ancienne logique pouvait confondre erreur et succès selon les mots contenus dans le message, et ne gérait pas les interruptions réseau.

## Contrat frontend
`components/admin/work-submission-review-panel.tsx` passe désormais un `ToastNotice` avec `tone: "success"|"error"` directement au `useToastMessage` canonique. Les messages d'échec proviennent de `workPrestations` dans `locales/fr.json` et `locales/en.json`, en fonction du statut HTTP :
- 401 : session expirée ;
- 403 : permission insuffisante ;
- 409 : dossier en conflit / déjà traité ;
- 429 : réessayer ultérieurement ;
- 400 / 422 : décision invalide ;
- 5xx : service indisponible, sans détails internes ;
- erreur réseau / JSON incomplet : erreur explicite sans confirmation de succès.

La décision n'est considérée comme réussie **que si** `response.ok`, `body.ok === true` et `body.submission.id` correspond à la prestation choisie. Une erreur laisse le dialogue, la décision et le commentaire intacts. Une mutation en cours ne peut pas être soumise deux fois ni fermée accidentellement.

La liste et le détail interceptent les erreurs réseau et refusent les réponses incomplètes, au lieu d'afficher une liste vide mensongère.

## Règles inchangées
L'autorisation CEO/COO, les limites de débit, le contrôle de même origine, l'interdiction d'auto-validation, les traces ApiLog/AuditLog, le calcul des minutes et les transactions restent exclusivement dans les endpoints existants.

## QA et OWNER_E2E
`node scripts/qa-ux-955-work-review-feedback.mjs` exécuté par Quality Gates.

Parcours :
1. Soumettre une prestation autorisée à un COO ; valider, puis contrôler un succès et l'état final.
2. Pour une prestation du COO, valider avec le CEO ; ne pas pouvoir se valider soi-même.
3. Simuler une session expirée, un 403 et un conflit 409 après modification concurrente.
4. Vérifier 429, une réponse 2xx incomplète et une interruption réseau.
5. Répéter deux refus identiques ; le toast d'erreur doit se réafficher ; conserver motif et saisie.
6. Pendant la validation, tenter d'appuyer deux fois, puis de fermer ; aucune double décision ni perte de données.
7. Tester FR/EN, clair/sombre, 320/390/768/1440, clavier et navigation entre liste/détail.

## Suivi / rollback
Aucune migration Prisma, modification backend, permission, entitlement ou secret. Revert du frontend #955 en cas de régression. Les autres consommateurs de feedback texte libre restent suivis dans #938, qui ne doit pas être clôturée avec ce seul pilote.
