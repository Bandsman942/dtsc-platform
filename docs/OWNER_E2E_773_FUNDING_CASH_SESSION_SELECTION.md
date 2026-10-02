# OWNER E2E — Hotfix #773 Financement / session de caisse

Statut : **OWNER_E2E — PASS**.

Validation explicite du propriétaire : **2 octobre 2026**.

Le propriétaire a confirmé que le parcours corrigé est fonctionnel après déploiement de recette : la session de caisse ouverte du compte sélectionné est correctement proposée dans le formulaire de financement et le scénario E2E attendu est concluant.

## Préconditions

- entreprise cliente avec `FINANCE_TREASURY` et `FINANCE_CASH` accessibles ;
- compte Caisse actif, par exemple une caisse USD ;
- utilisateur autorisé à ouvrir une session et à préparer un financement ;
- validateur indépendant disponible ;
- période comptable compatible.

## 1. Session unique sur le compte choisi

1. Ouvrir une session de caisse sur le compte Caisse.
2. Ouvrir **Trésorerie > Financements > Nouvelle entrée de fonds**.
3. Choisir le même compte Caisse.
4. Vérifier que la session `OPEN` apparaît et est sélectionnée automatiquement.
5. Vérifier que le texte « Aucune session de caisse ouverte sur ce compte » n’est pas affiché.
6. Préparer un apport en capital valide et vérifier que le formulaire transmet la session réelle.

## 2. Autre caisse de même devise

1. Ouvrir une autre caisse dans la même devise.
2. Sélectionner le premier compte dans Financements.
3. Vérifier que seules les sessions du compte exact sont proposées.
4. Vérifier qu’aucune session de l’autre caisse n’apparaît.

## 3. Plusieurs sessions compatibles

Si les données de recette autorisent plusieurs sessions `OPEN` sur le même compte :

1. ouvrir le formulaire ;
2. vérifier qu’aucune session n’est choisie arbitrairement ;
3. sélectionner explicitement la bonne session ;
4. préparer le financement.

## 4. Session fermée ou en clôture

1. fermer/soumettre la session précédente ;
2. rouvrir le formulaire ;
3. vérifier qu’elle n’est plus proposée comme session `OPEN` ;
4. vérifier qu’un vrai état vide est affiché s’il n’existe aucune autre session ouverte.

## 5. Rechargement

- fermer puis rouvrir le formulaire après ouverture d’une nouvelle session ;
- changer de compte financier puis revenir sur la caisse ;
- vérifier que les références sont rechargées et que la sélection correspond toujours au compte courant.

## 6. Sécurité

Vérifier par les parcours existants qu’une session :

- d’un autre tenant ;
- d’un autre compte ;
- non ouverte ;

est refusée côté serveur même si une requête est manipulée.

## 7. UI

Vérifier FR/EN, clair/sombre, focus clavier et largeurs :

- 320 ;
- 360 ;
- 375 ;
- 390 ;
- 414 ;
- 768 ;
- 1024 px.

Le formulaire ne doit présenter aucun débordement horizontal et le select natif doit rester utilisable sur Samsung Internet/mobile.

## Validation propriétaire

**PASS — OWNER_E2E confirmé explicitement le 2 octobre 2026.**

Cette preuve valide le parcours fonctionnel décrit ci-dessus. Les preuves CI restent indépendantes et sont suivies dans la PR #774.
