# HOTFIX RETAIL — Délégation des auto-validations par l'administrateur entreprise
**16 novembre 2026 — candidat, E2E propriétaire requis avant fusion.**

## Problème constaté
Dans RETAIL POS > Personnel et accès par boutique, trois cases (« Valider soi-même ses factures », « Valider et confirmer ses encaissements », « Gérant : approuver sa propre demande d'annulation ») sont grises avec la mention « Réservé au propriétaire ». L'API permet pourtant déjà l'administration d'affectations aux membres OWNER, ADMIN_ENTREPRISE et ADMIN_ENTERPRISE, mais bloque la délégation sensible si l'administrateur n'est pas également le propriétaire individuel enregistré dans Organization.ownerUserId.

## Contrat corrigé
- **Décisionnaire** : tout membre actif de **la même entreprise** de rôle OWNER, ADMIN_ENTREPRISE ou ADMIN_ENTERPRISE, disposant aussi de l'accès de gestion RETAIL_POS, peut **accorder, conserver, modifier et révoquer** ces trois permissions. Aucun rôle global de DTSC ne fait exception. Un gérant de boutique seul ne peut jamais les attribuer.
- **Identité du propriétaire** : Organization.ownerUserId conserve son sens historique/juridique mais ne bloque pas l'administration des habilitations par un administrateur entreprise actif. Ne pas muter ni transférer ce champ.
- **Périmètre** : la permission est explicite, par utilisateur **et boutique**, inactive par défaut, immédiatement révoquée ; elle n'ouvre pas l'accès aux autres boutiques.
- **Conditions** : SELF_APPROVE_INVOICE requiert PREPARE_INVOICE ; SELF_APPROVE_PAYMENT requiert COLLECT_PAYMENT ; SELF_APPROVE_INVOICE_RETURN exige un profil MANAGER, REQUEST_INVOICE_RETURN et APPROVE_INVOICE_RETURN. L'UI coche les dépendances et le serveur les revérifie.
- **Contrôles financiers** : les dérogations ne dispensent pas des contrôles canoniques de créance, paiement, caisse, stock, inspection physique indépendante, validation Finance et liquidation. La vérification des affectations s'effectue au moment de chaque opération.
- **Observabilité** : journaliser les droits avant/après, le collaborateur et la boutique, avec risque HIGH pour les dérogations ; fournir un message de refus explicite et des libellés cohérents FR/EN.

## Tests automatiques
- `pnpm qa:hotfix-1184` et `pnpm qa:hotfix-1187` : contrats de rôles et de validation, libellés et absence de dépendance obligatoire à ownerUserId ;
- `pnpm qa:hotfix-1042-site-staff`, `pnpm qa:hotfix-1042-retail-invoice-payments`, `pnpm qa:hotfix-1042-retail-invoice-return-requests` : périmètres des boutiques ;
- `pnpm type-check`, `pnpm lint`, `pnpm qa:regression`, `pnpm build` et E2E navigateur, selon les Quality Gates.

## Matrice E2E utilisateur — à certifier
1. Dans une entreprise Retail avec deux boutiques A/B, connecter un membre actif ADMIN_ENTREPRISE **différent** de Organization.ownerUserId et ouvrir les accès de boutique A : trois cases sensibles disponibles (la permission de retour ne s'active que pour MANAGER).
2. Activer une dérogation pour un collaborateur A, sauvegarder et rafraîchir : valeur persistée, dépendances présentes, journal d'audit avant/après et risque HIGH. Révoquer puis confirmer le refus d'auto-validation.
3. Refaire l'opération avec ADMIN_ENTERPRISE et OWNER. Vérifier qu'un gérant (MANAGER) non administrateur, un membre inactif/supprimé et un utilisateur d'une autre entreprise ne peuvent pas déléguer, y compris par un PUT forgé.
4. Tester l'auto-validation d'une facture et d'un encaissement autorisés dans A, et le rejet des opérations dans B ou après révocation. Exclure remboursement et opérations Finance globales de l'exception caisse.
5. Pour un retour payé, exiger l'inspecteur indépendant et la séparation Finance/stock, même si le gérant a SELF_APPROVE_INVOICE_RETURN.
6. Vérifier Samsung Internet mobile et desktop, FR/EN, libellés, cases et retours d'erreurs ; aucune navigation horizontale parasite.
7. Ne fusionner qu'après CI verte au SHA courant **et** déclaration explicite `E2E final BON` du propriétaire. Fusion sur main uniquement puis déploiement Vercel Production automatique, sans previews ni `--prod` manuel.

**Données** : aucune migration Prisma, aucune variable Vercel nouvelle, aucun grant automatique de permissions anciennes.
