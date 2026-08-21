# Contrat UX des formulaires DTSC

Version : 1.1
Date : 21 août 2026

## 0. Périmètre

Ce contrat s’applique à **tous les formulaires professionnels de DTSC Platform** : compte et profil, support, console DTSC, espaces entreprise, ERP communs, modules sectoriels, activités, calendrier et paramètres.

Le niveau de référence est le formulaire guidé : chaque champ significatif possède un libellé métier clair et une aide visible qui explique ce que l’utilisateur doit fournir, pourquoi l’information est demandée et, lorsque c’est utile, l’effet de son choix.

Un formulaire ne doit pas demander à l’utilisateur de connaître un code technique, une convention interne ou une valeur de référence qui peut être proposée par le système.

## 1. Structure

Un formulaire métier est une surface de travail, pas un bloc décoratif. Il doit utiliser une page dédiée, un drawer large ou un dialogue plein écran lorsque sa longueur l’exige.

Sur mobile, le parcours standard est : liste → détail plein écran → formulaire plein écran → retour. Un formulaire long ne doit jamais être comprimé dans une petite carte ou une modale courte.

Le formulaire est divisé en sections ou étapes correspondant au métier. Une section n’existe que si elle contient des champs utiles. Les blocs « Informations principales » répétés sont interdits.

## 2. Champs

- Les champs obligatoires sont annoncés dans le libellé et dans l’accessibilité.
- Les libellés sont commerciaux, traduits et stables.
- L’aide contextuelle est **visible sous le contrôle** pour les champs significatifs ; une icône ou un tooltip peut compléter cette aide mais ne doit pas être l’unique explication.
- L’aide explique la finalité, les contraintes et les conséquences lorsque celles-ci ne sont pas évidentes.
- Les références utilisent des combobox alimentées par des données du même `organizationId`.
- Une valeur de référence reçue est toujours rechargée côté serveur avec le tenant actif.
- Les statuts, priorités, types et catégories utilisent des valeurs contrôlées.
- Les devises utilisent une liste contrôlée de codes monétaires supportés par le produit ; l’utilisateur ne saisit pas librement `USD`, `CDF`, `EUR`, etc.
- Les unités métier utilisent un catalogue contrôlé lorsque le domaine connaît les valeurs possibles ; l’utilisateur ne doit pas créer des variantes manuelles comme `u`, `unit`, `pcs`, `pièce` pour la même notion.
- Les champs texte libres ne remplacent pas une véritable relation métier.
- Un champ reste libre uniquement lorsqu’il représente réellement un contenu rédigé par l’utilisateur : titre, description, note, commentaire, motif détaillé ou valeur numérique sans référentiel.
- Les contrôles de saisie ont une taille calculée d’au moins 16 px sur iOS.

### 2.1 Choix du type de contrôle

| Information | Contrôle par défaut |
|---|---|
| Devise | Select/combobox contrôlé |
| Unité | Select/combobox contrôlé |
| Statut, priorité, type, catégorie | Select/combobox contrôlé |
| Utilisateur, collaborateur, patient, fournisseur, client, projet, département, compte, budget | Combobox tenant-scoped avec libellé métier |
| Date / heure | Contrôle date/heure adapté |
| Quantité, taux, montant | Contrôle numérique avec bornes métier |
| Description, note, commentaire | Texte libre avec aide contextuelle |

Une combobox ne doit jamais afficher un UUID, un identifiant Prisma ou une enum brute comme libellé principal.

## 3. Validation et erreurs

La validation Zod et la validation métier côté serveur restent l’autorité. L’interface affiche :

1. une erreur sous le champ concerné ;
2. un résumé global lorsque plusieurs champs sont invalides ;
3. ce qui s’est passé ;
4. pourquoi l’action est refusée ;
5. l’action corrective possible ;
6. le contact support lorsque l’utilisateur ne peut pas corriger.

Les codes serveur peuvent rester stables dans l’API. Ils ne sont jamais affichés seuls. `FORBIDDEN`, `INVALID_PAYLOAD`, `ACTION_FAILED` ou une enum brute ne constituent pas un message utilisateur.

## 4. Enregistrement

- La double soumission est bloquée.
- Le bouton affiche l’état en cours.
- Une clé d’idempotence est utilisée lorsque la création peut être rejouée ou déclencher plusieurs écritures.
- Les agrégats modifiables utilisent `revision` ou un équivalent.
- Le succès ramène vers la fiche de détail ou l’objet créé.
- Le formulaire ne se ferme pas silencieusement après une erreur.
- Une fermeture avec modifications non sauvegardées demande confirmation.

## 5. Références et sélection

Une combobox doit proposer, lorsque le volume le justifie : recherche, chargement, état vide, erreur, nom métier et information secondaire utile. Pour un petit référentiel stable comme une devise, une unité ou une priorité, un `select` natif contrôlé est acceptable et conserve un bon comportement mobile.

Les identifiants techniques ne sont jamais le libellé principal.

Une création rapide n’est affichée que si elle persiste réellement la donnée, applique les permissions et revient avec la référence sélectionnée. Aucun bouton placeholder n’est permis.

## 6. Lien avec un compte DTSC

Les formulaires représentant une personne utilisent le pattern `EnterpriseIdentityLinkChoice` :

- Créer une fiche manuellement ;
- Inviter une personne à lier son compte DTSC ;
- Inviter cette personne à créer un compte DTSC ;
- Associer plus tard.

La création de la fiche ne dépend jamais de l’existence d’un compte. La liaison est une opération distincte, consentie, auditable et révocable. Les états « déjà liée », « consentement en attente », « refusée » et « révoquée » sont affichés clairement.

## 7. Responsive, clavier et zones sûres

Références : 320, 360, 375, 390, 414, 768 et 1024 px.

- `min-w-0` et `max-w-full` sur les conteneurs rétractables ;
- grilles flexibles avec `minmax(0, 1fr)` ;
- pas de scroll horizontal de page ;
- dialogues longs avec scroll interne et `data-dtsc-dialog-scroll` ;
- marge de scroll pour le clavier virtuel ;
- boutons accessibles au-dessus des safe areas ;
- cibles tactiles d’au moins 44 px lorsque possible ;
- actions principales accessibles sans être masquées par la navigation basse ;
- KPI conservés dans le rail horizontal partagé sur mobile.

Les mots ordinaires utilisent une coupure normale. `overflow-wrap:anywhere` est réservé aux URL, emails, fichiers, identifiants et chaînes externes marquées avec les attributs dédiés.

## 8. Accessibilité

- ordre de tabulation logique ;
- libellé associé à chaque contrôle ;
- aide visible et compréhensible sans dépendre d’un hover ;
- `aria-describedby` lorsque la primitive peut relier explicitement aide et contrôle ;
- `aria-invalid` lorsque nécessaire ;
- `role="alert"` pour l’erreur bloquante ;
- focus placé sur la première erreur après soumission ;
- actions disponibles au clavier ;
- statut non communiqué uniquement par la couleur.

## 9. Sécurité

Toute écriture suit : session → contexte actif → membership → module → entitlement → permission → visibilité objet → même origine → validation → rate limit → transaction → audit.

Le frontend masque les actions impossibles, mais ne constitue jamais la barrière de sécurité. Les données sensibles ne sont pas inscrites inutilement dans les logs.

Une valeur choisie dans une combobox n’est jamais considérée comme fiable parce qu’elle provient de l’interface : toute référence est revalidée côté serveur dans le même tenant et selon les permissions réelles.

## 10. QA minimale

Chaque formulaire professionnel couvre :

- affichage par rôle ;
- création valide ;
- validation de chaque section ;
- aide contextuelle visible sur les champs significatifs ;
- absence de saisie libre lorsque le domaine possède une source contrôlée ;
- référence d’un autre tenant refusée ;
- double soumission ;
- concurrence ;
- erreur métier localisée ;
- retour détail ;
- navigation clavier ;
- clavier iOS ;
- largeurs mobiles ;
- langue française et anglaise ;
- lien DTSC lorsqu’applicable.

Une QA statique doit au minimum empêcher la réintroduction de champs `currency` ou `unit` libres dans les formulaires professionnels déjà migrés vers les choix contrôlés.
