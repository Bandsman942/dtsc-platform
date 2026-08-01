# Identité entreprise et consentement DTSC

Version : 1.0  
Date : 1 août 2026

## 1. Principe

Une fiche métier et un compte DTSC sont deux réalités différentes :

- la fiche métier appartient à l’entreprise et reste l’autorité pour ses données opérationnelles ;
- le compte DTSC appartient à l’utilisateur et reste l’autorité pour l’authentification et ses préférences globales.

Une fiche prospect, client, contact, employé, collaborateur, prestataire, partenaire ou représentant de fournisseur peut exister sans compte DTSC. Un compte DTSC ne remplace jamais cette fiche.

## 2. Modèle

### `EnterprisePersonIdentity`

Identité canonique d’une personne dans une entreprise. Elle permet à plusieurs références métier de représenter la même personne sans copier l’identité globale DTSC.

### `EnterprisePersonBusinessReference`

Référence explicite vers exactement une cible :

- `EnterpriseBusinessParty` pour une personne métier ;
- `EnterpriseBusinessPartyContact` pour le représentant ou contact d’une organisation ;
- `EnterpriseEmployee` pour une fiche RH.

Une contrainte SQL garantit qu’une seule cible est sélectionnée. Un fournisseur organisationnel n’est jamais assimilé à un utilisateur personnel.

### `EnterpriseIdentityLink`

Machine d’état reliant éventuellement l’identité entreprise à un `User`. Elle stocke l’entreprise, l’origine, le type de relation demandé, la finalité, la version du consentement, l’expiration, les décisions, la révision et les motifs.

### `EnterpriseIdentityConsentRecord`

Preuve immuable d’acceptation ou de révocation : utilisateur, finalité, version du texte, condensat de la déclaration et date.

### `EnterpriseIdentityLinkEvent`

Journal fonctionnel des transitions et anomalies de livraison.

## 3. Scénarios

### Création manuelle

L’entreprise crée une fiche métier. Aucune liaison n’est exigée. Les formulaires futurs utilisent `EnterpriseIdentityLinkChoice` pour proposer : création manuelle, invitation, invitation à créer un compte ou association ultérieure.

### Invitation entreprise

1. Un administrateur actif sélectionne une fiche appartenant à son organisation.
2. Il saisit l’adresse exacte et la finalité.
3. Le serveur génère un token aléatoire, stocke uniquement son condensat et fixe une expiration.
4. La réponse de l’API reste neutre, qu’un compte existe ou non.
5. Un email privé est envoyé. Un utilisateur existant reçoit aussi une notification ciblée.
6. La relation reste `INVITATION_PENDING` jusqu’à l’acceptation.

### Invitation à créer un compte

Si aucun compte n’existe, l’email dirige vers l’inscription DTSC puis vers l’invitation. La création du compte n’active rien. Le token, l’adresse du compte connecté et le consentement sont encore vérifiés.

### Demande utilisateur

1. L’utilisateur choisit une entreprise précise et un type de relation.
2. Il fournit une finalité et accepte le texte versionné.
3. La demande passe à `ORGANIZATION_APPROVAL_REQUIRED`.
4. Les administrateurs autorisés sont notifiés.
5. L’entreprise doit sélectionner sa propre fiche métier avant l’approbation.

### Refus, expiration et annulation

Ces transitions ne suppriment pas la fiche métier. Un token refusé, expiré ou annulé devient inutilisable.

### Révocation

Seul l’utilisateur concerné peut retirer son consentement depuis son espace. La relation devient `REVOKED`, l’accès lié est coupé et une preuve de révocation est enregistrée. Les données que l’entreprise est autorisée ou tenue de conserver ne sont pas supprimées automatiquement.

## 4. Confidentialité

Interdictions :

- aucun annuaire global consultable ;
- aucune recherche approximative d’utilisateurs ;
- aucune activation par égalité email, téléphone ou nom ;
- aucun backfill automatique ;
- aucune synchronisation silencieuse du profil global ;
- aucune exposition inter-tenant ;
- aucun token en clair en base ou dans les logs.

Mesures :

- adresse exacte ;
- réponse neutre ;
- token aléatoire à usage unique ;
- expiration ;
- rate limiting ;
- même origine ;
- membership et rôle côté serveur ;
- contraintes et clés étrangères ;
- `revision` optimiste ;
- transactions ;
- notifications privées ;
- journal fonctionnel, `AuditLog` et `ApiLog` ;
- partage minimal.

## 5. Permissions

### Entreprise

L’administration exige : session, contexte `ORGANIZATION` correspondant, membership actif et rôle `OWNER`, `ADMIN_ENTREPRISE` ou `MANAGER` autorisé par les politiques existantes.

### Utilisateur

L’utilisateur ne peut voir que les liens portant son `userId`. Pour une invitation initialement sans `userId`, le token et le condensat exact de l’adresse du compte connecté sont obligatoires.

### Isolation

Chaque cible métier est rechargée avec le même `organizationId`. Un identifiant valide d’un autre tenant est traité comme introuvable.

## 6. États et concurrence

États : `DRAFT`, `INVITATION_PENDING`, `REQUEST_PENDING`, `USER_CONSENT_REQUIRED`, `ORGANIZATION_APPROVAL_REQUIRED`, `ACTIVE`, `REFUSED`, `EXPIRED`, `REVOKED`, `CANCELLED`.

Les transitions sont définies dans `contracts.ts`. Toute mutation utilise le statut attendu et `revision`. Une mise à jour concurrente renvoie une erreur explicite et n’écrase pas la décision précédente. Un index partiel interdit deux relations actives identiques.

## 7. Conservation

La révocation retire l’autorisation de liaison et de synchronisation future. La politique de conservation des documents, écritures, contrats, paies, factures ou dossiers réglementés reste celle du module métier et du droit applicable. Une demande d’effacement distincte pourra être traitée selon les obligations de l’entreprise ; elle ne doit pas être confondue avec la révocation du lien DTSC.

## 8. Intégration future

Les formulaires CRM, tiers, fournisseurs, RH, projets, Health et Pharmacy doivent :

- permettre la fiche sans compte ;
- créer d’abord la donnée métier ;
- proposer la liaison comme étape distincte ;
- afficher le statut de consentement ;
- ne jamais rechercher l’annuaire global ;
- utiliser les services et composants de `lib/enterprise/identity-links` et `components/enterprise/identity-links` ;
- conserver leurs propres permissions et règles de cycle de vie.
