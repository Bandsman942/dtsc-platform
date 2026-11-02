# DTSC Platform — Matrice OWNER_E2E avant fusion AUTH-01 → AUTH-04

Date du plan : 2026-11-02. **Statut des parcours ci-dessous : NOT_EXECUTED**, jusqu'à confirmation explicite du propriétaire.

## Prérequis

- Utiliser un environnement de test contrôlé isolé des comptes de production ; ne pas activer une politique globale sur des utilisateurs réels pendant l'essai.
- Jeu de comptes : propriétaire DTSC avec `SECURITY_MANAGE`, responsable DTSC avec `SECURITY_READ` seul, propriétaire entreprise cliente, membre entreprise, compte standard sans organisation, compte suspendu.
- Tester sur deux navigateurs isolés A/B, avec application TOTP et horloge synchronisée ; disposer de codes de récupération conservés hors navigateur. Ne publier ni clés, ni codes, ni screenshots de secrets.
- Les PR #1013, #1014, #1015, #1016 et #1017 **ne doivent pas être fusionnées** avant retour OWNER_E2E favorable et réconciliation de la base `main`.
- Contrôler chaque scénario en réseau et API (pas seulement son rendu UI).

## Tableau d'acceptation

| ID | Scénario | Attendu | Statut |
|---|---|---|---|
| AUTH-E01 | TOTP activé depuis Paramètres, clé secrète jamais stockée en clair | QR local, code accepté, 10 codes affichés une fois | NOT_EXECUTED |
| AUTH-E02 | Réutiliser ancien code TOTP dans la même fenêtre 30 secondes | Refus et aucune nouvelle session | NOT_EXECUTED |
| AUTH-E03 | Code de récupération utilisé puis réutilisé | Premier accepté, second refusé | NOT_EXECUTED |
| AUTH-E04 | Connexion MFA : mot de passe correct, code faux | Accès serveur refusé, défi limité | NOT_EXECUTED |
| AUTH-E05 | Défi MFA expiré, double clic et concurrence | Aucune session créée si défi consommé/expiré | NOT_EXECUTED |
| AUTH-E06 | Politique globale MFA, utilisateur sans facteur | Pré-auth limitée, QR/code/recovery, session seulement après confirmation | NOT_EXECUTED |
| AUTH-E07 | Politique entreprise obligatoire puis désactivation demandée | Refus si contraire au minimum global | NOT_EXECUTED |
| AUTH-E08 | Passer espace personnel vers entreprise MFA obligatoire | Refus sans preuve MFA récente et valable | NOT_EXECUTED |
| AUTH-E09 | Tenter désactivation facteur alors qu'un tenant actif l'exige | Refus même depuis autre contexte | NOT_EXECUTED |
| AUTH-E10 | Cookie avant activation MFA, puis activation MFA | Rejet des appels API privilégiés avec ancien cookie | NOT_EXECUTED |
| AUTH-E11 | Liste de deux navigateurs A/B | Deux sessions distinctes, utilisateur seul voit les siennes | NOT_EXECUTED |
| AUTH-E12 | Révoquer B depuis A puis appeler API dans B | HTTP 401 et interdiction d'accès, y compris App/Console/Support | NOT_EXECUTED |
| AUTH-E13 | Révoquer « toutes les autres » depuis A | B exclu ; A reste connecté ; cookies legacy invalidés | NOT_EXECUTED |
| AUTH-E14 | Suspendre utilisateur/révoquer appartenance tenant | Cookies et accès correspondants refusés serveur | NOT_EXECUTED |
| AUTH-E15 | Console sécurité : lecture seule puis gestion | `SECURITY_READ` ne mute pas ; `SECURITY_MANAGE` réauthentifiée écrit avec audit | NOT_EXECUTED |
| AUTH-E16 | Nouvelle connexion depuis navigateur non reconnu | Audit et alerte Zoho sans données sensibles | NOT_EXECUTED |
| AUTH-E17 | Deuxième connexion même navigateur, ou Zoho en panne | Pas de spam ; connexion possible si email indisponible | NOT_EXECUTED |
| AUTH-E18 | Consentement appareil fiable sans MFA ou sans mot de passe | Refus ; expiration en 30 jours et limite dix | NOT_EXECUTED |
| AUTH-E19 | Appareil fiable ayant déjà été enregistré | Le MFA reste obligatoire à chaque connexion | NOT_EXECUTED |
| AUTH-E20 | Step-up sur Console politique globale | Mot de passe + TOTP, fenêtre 5min liée à session | NOT_EXECUTED |
| AUTH-E21 | Cookie step-up expiré, rotaté ou volé sans session correspondante | Refus de mutation ; aucune élévation implicite | NOT_EXECUTED |
| AUTH-E22 | Opérations critiques Console, paies CEO/COO et transitions ERP Paiements | Rejet HTTP 428 sans step-up ; boîte de dialogue mot de passe et TOTP ; APPROVE/CONFIRM/RECONCILE/REVERSE protégées sur API et deux UIs ; rôle/approbation demeurent vérifiés ; autres actions Finance/RH en audit | NOT_EXECUTED |
| AUTH-E23 | Récupération admin à double contrôle | Deux opérateurs SECURITY_MANAGE distincts, ni demandeur ni cible comme approbateur ; approbation invalide tous les cookies, exige nouvel enrôlement TOTP, mail d’alerte et audit ; refus / expiration / simultanéité | NOT_EXECUTED |
| AUTH-E24 | Tests panne PostgreSQL, membership perdu, réseau instable | Interdiction par défaut ; pas de bypass ni boucle de connexion | NOT_EXECUTED |
| AUTH-E25 | Responsive 320/360/375/390/414/768/1024/1440px et FR/EN | Pas de chevauchement, focus clavier, contraste, clair/sombre | NOT_EXECUTED |

## Rapport attendu de l'acceptance

Pour chaque E2E : identifiant, environnement, navigateur, date/heure, **PASS/FAIL**, étapes, comportement observé, logs sans secrets, lien issue si échec. Un parcours non exécuté ne devient jamais PASS par inspection ou CI.

## Ordre de fusion prévu

1. #1013 TOTP foundation ; rebase/reconstruction ciblée depuis dernier `main` ; CI, OWNER_E2E, merge.
2. #1014 Enrôlement et défi ; réconciliation avec #1013 ; CI, OWNER_E2E, merge.
3. #1015 Sessions ; réconciliation avec MFA et dernière version `main` ; CI, OWNER_E2E, merge.
4. #1016 Politiques globales et tenant ; réconciliation des trois précédentes ; CI, OWNER_E2E, merge.
5. #1017 Alertes, appareils fiables et step-up ; réconciliation avec dernier `main` ; CI, OWNER_E2E, merge.
6. #1012 README seulement après vérification de l'état réellement déployé.

Les PR restent en Draft tant qu'un contrat métier annoncé n'est pas entièrement couvert ; le maintien d'un statut READY exige CI et revue, pas une simple déclaration.
