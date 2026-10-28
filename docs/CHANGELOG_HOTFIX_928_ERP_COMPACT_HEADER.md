# UX-05 — Densité et en-tête compact des workspaces ERP

Le composant transversal `ModuleHeader` adopte une seule surface neutre, un titre lisible, un repère de section discret et un groupe d'actions hiérarchisé. Les ornements graphiques non informatifs, le badge marketing permanent et la large ombre ont été retirés.

Sur mobile, les actions principales restent visibles et les actions secondaires continuent d'utiliser la divulgation progressive déjà prévue par le contrat responsive. Le retour et l'actualisation demeurent accessibles. Les séparations internes entre sections sont réduites ; le sous-en-tête plein écran est également moins haut.

## Vérification avant Production

- [ ] Captures réellement authentifiées aux largeurs 320, 360, 375, 390, 414, 768, 1024 et 1440 px.
- [ ] Titres courts/longs, compteurs grands, descriptions, actions secondaires nombreuses, langue FR/EN et thèmes clair/sombre.
- [ ] Navigation clavier et lecteur d'écran ; aucun menu masqué ni chevauchement sur iOS.
- [ ] QA #928, QA workspace, QA responsive, lint, type-check et E2E propriétaire.

Ce hotfix ne change ni les APIs ni les permissions métier. Aucun déploiement depuis la branche ; rollback par revert du commit si la validation visuelle échoue.
