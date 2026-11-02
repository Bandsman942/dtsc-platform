# AUTH-03 — Politiques MFA globales et par entreprise

**Statut : branche de validation (PR empilée sur #1014), pas encore en production.**

## Autorité des règles

La source de vérité globale est `AppSetting.requireMfaForAllUsers` et `AppSetting.requireMfaForDtscInternal`, toutes deux `false` par défaut. La source de vérité par entreprise demeure `EnterpriseOrganizationSecurityPolicy.requireMfa` (existe déjà).

Exigence effective : global tous utilisateurs > exigence globale DTSC interne en contexte interne > exigence MFA de l'entreprise active. Un administrateur d'entreprise ne peut pas désactiver l'exigence lorsqu'une règle globale impose déjà le MFA.

Le rôle global à lui seul ne permet pas de contourner la sélection de contexte DTSC interne. Les accès au contexte interne doivent passer par la politique de contexte et un membership actif.

## Établissement sécurisé d'une session

- Mot de passe vérifié et facteur actif : défi TOTP ou code de secours limité à cinq minutes et six essais ; **aucun cookie de session complète avant confirmation**.
- Mot de passe vérifié et MFA obligatoire mais non configuré : défi de type `ENROLL`, préauthentification limitée, **aucun cookie de session complète**, QR local et configuration TOTP avec saisie du mot de passe une deuxième fois.
- Le défi ENROLL n'autorise que `enroll` et `confirm`. Il ne donne aucun accès aux API métier, données d'entreprise ou à la Console.
- Le facteur n'est activé qu'après validation réelle du code TOTP. Les codes de récupération sont présentés une seule fois avant la navigation normale.
- Toute session complète obtenue après 2FA porte `mfaVerifiedAt`; une signature antérieure à l'activation du facteur ne suffit pas. `getSession()` refuse les anciens cookies sans preuve, même si le middleware Edge les voit.
- Les changements de contexte recontrôlent l'exigence de l'organisation cible, pour empêcher le passage de l'espace personnel vers une entreprise plus restrictive sans MFA.
- La suppression TOTP est interdite tant qu'une exigence globale ou d'un tenant actif s'applique à l'utilisateur.
- Si l'exigence globale pour tous est activée, l'inscription crée le compte mais ne crée pas de session complète ; le nouvel inscrit reprend la connexion et suit l'enrôlement.

## Console

Console DTSC → Audit de sécurité → Politique MFA globale : lecture `SECURITY_READ`; modification `SECURITY_MANAGE`, mot de passe du responsable, justification obligatoire de dix caractères minimum, protection same-origin et audit de risque critique. Des règles strictes peuvent être activées seulement par décision explicite : **aucune activation globale par migration**.

## Contrôle des anciens cookies

Les cookies déjà signés qui n'ont pas de preuve MFA validée depuis l'activation du facteur sont refusés par `getSession()`. Les anciens sessions personnelles sans MFA deviennent inopérantes pour les espaces imposant le MFA dès que la règle globale ou de l'entreprise est activée.

En cas de panne du stockage Prisma, ne jamais laisser passer l'accès en mode permissif.

## Vérifications OWNER_E2E

1. MFA facultatif : compte sans facteur se connecte normalement ; l'utilisateur peut l'activer dans Paramètres.
2. Compte facteur activé : mot de passe seul ne donne aucun accès ; code TOTP valide puis accès ; code déjà consommé rejeté.
3. Codes de récupération : usage unique ; nouveau code valide après consommation du premier.
4. Console : `SECURITY_READ` ne peut modifier ; `SECURITY_MANAGE` + mot de passe et motif peuvent modifier et créer un AuditLog.
5. Activer « MFA interne » sur un compte test interne sans facteur, avec session test : accès professionnel verrouillé ; le nouvel essai de connexion ouvre le parcours ENROLL.
6. Vérifier QR local, code de validation, dix codes de récupération présentés une fois, puis accès normal.
7. Entreprise cliente `requireMfa=true` : le membre non enrôlé reçoit ENROLL ; le compte utilisateur non membre n'acquiert aucun accès.
8. L'entreprise cliente ne peut pas réduire une règle MFA imposée globalement.
9. Changement de contexte d'un espace personnel vers l'entreprise MFA requise refuse le bypass.
10. Suppression de TOTP impossible tant que la règle impose MFA, même depuis un autre tenant.
11. Anciennes sessions avant activation du facteur refusées à nouveau par `getSession()`.
12. Expiration du challenge, mauvais code, cinq/six tentatives, double clic et panne serveur refusés sans ouvrir de session.
13. Mobile 320/360/375/390/414/768/1024/1440, FR/EN, clair/sombre, focus/clavier, QR non divulgué vers tiers.

## Dépendances et livraison

Cette PR s'appuie sur la branche #1014 tant que #1014 n'est pas fusionnée. Après fusion #1013 puis #1014, une réconciliation **de delta uniquement** avec le véritable dernier `main` est obligatoire avant la fusion de cette PR. Le hotfix de sessions #1015 est parallèle et doit lui aussi être réconcilié avant une livraison commune.

**Ne pas activer le MFA obligatoire en production avant preuve navigateur et validation explicite du propriétaire.**

## Rollback

Conserver les champs nouveaux et l'historique d'audit. Désactiver explicitement la politique via la Console en cas d'incident avéré. Ne jamais supprimer des secrets TOTP utilisateurs ni modifier des migrations historiques. Restaurer une version applicative uniquement après analyse des conséquences de sessions existantes.
