# Checklist QA multi-sous-domaines DTSC Platform

Derniere mise a jour: 2 juin 2026

Cette checklist valide la couche de routage host-aware sans extraction monorepo. Les tests doivent etre executes avec les domaines configures dans le meme projet Vercel et `AUTH_COOKIE_DOMAIN=.dtsc-platform.com` en production.

## Public

- Ouvrir `https://dtsc-platform.com` et verifier que la landing page publique reste accessible sans session.
- Ouvrir `https://dtsc-platform.com/dashboard` et verifier la redirection vers `https://app.dtsc-platform.com/dashboard`, puis vers Account si aucune session n'est active.
- Ouvrir `https://dtsc-platform.com/admin` et verifier la redirection vers `https://console.dtsc-platform.com/admin`, puis vers Account si aucune session n'est active.
- Ouvrir `https://dtsc-platform.com/auth/sign-in` et verifier la redirection vers `https://account.dtsc-platform.com/auth/sign-in`.

## Account

- Ouvrir `https://account.dtsc-platform.com` et verifier la redirection vers `/auth/sign-in`.
- Se connecter comme client sans organisation et verifier la redirection par defaut vers `https://app.dtsc-platform.com/dashboard`.
- Se connecter comme membre d'une entreprise cliente et verifier la redirection par defaut vers `https://app.dtsc-platform.com/dashboard`.
- Se connecter comme membre DTSC interne et verifier la redirection par defaut vers `https://console.dtsc-platform.com/admin`.
- Tester `next=/dashboard` et verifier la redirection vers l'app.
- Tester `next=https://console.dtsc-platform.com/admin` avec un compte DTSC interne et verifier l'acces console.
- Tester `next=https://support.dtsc-platform.com/support` et verifier que la cible Support est conservee.
- Tester `next=https://malicious.example.com` et verifier que la redirection externe est refusee au profit de la destination par defaut.

## App

- Ouvrir `https://app.dtsc-platform.com` et verifier `/dashboard` si la session est active, sinon Account.
- Ouvrir `https://app.dtsc-platform.com/admin` et verifier la redirection vers Console.
- Ouvrir `https://app.dtsc-platform.com/support` et verifier la redirection vers Support.
- Acceder a `/dashboard` avec session active et verifier les donnees du contexte courant.
- Acceder a `/dashboard` sans session et verifier la redirection vers Account avec `next` conserve.

## Console

- Acceder a `https://console.dtsc-platform.com/admin` sans session et verifier la redirection vers Account avec `next` absolu vers Console.
- Acceder a `/admin` avec un client non DTSC et verifier la redirection vers `https://app.dtsc-platform.com/dashboard`.
- Acceder a `/admin` avec une session `DTSC_INTERNAL` et verifier l'affichage de l'administration autorisee.
- Depuis Console, ouvrir `/dashboard`, `/chat`, `/company`, `/calendar`, `/enterprise-admin`, `/enterprise-activities`, `/collaborators`, `/notifications` et `/announcements`; verifier la redirection vers le sous-domaine App.
- Depuis Console, ouvrir `/support` et verifier la redirection vers Support.
- Depuis Console, ouvrir `/auth/sign-in` ou `/auth/sign-up` et verifier la redirection vers Account.

## Support

- Acceder a `https://support.dtsc-platform.com/support` sans session et verifier la redirection vers Account avec `next` absolu vers Support.
- Acceder a `/support` avec session active et verifier que les tickets restent limites au contexte autorise.
- Ouvrir `https://support.dtsc-platform.com/admin` et verifier la redirection vers Console.

## API

- Verifier que `POST /api/auth/sign-in` reste fonctionnel et renvoie une URL interne fiable.
- Verifier que `POST /api/account/context` reste fonctionnel et journalise les changements de contexte.
- Verifier que `/api/admin/*` refuse toute session hors `DTSC_INTERNAL`.
- Verifier que `/api/enterprise/*` continue de verifier le membership de l'organisation active.
- Verifier que `/api/support/*` ne renvoie aucun ticket appartenant a un autre utilisateur ou contexte.
