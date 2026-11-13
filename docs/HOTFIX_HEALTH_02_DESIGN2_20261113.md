# HEALTH-02 / #1147 — Design 2.0 transversal Santé — tranche Navigation
Date : 2026-11-13 · Branche : `fix/1147-health-design-2-0` · non fusionnée.

## Livré dans la tranche Navigation
- Navigation principale reconfigurée : répertoire de cartes compactes et réactives en dashboard, accès à l'espace Santé spécialisé en plein écran.
- Sur le détail : barre sticky compacte, bouton retour « Retour aux modules », changement de module par liste accessible.
- Recherche de modules par titre et description avec état vide.
- FR/EN pour tous les libellés et descriptions d'accès aux onze modules, focus clavier, états hover/active, break-words et adaptativité responsive.
- Respect des entitlements : modules inactifs absents de la navigation, retour au dashboard si le module actif n'est plus accessible.
- Suppression du compteur legacy trompeur calculé depuis les 300 premières projections historiques.
- Réutilisation des workspaces existants; aucune donnée clinique copiée dans des composants génériques.

## Restant obligatoire avant clôture #1147
- [ ] Harmoniser les 11 en-têtes, formes et registres avec le contrat Design 2.0 POS, tout en gardant la spécificité médicale.
- [ ] Généraliser recherche/date précise/intervalle/rails/tri/pagination serveur sur les onze API/workspaces.
- [ ] Ajouter exports professionnels sécurisés CSV/XLSX/PDF, masquage PHI et audit d'export par action et module.
- [ ] Toasts globaux et messages FR/EN à tous les formulaires, états erreur/succès/loading accessibles.
- [ ] Test visuel 320/360/375/390/414/768/1024, clair/sombre, focus/tactile et dialogues.
- [ ] E2E fonctionnel complet et validation du propriétaire.

## Sécurité
L'interface ne confère jamais de permissions supplémentaires. Les données de santé sont contrôlées par les routes et services spécialisés; il est interdit d'inférer un droit clinique depuis la navigation.

## Tests
`pnpm qa:health-02`, QA régression, TypeScript, lint, build, navigateur FR/EN mobile, E2E propriétaire. Les contrôles n'ont pas encore été certifiés pour ce SHA.