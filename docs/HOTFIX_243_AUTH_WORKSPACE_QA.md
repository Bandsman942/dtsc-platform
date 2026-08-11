# Hotfix #243 — QA connexion et choix d’espace

PR de livraison : **#244**.

Statut initial : **NON_EXÉCUTÉ — validation CI et E2E propriétaire requises avant merge**.

## Objectif

Vérifier que la connexion suit strictement le parcours :

**Identifiants → Charger mes espaces → Choisir un espace → Se connecter**.

Aucune saisie d’identifiants ne doit ouvrir automatiquement un espace.

## Scénarios fonctionnels

### 1. Aucun envoi automatique

1. Ouvrir la page Connexion.
2. Renseigner l’adresse email et le mot de passe.
3. Appuyer sur Entrée dans le champ mot de passe.

Attendu :
- aucune connexion n’est créée ;
- l’utilisateur reste sur la page ;
- **Se connecter** reste indisponible tant que les espaces n’ont pas été chargés puis choisis.

### 2. Chargement puis choix personnel

1. Renseigner les identifiants valides.
2. Choisir **Charger mes espaces**.
3. Sélectionner **Mon espace personnel**.
4. Choisir **Se connecter**.

Attendu : connexion dans l’espace personnel, sans bascule silencieuse vers DTSC ou une entreprise.

### 3. Chargement puis choix DTSC

Pour un membre DTSC autorisé :

1. Charger les espaces.
2. Choisir l’espace DTSC affiché.
3. Se connecter.

Attendu : session `DTSC_INTERNAL` et redirection vers la destination interne autorisée.

### 4. Chargement puis choix entreprise cliente

Pour un membre actif d’une entreprise :

1. Charger les espaces.
2. Choisir l’entreprise.
3. Se connecter.

Attendu : session dans cette entreprise uniquement et redirection SaaS cohérente.

### 5. Espace non autorisé

Tenter une requête de connexion avec un identifiant d’organisation qui n’appartient pas au compte.

Attendu : refus serveur ; aucune session sur l’organisation demandée.

### 6. Changement d’espace après connexion

1. Ouvrir la navigation supérieure.
2. Utiliser le sélecteur d’espace.
3. Revenir à **Mon espace personnel**.

Attendu : l’espace personnel est réellement appliqué, même pour un utilisateur qui possède aussi un accès DTSC.

### 7. Position mobile

Sur un compte DTSC interne, vérifier le rail horizontal supérieur.

Attendu : ordre logique **… → DTSC → sélecteur d’espace → Déconnexion**.

### 8. Qualité des libellés

Vérifier les textes visibles de la connexion et du sélecteur.

Attendu : vocabulaire orienté client et usage métier ; aucun code de rôle, nom de champ backend, notion de tenant, `organizationId`, membership ou message d’erreur technique n’est exposé.

## Validation automatique ciblée

Commande :

```bash
pnpm qa:standard-account-context
```

La gate contrôle notamment :
- le choix explicite avant connexion ;
- l’existence du parcours **Charger mes espaces** ;
- le retour possible vers **Mon espace personnel** ;
- l’ordre du sélecteur avant **Déconnexion** dans la navigation mobile.

## Validation générale avant merge

Conformément à `docs/CONTRIBUTING.md` :

```bash
git diff --check
pnpm prisma:generate
pnpm type-check
pnpm qa:standard-account-context
pnpm qa:regression
pnpm lint
pnpm build
```

Aucune migration Prisma n’est prévue par ce hotfix.
