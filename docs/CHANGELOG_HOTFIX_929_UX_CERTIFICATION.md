# UX-06 — Certification visuelle automatisée et accessibilité ERP

Un scénario Playwright authentifié est ajouté au job CI ERP existant, sur une base Postgres synthétique et un serveur local : il **ne visite ni ne modifie les données de Production**.

Ce scénario contrôle huit largeurs entre 320 et 1440 px, l'absence de débordement horizontal, la présence de l'en-tête ERP, un budget de navigation configurable (20 secondes par défaut) et les règles WCAG 2.0/2.1/2.2 A/AA avec axe-core. Il produit des captures à vérifier dans les artefacts CI. Un parcours supplémentaire ouvre un module autorisé sur mobile.
Le lien utilisé par ce parcours est identifié par son nom accessible réel (`Ouvrir …` / `Open …`), vérifie la destination puis teste le retour au hub. Le sélecteur de données inexistant a été retiré.

## Portée et limites

- Ce n'est pas encore un certificat de conformité WCAG pour **toute** l'application : le premier périmètre E2E est le hub ERP + un module pilote. Les autres secteurs, le clavier et le lecteur d'écran exigent leur matrice de parcours.
- Les tests peuvent découvrir des violations préexistantes : ces défauts devront être corrigés, pas supprimés ou exclus du contrôle.
- Les seuils de navigation mesurent l'accès interactif au hub, pas encore LCP/INP/CLS en conditions réelles. Une mesure RUM/production anonymisée reste à planifier dans #929.
- Aucune Preview Vercel : la CI s'exécute contre un build local sur base synthétique.

`node scripts/qa-hotfix-929-ux-certification.mjs` contrôle l'intégration du gate. Les E2E visuels nécessitent les fixtures et le navigateur de la CI et la confirmation `OWNER_E2E` avant fusion. Rollback par revert, sans migration.
