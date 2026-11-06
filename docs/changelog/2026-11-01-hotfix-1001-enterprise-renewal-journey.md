# Hotfix #1001 — renouvellement SaaS entreprise accessible

**Périmètre :** tableau de bord, facturation, lien Support, traductions FR/EN, QA.

- Signal d'échéance client et raccourcis directs du tableau de bord vers le renouvellement de l'entreprise active.
- Espace de renouvellement visible en haut de Facturation, paiement ponctuel distinct de la demande manuelle, indication d'absence de paiement en ligne.
- Suivi du dernier ticket, de son statut, de ses dates et de la réponse DTSC. Aucun doublon si une demande est encore ouverte.
- Deep link Support vers le ticket autorisé même s'il était hors de la page courante. Les autres administrateurs ne gagnent pas accès aux conversations du demandeur.
- Aucun changement du schéma, aucune migration, aucun secret et aucune activation de paiement automatique.

**Rollback :** revenir au commit antérieur du code sur `main` par un revert dédié ; les tickets et paiements déjà enregistrés restent conservés, sans opération de migration inverse.

**Preuves :** tests ciblés, régression, type-check, lint, build et E2E propriétaire à renseigner dans la PR #1001. Aucune preuve E2E ni déploiement Production présumé.
