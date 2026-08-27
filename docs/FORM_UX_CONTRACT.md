# Contrat obligatoire des formulaires DTSC Platform

Statut : **obligatoire pour tout formulaire nouveau ou modifié**.

Ce contrat complète `docs/CONTRIBUTING.md`, `AGENTS.md`, le contrat responsive et les règles de sécurité multi-tenant. Il s’applique aux formulaires Administration DTSC, Administration entreprise, ERP, modules sectoriels, collaboration, compte, support et toute autre surface de DTSC Platform.

## 1. Données de référence

- Une relation métier existante n’est pas saisie comme identifiant libre.
- Utiliser la combobox / select de référence canonique du domaine, avec recherche lorsque la liste peut être longue.
- Les options proviennent des données réelles déjà disponibles dans DTSC Platform et sont bornées au contexte autorisé de l’utilisateur.
- Un champ de référence vide affiche un empty state humain (`Aucun compte disponible`, `Aucun patient disponible`, etc.) et, si utile, l’action permettant réellement de créer/configurer la donnée manquante.
- Le backend revalide toujours la référence, son `organizationId`, son statut, le membership, le module actif, l’entitlement et la permission applicables. Une option proposée par l’UI ne constitue jamais une autorisation.

## 2. Champs et aide contextuelle

- Un formulaire ne contient que les champs nécessaires à l’action en cours.
- Les longues fiches sont découpées en sections métier cohérentes ; ne pas répéter un bloc générique « informations principales » pour remplir l’espace.
- Les champs ambigus, réglementés ou dépendants d’une configuration disposent d’une aide contextuelle courte expliquant quoi saisir et pourquoi.
- Les listes contrôlées (statut, priorité, type, devise, opérateur, etc.) utilisent la source de vérité canonique du domaine au lieu d’un texte libre.

## 3. Soumission et état de l’action

Toute action visible doit avoir une réaction perceptible :

- état `hover/focus/pressed` lorsque pertinent ;
- état `loading` pendant la mutation ;
- état `disabled` lorsque les préconditions ne sont pas satisfaites ;
- résultat explicite de succès ou d’échec.

Aucun bouton placeholder ou bouton muet n’est admis.

## 4. Succès

Un formulaire ne se ferme, ne se réinitialise et ne perd ses valeurs qu’après **succès backend confirmé**.

Après succès :

- afficher un toast global de succès au premier plan ;
- utiliser un message métier spécifique (`Portefeuille M-Pesa CDF enregistré`, `Opération Mobile Money confirmée`, etc.) ;
- rafraîchir uniquement les données nécessaires ;
- fermer/réinitialiser le formulaire si le parcours le prévoit.

## 5. Échec

En cas d’erreur :

- le formulaire reste ouvert ;
- les valeurs saisies restent présentes ;
- le focus et le contexte utilisateur sont préservés autant que possible ;
- afficher un toast global d’erreur au premier plan ;
- afficher une erreur locale près du formulaire/champ lorsqu’elle aide à corriger l’action ;
- le message explique la cause métier et l’action corrective possible.

Ne jamais afficher au client : stack trace, erreur Prisma brute, route API, enum technique brut, `organizationId`, `tenant`, payload, code provider brut ou détail d’implémentation sans équivalent métier.

## 6. Toasts et dialogs

- Le provider de toast global est la source commune de feedback applicatif.
- Un toast succès/erreur doit être rendu au-dessus des dialogs, sheets, drawers, claviers mobiles et overlays applicatifs.
- Ne pas créer un second système de toast local si le provider global répond au besoin.
- Un message inline peut compléter le toast mais ne le remplace pas pour une mutation importante.

## 7. Mobile, clavier et accessibilité

- Les formulaires longs utilisent une page, un drawer large ou un plein écran ; sur mobile, éviter les petits dialogs contenant de longues fiches.
- Les CTA restent accessibles avec clavier virtuel et safe areas.
- Les labels ne sont pas remplacés uniquement par des placeholders.
- Les erreurs sont annoncées avec des rôles/accessibilités appropriés lorsque pertinent.
- Les cibles tactiles, focus-visible, contrastes, FR/EN et clair/sombre respectent les contrats DTSC.

## 8. Validation minimale d’une contribution de formulaire

La QA ciblée vérifie au minimum :

1. options de référence issues du bon tenant/contexte ;
2. rejet serveur d’une référence d’un autre tenant ou invalide ;
3. succès : toast visible + fermeture/réinitialisation seulement après réponse réussie ;
4. échec : toast visible + formulaire toujours ouvert + valeurs conservées ;
5. aucun bouton silencieux ;
6. FR/EN ;
7. mobile et desktop ;
8. clair/sombre si la surface le supporte ;
9. clavier/focus ;
10. message utilisateur sans jargon technique.

Les preuves suivent strictement les états définis dans `docs/CONTRIBUTING.md` : `LOCAL_EXECUTED`, `CI_PROVEN`, `OWNER_E2E` ou `NOT_EXECUTED`.
