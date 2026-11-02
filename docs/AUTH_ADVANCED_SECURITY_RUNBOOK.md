# AUTH-04 — Sécurité avancée des connexions (travail en branche)

**Statut : non livré ; OWNER_E2E et certification sécurité requis.** Ce hotfix dépend de AUTH-01 #1013, AUTH-02 #1014, AUTH-03 #1015/#1016.

## Alertes de nouveaux navigateurs

Au terme d'une authentification complète (mot de passe seul lorsque le MFA n'est pas requis, défi TOTP validé, ou enrôlement MFA validé), DTSC recherche un marqueur de navigateur signé aléatoirement côté serveur (32 octets, token en cookie HttpOnly). Seul son SHA-256 est conservé dans `AuthKnownBrowser`, associé au compte. Il ne sert **jamais** à s'authentifier ou à contourner le TOTP.

Un nouveau marqueur sur le compte donne lieu à une trace `AUTH_BROWSER_FIRST_SEEN` puis une alerte email personnelle via Zoho si le fournisseur est disponible. L'alerte précise la date UTC et le navigateur déclaré mais ne divulgue aucun jeton, mot de passe, code de secours ou secret. Une panne email ne bloque pas une connexion légitime, mais est tracée. Un navigateur reconnu met à jour son dernier passage sans email supplémentaire.

**Limite d'identification** : un marqueur navigateur ne prouve pas l'identité physique de l'appareil ; suppression de cookies, mode privé ou réinitialisation du navigateur peuvent produire une nouvelle alerte. Ne pas annoncer une géolocalisation/IP exacte ou des détections impossibles.

## Appareil fiable sur consentement

L'utilisateur accède à `/api/account/security/known-browsers` via Paramètres : voir et révoquer ses navigateurs. Le marquage « fiable » requiert un MFA récent (<10 minutes), le mot de passe du compte et une action positive de consentement. Limite : dix marqueurs fiables, expiration à 30 jours. Les appareils révoqués ne sont plus reconnus par le registre.

**Important** : le statut « fiable » ne donne aucune exemption au MFA et ne prolonge pas les sessions. Toute future exemption exigerait une conception et une validation distinctes.

## Réauthentification renforcée / step-up

`POST /api/auth/step-up` exige une session active, le mot de passe et, si activé, un TOTP à usage unique ou un code de récupération. Le jeton `dtsc_stepup` est HMAC-SHA256, HttpOnly, Secure, SameSite=strict, cinq minutes et lié au **cookie de session signé précis** ainsi qu'au compte et à son contexte. Si le cookie de session est renouvelé/rotaté, le step-up échoue fermé : l'utilisateur doit recommencer, sans élévation silencieuse.

Le panneau global de politique MFA Console exige ce step-up avant toute modification. La confirmation par mot de passe reste aussi exigée dans l'API métier, en défense en profondeur.

**Limite de portée (bloquante pour clôturer #1011)** : cette primitive n'est pas encore étendue à l'ensemble des actions RH, admin et Finance critiques. Ces routes doivent être classées par risque, assorties d'un parcours UI de step-up puis certifiées avant d'annoncer un contrôle exhaustif. Ce hotfix reste en Draft jusqu'à cet audit et OWNER_E2E.

## Actions critiques — rôles et suspension

Les routes de Console `PATCH /api/admin/users/[id]/role` et `PATCH /api/admin/users/[id]/status` exigent maintenant `SECURITY_MANAGE` ou `USERS_MANAGE` suivant leur contrôle existant, ainsi qu'un `hasRecentStepUp` de moins de 5 minutes ; toute tentative sans preuve répond `428 STEP_UP_REQUIRED` et est auditée. Les sélecteurs de rôle et de statut lancent eux-mêmes le parcours sécurisé (mot de passe et, si activé, TOTP/code de secours) avant l'écriture métier.

Les validations de paie interne DTSC CEO et COO utilisent aussi un step-up obligatoire sur leur API, avec saisie du mot de passe et, si activé, d'un code TOTP dans la boîte de dialogue.
Les transitions monétaires `APPROVE`, `CONFIRM`, `RECONCILE` et `REVERSE` sur `/api/enterprise/[organizationId]/payments/[paymentId]/transition` exigent également un step-up récent validé **côté serveur**, après la vérification RBAC Finance et avant toute modification. Les deux interfaces professionnelles de Paiements (moderne et écran Paiements/Trésorerie) proposent la confirmation dans la boîte de dialogue, avec mot de passe et second facteur si activé. Le contrôle de séparation approbateur/demandeur demeure appliqué par les services métier.
Les transferts entre comptes financiers dans la Trésorerie appliquent le même contrôle serveur pour `APPROVE` et `CONFIRM` ; l'interface Paiements/Trésorerie propose le même parcours de réauthentification avant la décision ou l'exécution.
Les validations de caisse professionnelle (`cash-sessions/[id]/validate`), les décisions de paie des entreprises (`payroll-runs/[id]/decision`) et la confirmation de paie interne HR&CFO (`payrolls/[id]/mark-paid`) sont également bloquées sans step-up récent. Les interfaces correspondantes demandent le mot de passe et le deuxième facteur, si activé.
 Les autres actions financières/RH critiques non encore couvertes doivent être auditées avant de déclarer le contrôle transversal exhaustif. Ne pas marquer ces actions validées sans preuve de leurs garde-fous API **et** UI.

## Récupération MFA administrateur — double contrôle obligatoire

Un opérateur interne ayant `SECURITY_MANAGE` et un step-up récent demande la récupération d'un compte **ADMIN actif** via la Console Audit de sécurité. Cette demande expire après une heure. L'opérateur ne peut pas demander sa propre récupération. Un index SQL partiel empêche deux demandes `PENDING` simultanées pour la même identité.

Un **second opérateur distinct** de l'auteur et de la cible doit disposer de `SECURITY_MANAGE` et d'un autre step-up récent. Il approuve ou rejette avec justification, via API. Un compte ne peut pas approuver sa propre réinitialisation ; aucun token de récupération privilégié n'est émis.

À l'approbation : transaction PostgreSQL atomique, retrait de l'ancien TOTP et de ses codes de récupération (cascade), invalidation des défis MFA non consommés, `User.mfaRecoveryRequired=true` et marqueur `mfaRecoveryInvalidBefore`. `getSession()` refuse les cookies antérieurs, même signés. À la prochaine authentification par mot de passe, le compte reçoit un défi `ENROLL` limité ; **aucune session métier** n'est ouverte avant confirmation du nouveau facteur et conservation des nouveaux codes. Les utilisateurs qui ne disposent pas d'un second opérateur habilité restent bloqués jusqu'à l'exécution de la procédure d'escalade de gouvernance DTSC ; pas de contournement par une personne unique.

**Évolutions encore nécessaires avant la certification complète** : tests de concurrence sur PostgreSQL réel, alerte de sécurité au propriétaire du compte, comparaison avec le registre `AuthSession` de #1015 sur branche intégrée, vérification de toutes les routes financières/RH classées P0.

## Parcours OWNER_E2E

1. Nouveau navigateur A : première connexion → audit et email Zoho si configuré ; seconde connexion même navigateur → aucune alerte additionnelle.
2. Nouveau navigateur B / navigation privée : nouvelle alerte ; pas d'identifiants, IP ni secrets dans le mail.
3. Paramètres : lister ses appareils, révoquer un appareil ancien puis vérifier sa non-reconnaissance.
4. Marquage fiable sans MFA : HTTP 428/403 ; avec MFA récent, mot de passe correct et consentement explicite : succès.
5. Un appareil fiable conserve l'obligation de code TOTP à toute nouvelle connexion.
6. Console `SECURITY_READ` : lecture seule ; `SECURITY_MANAGE` : saisir mot de passe, code TOTP, motif puis modification de politique.
7. Step-up expiré (5 minutes), cookie modifié, session révoquée, code TOTP déjà consommé : refus ; aucun changement.
8. Tester absence Zoho : connexion autorisée, audit d'échec, pas d'erreur de sécurité visible au client.
9. Viser les dimensions 320, 360, 375, 390, 414, 768, 1024, 1440 px, FR/EN, clair/sombre, navigation clavier.

## Déploiement

Ne pas fusionner ou déployer avant la certification. Les migrations sont additives et préservent les lignes historiques. En cas de rollback, conserver le registre et ne pas réactiver une exemption MFA, car aucune exemption n'est implémentée.
