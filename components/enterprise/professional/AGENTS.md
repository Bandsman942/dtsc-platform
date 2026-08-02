# AGENTS.md — Workspaces ERP professionnels

Règles durables applicables à ce répertoire :

1. Les workspaces génériques sont transitoires ; tout module déclaré professionnel utilise un workspace métier dédié.
2. Les formulaires n’exposent jamais d’UUID, de code interne ou d’enum brute.
3. Les libellés français passent par des dictionnaires ou mappings contrôlés.
4. Les sélecteurs de relation chargent uniquement les objets de la même organisation et sont revalidés côté serveur.
5. Une action visible doit être réellement implémentée, autorisée par le statut et la permission, et auditée côté serveur lorsque sensible.
6. Les longues saisies utilisent une route dédiée, un drawer large ou un dialogue plein écran ; sur mobile, privilégier le plein écran.
7. Les KPI restent dans un rail horizontal local sur petit écran ; aucun mot normal ne doit être cassé arbitrairement.
8. Les filtres et onglets horizontaux utilisent un rail tactile natif, `touch-action: pan-x`, une inertie mobile et un recentrage de l’élément actif ; ils ne sont jamais placés dans la grille des boutons d’action.
9. Une ligne métier mobile réserve d’abord la largeur au titre et aux métadonnées ; les actions descendent sous le contenu avant de réduire le titre à une colonne illisible.
10. Le droit de lecture, le droit d’écriture opérationnelle et le droit d’administrer un module sont distincts. Un formulaire métier est visible au rôle disposant du droit d’écriture, sans lui conférer l’administration globale.
11. Les ventes, achats et stock utilisent les référentiels communs et ne créent aucun moteur parallèle.
12. Commande, facture, paiement et écriture comptable restent distincts.
13. Disponibilité, absence, présence, temps déclaré, temps approuvé et paie restent distincts.
14. Les dossiers RH, salaires, informations bancaires, sanctions et bulletins restent confidentiels.
15. Un employé peut exister sans compte DTSC ; toute liaison exige un consentement explicite.
16. Une relation active ne donne que les accès explicitement résolus côté serveur ; une révocation retire ces accès sans supprimer le dossier métier.
17. Tout workflow de soumission enregistre un validateur assigné. Pendant l’état d’attente, seul ce validateur ou une règle serveur explicitement documentée peut approuver, refuser ou demander une correction.
18. Une demande de correction conserve le motif et renvoie l’objet dans un état modifiable sans supprimer son historique ni ses révisions.
19. Les commentaires d’un workflow sont visibles uniquement par les participants autorisés ; la modification et la suppression logique restent réservées à l’auteur, avec audit.
20. Un document lié à un objet métier doit accepter un fichier réel, privé et versionné ; l’interface ne demande jamais un chemin de stockage technique.
21. Chaque module professionnel possède son propre guide utilisateur avec prérequis, procédure, statuts, contrôles et dépannage. Aucun lien ne redirige silencieusement vers le guide d’un autre module.
22. Les notifications utilisent un lien profond vers le module, l’objet précis, la section et l’action attendue.
23. Aucun module ne devient `COMMERCIAL_READY` sans parcours complet, packaging, onboarding, support, observabilité, QA et décision fonctionnelle explicite du propriétaire.
24. Les tests E2E manuels post-correctif ne sont jamais déclarés réussis sans confirmation explicite du propriétaire.
25. Les migrations restent additives et non destructives.
26. La Production provient uniquement de `main` via le pipeline existant.
