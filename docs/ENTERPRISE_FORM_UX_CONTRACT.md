# Contrat UX des formulaires ERP DTSC

Version : 1.0  
Date : 1 août 2026

## 1. Structure

Un formulaire métier est une surface de travail, pas un bloc décoratif. Il doit utiliser une page dédiée, un drawer large ou un dialogue plein écran lorsque sa longueur l’exige.

Sur mobile, le parcours standard est : liste → détail plein écran → formulaire plein écran → retour. Un formulaire long ne doit jamais être comprimé dans une petite carte ou une modale courte.

Le formulaire est divisé en sections ou étapes correspondant au métier. Une section n’existe que si elle contient des champs utiles. Les blocs « Informations principales » répétés sont interdits.

## 2. Champs

- Les champs obligatoires sont annoncés dans le libellé et dans l’accessibilité.
- Les libellés sont commerciaux, traduits et stables.
- L’aide contextuelle explique la finalité, les contraintes et les conséquences.
- Les références utilisent des combobox alimentées par des données du même `organizationId`.
- Une valeur de référence reçue est toujours rechargée côté serveur avec le tenant actif.
- Les statuts, priorités, types et catégories utilisent des valeurs contrôlées.
- Les champs texte libres ne remplacent pas une véritable relation métier.
- Les contrôles de saisie ont une taille calculée d’au moins 16 px sur iOS.

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

Une combobox doit proposer : recherche, chargement, état vide, erreur, nom métier et information secondaire utile. Les identifiants techniques ne sont jamais le libellé principal.

Une création rapide n’est affichée que si elle persiste réellement la donnée, applique les permissions et revient avec la référence sélectionnée. Aucun bouton placeholder n’est permis.

## 6. Lien avec un compte DTSC

Les formulaires représentant une personne utilisent le pattern `EnterpriseIdentityLinkChoice` :

- Créer une fiche manuellement ;
- Inviter une personne à lier son compte DTSC ;
- Inviter cette personne à créer un compte DTSC ;
- Associer plus tard.

La création de la fiche ne dépend jamais de l’existence d’un compte. La liaison est une opération distincte, consentie, auditable et révocable. Les états « déjà liée », « consentement en attente », « refusée » et « révoquée » sont affichés clairement.

## 7. Responsive, clavier et zones sûres

Références : 320, 360, 390, 412, 768 px et desktop.

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
- `aria-describedby` pour aide et erreur ;
- `aria-invalid` lorsque nécessaire ;
- `role="alert"` pour l’erreur bloquante ;
- focus placé sur la première erreur après soumission ;
- actions disponibles au clavier ;
- statut non communiqué uniquement par la couleur.

## 9. Sécurité

Toute écriture suit : session → contexte actif → membership → module → entitlement → permission → visibilité objet → même origine → validation → rate limit → transaction → audit.

Le frontend masque les actions impossibles, mais ne constitue jamais la barrière de sécurité. Les données sensibles ne sont pas inscrites inutilement dans les logs.

## 10. QA minimale

Chaque formulaire professionnel couvre :

- affichage par rôle ;
- création valide ;
- validation de chaque section ;
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
