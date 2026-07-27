# QA — Sprint 1 Mobile / iOS / Safari / PWA

Cette checklist complète `docs/QA_REGRESSION_CHECKLIST.md` pour la stabilisation mobile. Elle ne remplace pas les tests sur appareils réels.

## Gate automatisée source-level

- [ ] `pnpm qa:regression`
- [ ] `pnpm qa:mobile`
- [ ] `pnpm type-check`
- [ ] `pnpm build`

## Viewport et safe areas

- [ ] La page utilise un seul viewport Next.js avec `width=device-width`, `initial-scale=1` et `viewport-fit=cover`.
- [ ] Le header mobile ne passe pas sous l'encoche / Dynamic Island en standalone.
- [ ] La navigation basse et les actions fixes restent au-dessus du home indicator.
- [ ] Un dialog haut reste entièrement accessible lorsque le clavier virtuel est ouvert.
- [ ] Le champ ayant le focus peut être ramené dans la partie visible du dialog sans double scroll bloquant.

## Clavier et formulaires

- [ ] Sur iPhone réel, un tap utilisateur sur Input ouvre le clavier sans second tap.
- [ ] Textarea ouvre le clavier et reste scrollable.
- [ ] Le bouton afficher/masquer le mot de passe ne fait pas perdre durablement le focus.
- [ ] Aucun contrôle textuel mobile n'entraîne un zoom Safari indésirable.
- [ ] Les champs dans Administration, Support, Profil, Paramètres et modules entreprise restent utilisables dans un dialog haut.
- [ ] Aucun overlay invisible n'intercepte le tap sur le champ actif.

## Select / dropdown / menus

- [ ] Un `Select` ouvert dans un `Dialog` est visible au-dessus du dialog.
- [ ] Une liste longue est scrollable au doigt sans faire défiler toute la page en même temps.
- [ ] La liste est bornée au viewport visible lorsque le clavier est ouvert.
- [ ] Les éléments de liste ont une cible tactile suffisante.
- [ ] Les menus `...` restent dans les limites du viewport en portrait et paysage.
- [ ] Un changement de taille/position du viewport ferme proprement un menu flottant devenu obsolète.

## Débordements et scroll

- [ ] 320 px : aucun débordement horizontal critique sur landing, auth, dashboard, Support et formulaires représentatifs.
- [ ] 375 px : aucun débordement horizontal critique.
- [ ] 390 px : aucun débordement horizontal critique.
- [ ] 414 px : aucun débordement horizontal critique.
- [ ] 768 px : dialogs, menus et listes restent bornés.
- [ ] 1024 px : transition navigation mobile/desktop correcte.
- [ ] 1440 px : aucune régression desktop.
- [ ] Les tables/charts qui dépassent utilisent leur propre stratégie responsive/scroll sans agrandir le body.

## PWA

- [ ] Le manifest est installable et `display: standalone` reste effectif.
- [ ] `/api/*`, les routes d'auth et les pages privées ne sont jamais servies depuis le cache statique.
- [ ] `/offline.html` reste le fallback autonome.
- [ ] Les assets statiques déjà en cache sont revalidés en arrière-plan.
- [ ] Une nouvelle version du service worker remplace l'ancien cache.
- [ ] L'application vérifie une mise à jour au retour online, au focus et au retour visible.
- [ ] Une mise à jour de worker ne déclenche pas une boucle de reload.

## Parcours métier représentatifs

### Auth

- [ ] Landing → Connexion → Authentification → redirection correcte.
- [ ] Création de compte seulement avec données de test autorisées.
- [ ] Sélection d'organisation utilisable sur iPhone.

### Compte

- [ ] Profil.
- [ ] Paramètres.
- [ ] Inputs / textarea / select.
- [ ] Dialogs.

### DTSC interne

- [ ] Dashboard.
- [ ] Activités DTSC.
- [ ] Administration selon permissions.
- [ ] Support.
- [ ] Mes collaborateurs.
- [ ] Chatbot.

### Entreprise cliente

- [ ] Dashboard entreprise.
- [ ] Collaborateurs.
- [ ] Administration entreprise.
- [ ] Module sectoriel accessible.
- [ ] IA Assistant Entreprise.

### Conversations

- [ ] Focus du champ de saisie.
- [ ] Clavier virtuel.
- [ ] Scroll du fil.
- [ ] Pièces jointes si disponibles.
- [ ] Menus contextuels.

## Nature de la validation

À renseigner dans le rapport final :

- iPhone réel : oui / non + modèle/version iOS si oui ;
- Safari réel : oui / non + version si oui ;
- émulation : outils et profils utilisés ;
- source-level uniquement : préciser les limites ;
- console/réseau : erreurs observées ou impossibilité de vérifier.
