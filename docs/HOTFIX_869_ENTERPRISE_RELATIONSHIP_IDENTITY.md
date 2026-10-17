# Hotfix #869 — Identité fournisseur, consentement et code entreprise

## Baseline et périmètre
Issue #869, branche `fix/869-identity-supplier-relations-consent-code`, baseline `main@d3014dd84a4dca9291ed3591e5ce53e266799757`. Hotfix P0 unique couvrant Tiers ↔ Fournisseurs ↔ Relations actives ↔ Consentements ↔ Administration entreprise.

## Diagnostic
- `EnterpriseBusinessParty` / `EnterpriseSupplier` convergeaient depuis #865 mais `EnterprisePersonIdentity.displayName` représentait un snapshot indépendant potentiellement obsolète.
- Le type `SUPPLIER` n'existait pas ; les tiers ayant le seul rôle fournisseur généraient `OTHER`.
- L'application exige `Organization.slug` pour demander une relation, mais le slug n'était pas visible dans l'administration tenant.

## Sources de vérité et corrections
1. `EnterpriseBusinessParty` (PERSON) gouverne le nom courant et les coordonnées du tiers. `EnterpriseSupplierPartyLink` transmet les mutations. La nouvelle projection `synchronizeLinkedPersonIdentityTx` met à jour uniquement les `EnterprisePersonIdentity` **actives** liées par `EnterprisePersonBusinessReference` (active, non archivée, même organisation) à un lien `EnterpriseIdentityLink` actif. Mise à jour incluse dans la transaction des mutations Tiers et Fournisseurs. Journal événementiel d'identité, sans données personnelles brutes. Jamais de rapprochement via e-mail seul.
2. Ajouter le type `SUPPLIER` pour **personne physique fournisseur** dans le même contrat enum/labels, permissions existantes, invitations, choix prospect/client/fournisseur et demandes d'utilisateur. Le représentant d'une personne morale conserve `SUPPLIER_REPRESENTATIVE`. La validation serveur refuse les cibles hors type/rôle/tenant.
3. Les liens historiques `OTHER` conservent leur `requestedRelationType`, la version/digest et les preuves `EnterpriseIdentityConsentRecord`; un badge lisible distingue **rôle métier Fournisseur** et **consentement Autre relation**. Pour passer à un type relationnel `SUPPLIER`, l'utilisateur demande explicitement cette nouvelle relation, et l'entreprise approuve la bonne fiche personne physique. Aucun réétiquetage silencieux ni élargissement de droits.
4. `Organization.slug` est montré seulement dans **Administration → Paramètres entreprise**, déjà protégée par membership + permission `ADMIN_DASHBOARD:manage`. La copie du code et du lien `/enterprise-links?view=requests&code=<slug>` ne donne jamais d'accès ERP. Le formulaire de demande s'ouvre pré-rempli, reste connecté, attend approbation et consentement versionné; l'annuaire public reste absent.
5. Le panneau utilisateur refait sa lecture serveur après notifications organisation-scopées du registre CRM et l'onboarding fournisseur publie cet événement après succès.

## Sécurité
- Aucune jointure identité-compte par e-mail ; aucun élargissement `OTHER` rétroactif ni réécriture des preuves de consentement.
- La projection est tenant-scopée et transactionnelle, seulement sur les personnes physiques et relations actives, avec journalisation fonctionnelle limitée aux noms de champs modifiés (jamais les valeurs).
- Les demandes utilisateur restent authentifiées, rate-limited et revalidées au serveur sur le slug exact de l'entreprise CLIENT active. Pas de nouvelle découverte publique ni d'accès à la base privée.
- No migration, no backfill by email, no extra secrets, no new entitlements or plan access. Historical string enums remain compatible.
- Un code slug peut être communiqué publiquement par l'entreprise; il s'agit d'un identifiant d'orientation, **pas d'un secret**, d'une preuve d'appartenance ou d'une permission.

## QA & OWNER_E2E
- Tests ciblés : `pnpm qa:hotfix-869-relationships` intégrés à `pnpm qa:regression`.
- Gates : `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:regression`, `pnpm build`, `Quality gates`, checks sécurité/tenant.
- **OWNER_E2E non exécuté** : créer fournisseur personne physique et invitation `SUPPLIER`, accepter sur compte global, modifier nom et coordonnées dans Tiers puis fournisseur, vérifier synchronisation immédiate Relations actives et en-tête consentement courant, historique immuable; vérifier autre personne à même email n'est pas reliée. Vérifier entreprise fournisseur et `SUPPLIER_REPRESENTATIVE`; ancienne relation `OTHER` affiche rôle métier sans changer l'autorisation; nouvelle demande SUPPLIER exige un nouveau consentement et approval; code entreprise réel copiable, lien prérempli, soumission et refus tenant inexistant; vérifier absence d'annuaire.
- UI FR/EN, dark/light, desktop/mobile 320/360/375/390/414/768/1024 px, focus, clavier, safe areas, plusieurs onglets; changements inter-tenant isolés, permissions lecture seule.

## Risques & rollback
- Risque de données historiques incompatibles entre fournisseur et identité de personne. Ne jamais fusionner automatiquement des identités; si aucun `EnterprisePersonBusinessReference` explicite, laisser inchangé et demander une liaison consentie.
- Rollback de code par PR/hotfix traçable; conserver les identités, transactions, journal et consent records. Aucune migration destructive et aucun nettoyage de données historiques.
- Production uniquement après OWNER_E2E confirmé, CI verte, squash merge `main`, Vercel Production READY et release vérifiée.

## Matrice de preuves
| Contrôle | Statut | Source |
|---|---|---|
| Inspection statique | Effectuée | GitHub et contrats cités |
| QA ciblée / typecheck / lint / build | NOT_EXECUTED | CI à vérifier après PR |
| OWNER_E2E | NOT_EXECUTED | Confirmation du propriétaire requise |
| Merge / Production | NOT_EXECUTED | Hors périmètre sans validation |
