# AGENTS.md — Workspaces ERP professionnels

Règles durables applicables à ce répertoire :

1. Les workspaces génériques sont transitoires ; tout module déclaré professionnel utilise un workspace métier dédié.
2. Les formulaires n’exposent jamais d’UUID, de code interne ou d’enum brute.
3. Les libellés français passent par des dictionnaires ou mappings contrôlés.
4. Les sélecteurs de relation chargent uniquement les objets de la même organisation et sont revalidés côté serveur.
5. Une action visible doit être réellement implémentée, autorisée par le statut et la permission, et auditée côté serveur lorsque sensible.
6. Les longues saisies utilisent une route dédiée, un drawer large ou un dialogue plein écran ; sur mobile, privilégier le plein écran.
7. Les KPI restent dans un rail horizontal local sur petit écran ; aucun mot normal ne doit être cassé arbitrairement.
8. Les ventes, achats et stock utilisent les référentiels communs et ne créent aucun moteur parallèle.
9. Commande, facture, paiement et écriture comptable restent distincts.
10. Disponibilité, absence, présence, temps déclaré, temps approuvé et paie restent distincts.
11. Les dossiers RH, salaires, informations bancaires, sanctions et bulletins restent confidentiels.
12. Un employé peut exister sans compte DTSC ; toute liaison exige un consentement explicite.
13. Une relation active ne donne que les accès explicitement résolus côté serveur ; une révocation retire ces accès sans supprimer le dossier métier.
14. Les notifications utilisent un lien profond vers le module, l’objet précis, la section et l’action attendue.
15. Aucun module ne devient `COMMERCIAL_READY` sans parcours complet, packaging, onboarding, support, observabilité, QA et validation fonctionnelle manuelle du propriétaire.
16. Les tests E2E manuels ne sont jamais déclarés réussis sans confirmation explicite du propriétaire.
17. Les migrations restent additives et non destructives.
18. La Production provient uniquement de `main` via le pipeline existant.
