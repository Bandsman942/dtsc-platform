# Changelog — Expérience standard des modules

## 30 juillet 2026

### Améliorations UI/UX

- Conservation du rail KPI horizontal tactile sur mobile et tablette, avec snap et grille uniquement sur desktop.
- Généralisation des primitives workspace aux pages Dashboard, Notifications, Annonces, Entreprise, Abonnement, Support, Paramètres et Profil.
- Maintien du contrat responsive global, des safe areas, du thème sombre et des interactions tactiles.

### Notifications

- Le clic principal sur une notification marque désormais la notification comme lue et ouvre sa cible.
- Ajout de builders centralisés et sûrs pour les cibles d'annonces, publications, tickets support, activités, conversations, modules Enterprise, administration et calendrier.
- Normalisation des URLs internes avant persistance et Web Push.
- Ciblage précis des annonces, commentaires d'annonces, transferts, signalements, commentaires publics, tickets et messages support.
- Ajout d'une page d'annonce ciblée et d'activateurs pour déplier puis mettre en évidence les commentaires notifiés.

### Commentaires

- Ajout de la primitive accessible `CollapsibleThread`.
- Commentaires Activités DTSC repliables avec conservation de la pagination, des réponses, mentions, modifications et suppressions.
- Commentaires Enterprise Core repliables dans le détail métier.
- Conservation des mécanismes existants équivalents dans Annonces et Publications publiques.

### Annonces

- Ajout d'une visionneuse plein écran des images de contenu riche.
- Conservation du ratio et de la source, zoom 50–300 %, réinitialisation, fermeture clavier/clic/bouton et scroll interne.

### Qualité

- Ajout de `pnpm qa:standard-experience` dans `pnpm qa:regression`.
- Mise à jour du contrôle workspace pour rendre le rail KPI horizontal mobile obligatoire.
- Ajout de règles permanentes dans `app/AGENTS.md` et `components/AGENTS.md`.
- Aucun changement de schéma Prisma, de données métier, de RBAC, de politique Vercel ou de stratégie de migration.
