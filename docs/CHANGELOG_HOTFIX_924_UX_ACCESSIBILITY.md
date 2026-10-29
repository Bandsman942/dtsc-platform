# Hotfix #924 — Navigation clavier et gestion du focus (UX-01)

Statut : branche de correctif, **non fusionnée en Production**. Validation E2E propriétaire requise.

## Comportement modifié

- Les dialogues partagés dirigent le focus vers leur titre à l'ouverture, contiennent `Tab` / `Shift+Tab`, traitent `Escape` sur la couche supérieure et restituent le focus à la fermeture.
- Les menus d'actions et de destination offrent une navigation `ArrowUp`, `ArrowDown`, `Home`, `End`, `Escape` et une sortie contrôlée par `Tab` ; les menus portallés gardent la priorité sur le dialogue parent.
- Les sections métier plein écran annoncent un dialogue modal et contiennent le focus ; le bouton d'ouverture retrouve le focus après fermeture, y compris au clavier.
- Le retour contextuel distingue les formulaires modifiés des filtres/recherches et accepte un événement de confirmation de sauvegarde : `form.dispatchEvent(new Event("dtsc:form-saved", { bubbles: true }))` après un succès serveur avéré.

## Contrats conservés

- Aucun changement de schéma Prisma, API, RBAC, entitlements ou multi-tenant.
- Aucune modification du comportement du transfert d'appel persistant ou du viewport clavier iOS.
- Aucun déploiement Preview ou Production autorisé par ce correctif.

## Vérification et acceptation

- Contrat ciblé : `node scripts/qa-hotfix-924-ux-accessibility.mjs`.
- Régressions UI : `node scripts/qa-workspace-ui-checks.mjs`, `node scripts/qa-responsive-ui-contract-checks.mjs`.
- E2E propriétaire à confirmer sur ordinateur et mobile (320, 360, 375, 390, 414, 768, 1024 px) : navigation clavier des menus, dialogue imbriqué, fermeture par `Escape`, retour du focus, sélecteurs iOS, mode sombre, FR/EN et aucune perte de saisie après navigation.

## Risques et rollback

- Risque principal : menus portallés et fenêtres superposées, spécialement lorsqu'un appel audio/vidéo reste ouvert. Vérifier ces cas avant fusion.
- Rollback : revert du commit de #924 sur `main` après arrêt de livraison et nouvelle vérification E2E, sans migration de données.
