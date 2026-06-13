# Checklist QA regression DTSC Platform

Cette checklist couvre les parcours critiques apres les refactors Console DTSC, Entreprise, Support, appels collaboratifs et sous-domaines. Elle complete la commande:

```bash
pnpm qa:regression
```

La commande effectue des controles source-level sans dependance externe: middleware, redirects, routes Support, routes Enterprise, groupes, appels, notifications, calendrier et loaders. Elle ne remplace pas les tests manuels avec comptes reels de staging.

## Santé - Laboratoire

- [ ] Une demande laboratoire exige un patient, un demandeur actif et au moins un examen du catalogue de la même organisation.
- [ ] Une consultation liée appartient à la même organisation et au même patient.
- [ ] Prélèvement, saisie, validation, correction, transmission et annulation vérifient leurs permissions côté API.
- [ ] Un résultat validé ou transmis ne peut pas être modifié librement.
- [ ] Une correction après validation exige un motif et crée un historique.
- [ ] Les résultats sensibles sont masqués sans `health.laboratory.view_sensitive`.
- [ ] Les résultats validés restent visibles depuis Consultation et Dossier médical selon les permissions.
- [ ] Les demandes apparaissent dans l’activité liée du patient.
- [ ] Liste, filtres, détail et formulaires Laboratoire restent utilisables sans débordement mobile.

## Santé - Pharmacie interne

- [ ] Produit, lot, mouvement et délivrance restent liés au même `organizationId`.
- [ ] Une sortie supérieure au stock, depuis un lot expiré/bloqué ou depuis un produit bloqué/archivé est refusée.
- [ ] La sélection automatique de lot suit FEFO parmi les lots réellement délivrables.
- [ ] Une sortie sensible exige explicitement `health.pharmacy.authorize_sensitive_exit`.
- [ ] Patient, consultation, service et prescripteur inter-organisation sont refusés côté serveur.
- [ ] Les délivrances autorisées sont visibles dans Patient, Consultation et Dossier médical sans exposer les produits sensibles.
- [ ] Liste, filtres, détail, lots, mouvements et formulaires restent utilisables sans débordement mobile.

## Santé - Facturation médicale

- [ ] Toute facture et tout paiement restent liés au même `organizationId` que le patient.
- [ ] Les totaux, remises, part assurance, montant patient, montant payé et solde sont recalculés côté serveur.
- [ ] Une consultation, demande laboratoire ou délivrance pharmacie d’une autre organisation est refusée.
- [ ] Un même élément médical lié ne peut pas être facturé deux fois.
- [ ] Un paiement supérieur au solde, sur facture payée ou annulée, est refusé.
- [ ] Une facture avec paiement ne peut pas être annulée sans traitement financier contrôlé.
- [ ] Liste, filtres, détail, lignes et paiement restent utilisables sans débordement mobile.

## Santé - Équipe médicale

- [ ] Seul un membre actif de l’organisation peut recevoir une affectation Santé.
- [ ] Le poste, le service, la spécialité et le responsable appartiennent à la même organisation.
- [ ] Un membre ne peut pas recevoir deux affectations Santé.
- [ ] Suspension, réactivation, archivage et changements de permissions sont audités.
- [ ] Les permissions Santé ne sont pas modifiables sans permission dédiée.
- [ ] Rendez-vous ne propose que les professionnels Santé actifs et disponibles.
- [ ] Consultations ne propose que les professionnels cliniques actifs et disponibles.
- [ ] Un professionnel suspendu ou archivé est refusé côté serveur lors d’une nouvelle assignation.
- [ ] Les notes confidentielles médicales exigent la permission Santé dédiée.
- [ ] Liste, détail et formulaire Équipe médicale restent utilisables sans débordement mobile.

## Santé - Dossiers médicaux

- [ ] Un patient ne peut posséder qu’un seul dossier médical principal, même après une nouvelle tentative de création.
- [ ] Une autre organisation ne peut ni lire ni modifier le dossier ou ses éléments structurés.
- [ ] Un lecteur administratif non sensible ne reçoit ni synthèse clinique, ni éléments médicaux, ni notes confidentielles.
- [ ] Une allergie grave ou potentiellement mortelle crée une alerte active dans la même transaction.
- [ ] Les consultations liées proviennent de `HealthConsultation` et ne sont pas dupliquées.
- [ ] Archivage, réactivation et ajouts structurés créent un audit ou un événement.
- [ ] Administration, Activités et Patients ouvrent le workspace dédié, sans formulaire générique.
- [ ] Les listes, détails et formulaires restent plein écran et sans débordement sur mobile.

## Santé - Patients

- [ ] Une organisation HEALTH_CARE crée un patient avec un identifiant généré et ne peut pas utiliser les routes Santé génériques pour contourner le module dédié.
- [ ] La liste recherche par nom, téléphone ou identifiant et filtre par sexe, statut et période de création.
- [ ] Le détail affiche les activités liées et un historique minimal sans exposer les données médicales sensibles aux lecteurs non autorisés.
- [ ] Une autre organisation ne peut ni lire ni modifier le patient.
- [ ] Les statuts Archivé et Décédé exigent un motif et créent un événement ainsi qu’un audit.
- [ ] Un patient archivé n’est jamais supprimé brutalement et doit être réactivé avant modification.
- [ ] Les actions rendez-vous, consultation, document et dossier médical ouvrent les formulaires existants avec le patient lié.
- [ ] Le formulaire et le détail Patients restent plein écran et sans débordement sur mobile.

## Santé - Rendez-vous

- [ ] Un rendez-vous référence obligatoirement un patient actif du même `organizationId`.
- [ ] Un professionnel et un service sélectionnés appartiennent à l’entreprise active.
- [ ] La liste et le planning filtrent réellement par patient, période, professionnel, statut, priorité et type.
- [ ] Les transitions interdites sont rejetées côté serveur et les statuts terminaux verrouillent la modification libre.
- [ ] L’annulation exige un motif et crée un événement ainsi qu’un audit.
- [ ] La conversion crée une seule consultation liée au patient et au rendez-vous, même en cas de nouvelle tentative.
- [ ] Les notes internes et données médicales patient ne sont pas exposées sans accès sensible.
- [ ] Administration et Activités réutilisent le workspace dédié avec actions filtrées selon permissions.
- [ ] Le formulaire et le détail Rendez-vous restent plein écran et sans débordement sur mobile.

## Santé - Consultations

- [ ] Une consultation référence obligatoirement un patient et un professionnel actifs du même `organizationId`.
- [ ] Un rendez-vous lié appartient au même patient, à la même entreprise et ne peut générer qu’une consultation.
- [ ] Les constantes vitales sont persistées et l’IMC est calculé côté serveur à partir du poids et de la taille.
- [ ] Les données cliniques sensibles sont masquées côté API pour un lecteur administratif.
- [ ] La liste filtre réellement par patient, période, professionnel, statut, priorité et type.
- [ ] Les transitions interdites sont rejetées; clôture, réouverture et annulation sont historisées.
- [ ] Une réouverture ou annulation exige un motif et une consultation clôturée n’est pas modifiable librement.
- [ ] Les routes Santé génériques ne peuvent pas contourner le module Consultations dédié.
- [ ] Administration, Activités et Patients ouvrent le workspace ou le formulaire Consultations dédié.
- [ ] Le formulaire et le détail Consultations restent plein écran et sans débordement sur mobile.

## Socle commun ERP

- [ ] Une entreprise ne peut lire, créer ou modifier aucun objet commun d’une autre entreprise.
- [ ] Un membre voit uniquement les objets qu’il a créés, demandés, reçus ou qu’il doit valider.
- [ ] Un responsable voit les objets communs de son entreprise et peut prendre les décisions autorisées.
- [ ] Un invité peut consulter les objets visibles mais ne voit aucune action de création ou mutation.
- [ ] Un rejet exige un motif et les changements de statut créent un événement ainsi qu’un audit.
- [ ] Les collaborateurs et départements sélectionnés appartiennent obligatoirement à l’entreprise active.
- [ ] Une demande Activités entreprise crée une demande commune liée.
- [ ] Une activité PHARMACY crée une tâche, demande ou rapport commun lié sans modifier sa source spécialisée.
- [ ] Les formulaires communs restent contenus sur mobile, affichent des libellés français et une info-bulle par étiquette.

## Pharmacie - Rapports

- [ ] Les indicateurs viennent des tables réelles; ventes annulées exclues du net, encaissements issus des paiements et stocks issus des lots.
- [ ] Les montants et données sensibles sont masqués sans permission; vues, snapshots et exports restent isolés par `organizationId`.
- [ ] L'export CSV fonctionne, respecte les filtres et journalise les exports sensibles.

## Pharmacie - Lots & péremptions

- [ ] Une organisation PHARMACY crée et modifie un lot lié à un produit actif de la même organisation.
- [ ] Les doublons produit + numéro de lot et les codes-barres de lot dupliqués sont refusés.
- [ ] Les quantités négatives, incohérentes ou supérieures à la quantité reçue sont refusées.
- [ ] Les lots expirés, rappelés, bloqués et en quarantaine sont exclus de l'endpoint FEFO.
- [ ] Les lots vendables sont triés par date de péremption croissante.
- [ ] Les actions quarantaine, levée, rappel, blocage et annulation exigent un motif et créent une trace.
- [ ] Une organisation ne peut consulter ou modifier aucun lot d'une autre organisation.
- [ ] Le formulaire lots reste plein écran sur mobile et utilise les référentiels réels pour ses relations.

## Pharmacie - Stock & inventaire

- [ ] Les KPI stock, ruptures, stocks faibles, surstocks et valeurs proviennent des lots de l'organisation active.
- [ ] La vue stock par produit additionne les quantités disponibles, réservées et endommagées des lots.
- [ ] Une session d'inventaire génère des lignes depuis les lots de la même organisation.
- [ ] Un comptage calcule et persiste l'écart sans modifier directement le stock.
- [ ] Un ajustement validé crée un mouvement et modifie le lot; son annulation crée un mouvement inverse.
- [ ] Aucun ajustement ne peut produire une quantité disponible négative.
- [ ] Les emplacements, collaborateurs, départements, produits et lots d'une autre organisation sont refusés.
- [ ] Les dix sous-vues Stock & inventaire restent lisibles en cartes mobiles et les formulaires s'ouvrent en plein écran.
- [ ] Chaque étiquette des formulaires Stock & inventaire possède une info-bulle compréhensible et chaque option de liste est affichée en français métier, sans code interne.
- [ ] Sur un écran mobile étroit, les formulaires Stock, les filtres Produits et le sélecteur d'entreprise de connexion restent entièrement contenus dans leur zone sans débordement horizontal.

## Pharmacie - Entrées stock / réceptions

- [ ] Une organisation PHARMACY peut créer et modifier une réception en brouillon liée uniquement à ses fournisseurs, commandes, produits, collaborateurs, départements et emplacements.
- [ ] La soumission n'impacte pas le stock; la validation augmente les lots et crée un mouvement `RECEIPT` par lot reçu.
- [ ] Valider deux fois la même réception ne double jamais le stock.
- [ ] L'annulation après validation crée les mouvements inverses et refuse une quantité disponible négative.
- [ ] Une réception partielle conserve la quantité restante attendue et met la commande liée à `PARTIALLY_RECEIVED`.
- [ ] Les écarts de quantité sont persistés et les écarts critiques apparaissent dans les KPI.
- [ ] Les documents de réception utilisent le système documentaire privé sans champ URL libre.
- [ ] La liste utilise des cartes mobiles, le formulaire est plein écran et aucun sous-bloc n'est un placeholder.

## Pharmacie - Incidents qualité & pharmacovigilance

- [ ] Les quatorze vues qualité utilisent uniquement les données de l'organisation PHARMACY active.
- [ ] Une suspicion de contrefaçon ou un produit rappelé devient critique; un effet indésirable grave, un mauvais produit servi ou un produit périmé servi est au minimum élevé.
- [ ] Un incident critique sans action immédiate documentée ne peut pas être signalé.
- [ ] Un incident élevé ou critique ne peut pas être clôturé sans investigation terminée.
- [ ] Un incident critique ne peut pas être clôturé sans résumé de résolution.
- [ ] Un incident avec CAPA obligatoire ouverte ou non validée ne peut pas être clôturé.
- [ ] La création d'un incident ne modifie pas le lot; les actions quarantaine et blocage exigent un lot, un motif, une permission et un audit.
- [ ] Une alerte qualité créée depuis l'incident est persistée et dédupliquée.
- [ ] Le formulaire est plein écran, mobile-first, avec étiquettes françaises, info-bulles et combobox réelles.
- [ ] Aucun faux téléversement ou champ URL libre n'est visible dans Documents qualité.

## Pharmacie - Documents & conformité

- [ ] Les quinze vues documentaires utilisent uniquement les données et objets métier de l'organisation PHARMACY active.
- [ ] Un fichier est accepté uniquement si Supabase Storage est configuré, son type est autorisé et sa taille ne dépasse pas 10 Mo.
- [ ] Sans stockage privé, le formulaire permet seulement les métadonnées et n'affiche aucun faux téléversement.
- [ ] Le téléchargement passe par la route privée, applique RBAC/confidentialité et journalise les documents sensibles.
- [ ] Un document très confidentiel, financier, qualité ou ordonnance sensible n'est pas exposé à un membre non autorisé.
- [ ] Le renouvellement crée un nouveau document brouillon et conserve le lien avec l'ancien document.
- [ ] Les alertes d'expiration sont dédupliquées dans `PharmacyAlert`.
- [ ] Les documents manquants proviennent uniquement de règles actives et d'objets réels de la même organisation.
- [ ] Les documents spécialisés existants restent dans leurs modules et sont agrégés sans duplication dans les KPI.
- [ ] Les formulaires et détails sont plein écran, mobiles, avec libellés français, info-bulles et combobox réelles.

## Navigation et socle commun Enterprise

- Vérifier que la sidebar d'une entreprise cliente affiche uniquement les modules du socle commun actifs et autorisés.
- Vérifier que chaque module de la sidebar affiche une icône adaptée à son contenu et non l’icône générique des blocs.
- Vérifier que les modules sectoriels Santé et Pharmacie restent accessibles dans `Administration [entreprise]` sans carte ou lien latéral répété.
- Ouvrir plusieurs pages `/enterprise-modules/[moduleCode]` du socle commun et vérifier les KPI/listes issus de l'organisation active.
- Vérifier qu'une page générique refuse un module sectoriel même avec une URL saisie manuellement.
- Vérifier qu'aucune donnée d'une autre organisation n'apparaît dans les collaborateurs, départements, workflows, demandes, réunions ou audits.

## 1. Socle technique

- Executer `pnpm install --no-frozen-lockfile` si l'environnement local n'a pas encore `node_modules`.
- Executer `pnpm type-check`.
- Executer `pnpm lint`.
- Executer `pnpm qa:regression`.
- Executer `pnpm build`.
- Executer `git diff --check`.
- Verifier que Vercel lance toujours `pnpm prisma migrate deploy && pnpm build`.
- Verifier qu'aucune migration Prisma destructive n'est ajoutee.
- Verifier que la migration `20260607143000_support_and_operational_comment_threads` ajoute uniquement des colonnes, index et clés étrangères.
- Verifier que `docs/SAAS_PLANS_AND_ENTITLEMENTS.md` reste aligne avec `lib/billing/plans.ts`, `lib/billing/plan-limits.ts`, `lib/billing/module-entitlements.ts` et `lib/billing/entitlements.ts`.

## 2. Sous-domaines et auth

- Domaine public `dtsc-platform.com`: ouvrir `/`, `/services`, `/solutions`, `/secteurs`, `/projets`, `/a-propos`, `/ressources`, `/contact`, `/data-afrique`, `/bi-kpi` et `/ia-entreprise`.
- Domaine public: verifier que les liens internes visibles pointent uniquement vers des routes existantes et que les CTA principaux renvoient vers `/contact`, `/services`, `/solutions`, `/ressources`, `/projets` ou les pages pedagogiques.
- Domaine public: verifier sur mobile que les blocs de cartes, accordions, carrousels hero et CTA ne creent pas de debordement horizontal.
- Domaine public: ouvrir `/dashboard` et confirmer la redirection vers `app.dtsc-platform.com/dashboard`.
- Domaine public: ouvrir `/admin` et confirmer la redirection vers `console.dtsc-platform.com/admin`.
- Domaine public: ouvrir `/auth/sign-in` et confirmer la redirection vers `account.dtsc-platform.com/auth/sign-in`.
- Account: login avec `next` vers app, support et console.
- Account: tester un `next=https://example.com` et confirmer qu'il est refuse au profit d'une destination interne.
- Logout: confirmer l'expiration du cookie host-only et du cookie partage quand `AUTH_COOKIE_DOMAIN=.dtsc-platform.com`.
- Session expiree: ouvrir `/dashboard`, `/support`, `/collaborators`, `/enterprise-admin`, `/enterprise-activities`, `/calendar` et confirmer la redirection vers Account.

## 3. Profils utilisateur

### Utilisateur DTSC interne

- Se connecter avec contexte `DTSC_INTERNAL`.
- Ouvrir `console.dtsc-platform.com/admin`: acces autorise.
- Ouvrir `app.dtsc-platform.com/dashboard`: acces SaaS autorise.
- Ouvrir `support.dtsc-platform.com/support`: tickets Support visibles selon role.
- Ouvrir `app.dtsc-platform.com/collaborators`: groupes DTSC et groupes autorises visibles.
- Ouvrir `app.dtsc-platform.com/calendar`: calendrier interne visible selon role/poste.
- Verifier que la navigation produit affiche Console, SaaS, Support, Compte et Site public.

### Support DTSC

- Se connecter avec role `SUPPORT` et contexte `DTSC_INTERNAL`.
- Ouvrir Support: voir les tickets autorises.
- Repondre a un ticket: message persiste, notification client non bloquante.
- Tenter `/admin`: acces selon `AppSetting.adminRoleAccess`, sans passe-droit vers les donnees clientes.
- Voir les disponibilites des collaborateurs DTSC dans le calendrier si autorise par les regles recentes.
- Verifier qu'aucun ticket d'une autre organisation n'expose de donnees metier privees hors support autorise.

### Admin entreprise

- Se connecter avec contexte `ORGANIZATION`.
- Ouvrir `/enterprise-admin`: acces autorise si role entreprise habilite.
- Activer un module non socle inclus dans le plan: il apparait dans la navigation de tous les collaborateurs autorises et ouvre `/enterprise-modules/[moduleCode]`.
- Desactiver ce module: il disparait de la navigation et sa page dédiée retourne un accès introuvable/interdit.
- Confirmer qu'une entreprise ne voit que ses modules socle et ceux de son propre secteur, jamais les modules spécifiques d'un autre secteur.
- Modifier un module, un departement, un poste ou un workflow: operation persistee et limitee a `organizationId`.
- Ouvrir `/enterprise-activities`: voir les demandes de l'organisation selon permissions.
- Ouvrir `/support`: voir ses tickets personnels et creer un nouveau ticket rattache au contexte actif.
- Ouvrir `/admin`: redirection vers dashboard, pas d'acces Console DTSC.

### Membre entreprise

- Se connecter avec contexte `ORGANIZATION`.
- Ouvrir `/enterprise-admin`: refus si non habilite.
- Ouvrir `/enterprise-activities`: acces si membership actif.
- Creer une demande d'activite: visible immediatement et apres rechargement.
- Changer de contexte vers une autre organisation: les demandes, groupes et notifications changent de scope.
- Verifier qu'aucune donnee de l'organisation precedente ne reste visible.

### Client simple

- Se connecter hors organisation.
- Ouvrir `/dashboard`, `/chat`, `/company`, `/support`, `/collaborators`.
- Ouvrir `/enterprise-admin` et `/enterprise-activities`: redirection/refus attendu.
- Creer un ticket Support: visible immediatement, visible apres reconnexion, isole par `userId`.
- Tenter `/admin`: redirection dashboard.

### Utilisateur sans organisation

- Login sans `organizationId`.
- Confirmer la redirection par defaut vers `app.dtsc-platform.com/dashboard`.
- Verifier que les modules Entreprise ne sont pas accessibles.
- Verifier que Support reste accessible avec historique personnel.

## 4. Acces interdit entre organisations

- Utilisateur A de l'organisation A ne voit pas les demandes, membres, modules, workflows, records sante ou calendrier de l'organisation B.
- Utilisateur A ne peut pas appeler les routes `/api/enterprise/[organizationId]/*` de B.
- Un admin entreprise A ne peut pas ajouter, modifier ou lire des objets de B par changement manuel d'URL.
- Les donnees `HEALTH_CARE` ne se chargent que si l'organisation active a `sectorCode = HEALTH_CARE`.
- Les donnees `PHARMACY` ne se chargent que si l'organisation active a `sectorCode = PHARMACY`.
- Les routes PHARMACY refusent les produits, lots, fournisseurs, commandes, ventes et ordonnances d'une autre organisation.
- Une vente PHARMACY validee diminue le lot une seule fois; une annulation restaure le stock; une reception validee augmente le lot une seule fois.
- Les lots expires, rappeles, en quarantaine ou insuffisants sont refuses lors d'une vente.
- Administration PHARMACY affiche uniquement ses sous-modules pharmacie et Activites PHARMACY utilise des formulaires distincts avec destinataire.
- Un contexte `GLOBAL_CLIENT` ne peut pas lire les donnees d'une organisation via ancien `organizationId`.

## 5. Console DTSC

- `/admin` reste reserve a `DTSC_INTERNAL`.
- Le chargement initial ne recupere que les KPIs essentiels et les datasets de la section active.
- Les sections restent disponibles: Vue generale, Entreprises clientes, Abonnements & facturation, Support client, Publications & contenus, Utilisateurs & acces, Securite & audit, Modules internes DTSC, Parametres plateforme.
- Abonnements & facturation: verifier organisation, plan, statut abonnement, dates d'essai/renouvellement, limites utilisateurs/stockage/appels/documents, modules actifs, dernier paiement et audit des paiements.
- Abonnements & facturation: creer un abonnement pour une entreprise sans periode courante, modifier plan/statut/dates, puis verifier la persistance apres rechargement.
- Abonnements & facturation: activer, demarrer un essai, suspendre, signaler un retard et verifier que chaque transition exige un motif et produit des journaux.
- Abonnements & facturation: renouveler et verifier que l'ancienne periode passe a `EXPIRED` tandis qu'une nouvelle periode est creee et visible dans l'historique.
- Abonnements & facturation: annuler et verifier qu'aucun abonnement, paiement ou historique n'est supprime physiquement.
- Routes `/api/admin/organization-subscriptions*`: refuser origine externe, session non DTSC, role non autorise, payload invalide et creation concurrente d'une seconde periode courante.
- Plans et tarifs: un `ADMIN` modifie un prix, recharge `/admin` puis `/billing` et retrouve le prix persiste.
- Plans et tarifs: verifier qu'un `MANAGER`, une origine externe et un payload invalide sont refuses par `PATCH /api/admin/billing-plans/[id]`.
- Plans et tarifs: desactiver un plan payant et verifier qu'il reste visible dans la Console mais disparait des nouveaux abonnements; le plan `freemium` ne peut etre ni payant ni inactif.
- Plans et tarifs: appeler un parcours utilisant `ensureBillingPlans()` et verifier que les tarifs administres ne sont pas reinitialises.
- Entreprises clientes: verifier qu'une creation, suspension, archivage ou mise a jour d'abonnement exige un compte DTSC interne autorise et ne permet pas d'editer les donnees metier privees du client.
- Les modules internes CEO, COO, CTO, MPO, HR & CFO, SCO et LA restent accessibles selon poste officiel et RBAC.
- Les tableaux restent scrollables sur mobile et desktop.

## 5 bis. Plans SaaS et entitlements

- Organisation `STARTER` active sans abonnement actif: Support et collaboration de base restent lisibles, mais calendrier, appels, Administration [Entreprise], Activites [Entreprise] avancees et modules sectoriels sont bloques avec message clair.
- Organisation `BUSINESS` active avec abonnement actif: Administration [Entreprise], Activites [Entreprise], calendrier, workflows et appels collaboratifs sont disponibles selon membership/RBAC.
- Organisation `ENTERPRISE` active avec abonnement actif: modules sectoriels sante inclus et donnees `EnterpriseSectorRecord` visibles uniquement pour les modules actives.
- Organisation suspendue: modules prives bloques avec message de regularisation, Support accessible.
- Activation d'un module hors plan depuis Administration [Entreprise]: refus serveur 402/403 avec message lisible, meme si le bouton est force manuellement.
- Page `/billing` client: affichage en lecture seule du plan organisation, statut, limites, modules et enregistrements de facturation, sans action de modification autonome.
- Routes `/api/calendar/*`, `/api/collaborators/groups/*/calls`, `/api/enterprise/*` et `/api/admin/client-organizations/*`: verifier qu'un changement manuel d'URL ne contourne ni plan, ni abonnement, ni membership.

## 6. Administration [Entreprise]

- Page visible uniquement en contexte `ORGANIZATION` et avec permission d'administration.
- Les membres actifs, modules, departements, postes, workflows, calendrier et parametres sont filtres par `organizationId`.
- Les formulaires longs restent en modale/panneau responsive.
- Les routes mutantes refusent une origine externe.
- Les routes mutantes appliquent rate limiting et validation Zod.
- Le secteur Sante charge patients, rendez-vous, consultations, laboratoire, pharmacie, facturation, assurance, confidentialite et rapports uniquement pour `HEALTH_CARE`.

## 7. Activites [Entreprise]

- Page visible uniquement pour membership actif.
- Demandes recentes filtrees selon role entreprise et `organizationId`.
- Workflows partages et blocs d'activites filtres par `organizationId`.
- Creation/modification d'une demande: persistance, notification non bloquante, affichage apres rechargement.
- Changement d'organisation: aucun objet de l'ancien contexte ne reste visible.
- UX mobile: liste, recherche/pagination, detail et formulaire plein ecran restent dans la largeur de l'ecran.

## 8. Support

- Creation ticket client: persiste, visible immediatement, visible apres reconnexion.
- Historique client: tous les tickets du createur restent visibles, meme apres changement de contexte.
- Client A ne voit jamais les tickets de B.
- Support DTSC voit les tickets autorises selon role `ADMIN` ou `SUPPORT` + contexte `DTSC_INTERNAL`.
- `PATCH /api/support/tickets/[id]` refuse origine externe, utilisateur non Support DTSC et payload invalide.
- `POST /api/support/tickets/[id]/messages` refuse origine externe, utilisateur non autorise et payload invalide.
- Les notifications Support ne font pas echouer une creation ou une reponse deja persistee.
- La discussion d'un ticket reste bornée et scrollable; seuls les messages récents sont chargés initialement.
- `Charger les précédents` ajoute les anciens messages sans remplacer les messages récents.
- Depuis `...`, répondre, modifier et supprimer logiquement un message; vérifier les refus pour un utilisateur non propriétaire.
- Cliquer sur l'aperçu d'un message répondu charge progressivement les anciens messages si nécessaire, puis centre et met en évidence le message source.

## 8.1 Commentaires opérationnels

- Dans chaque fil basé sur `CooComment`, répondre à un commentaire et vérifier la persistance après rechargement.
- Cliquer sur l'aperçu de réponse et vérifier le retour vers le commentaire source, y compris quand il faut charger des commentaires précédents.
- Vérifier le CRUD dans `...`: auteur autorisé sur son commentaire, `ADMIN` autorisé, autre utilisateur refusé côté API.
- Vérifier qu'une suppression masque le contenu sans supprimer les réponses associées.
- Dans les annonces et publications publiques, cliquer sur l'aperçu d'une réponse et vérifier le centrage et la mise en évidence du commentaire source.

## 8.2 Menus d'actions

- Ouvrir les menus `...` dans une carte, un fil scrollable, une modale et près du bas de l'écran.
- Vérifier que le menu reste au premier plan, n'est pas coupé par `overflow-hidden` et se ferme au scroll, au redimensionnement, au clic extérieur et avec `Escape`.

## 9. Mes collaborateurs, groupes et messages

- Liste de groupes limitee aux groupes actifs ou l'utilisateur est membre, dans le scope de session autorise.
- Invitations visibles uniquement pour le destinataire ou email correspondant.
- Messages: lecture/ecriture reservee aux membres actifs.
- Mentions: notification uniquement des utilisateurs autorises a voir le groupe.
- Partage chatbot: snapshot persistant limite aux membres du groupe, sans exposer la conversation privee originale.
- Menus `...` et details de groupe restent utilisables sur mobile.

## 10. Appels audio/video

- Demarrage appel: session, origine, rate limit et membership verifies.
- Rejoindre appel: token genere cote serveur uniquement apres verification membership.
- Quitter: seul le participant courant passe a `LEFT`, l'appel continue.
- Terminer: reserve au lanceur ou gestionnaire autorise, `endedAt` et `durationSeconds` persistés.
- Notifications flottantes: visibles seulement aux membres du groupe, avec actions Rejoindre, Voir le groupe, Ignorer.
- Polling global: intervalle leger documente, pas de boucle agressive.
- UI: aucun libelle technique `LiveKit`, `room`, `token`, `provider` ou erreur brute visible.
- Micro/camera: boutons pilotent les pistes reelles et synchronisent `microphoneEnabled` / `cameraEnabled`.
- Mobile: controles accessibles, plein ecran utilisable, chat d'appel scrollable.

## 11. Notifications

- Les preferences utilisateur sont respectees: Support, usage, diffusions, push, sons d'appel, alertes flottantes.
- Les notifications PWA utilisent service worker quand disponible et ne cassent pas le rendu.
- Les filtres de notifications utilisent `type`, `targetUrl` ou une regle ciblee.
- Les notifications ne melangent pas les contextes organisationnels.

## 12. Calendrier interne

- Page et API proteges par session et `canAccessInternalCalendar`.
- Evenements filtres par organisation active.
- Disponibilites filtrees par collaborateur autorise et organisation.
- Un utilisateur `CLIENT` ne voit pas le calendrier interne si les regles de role l'interdisent.
- Support DTSC voit les disponibilites des collaborateurs du tenant DTSC selon les regles prevues.
- Formulaires de disponibilite et evenement restent responsive mobile.

## 13. UX mobile

- Dashboard: cartes sans depassement horizontal.
- Support: formulaire et ticket board lisibles, cartes bornees.
- Enterprise Admin: tableaux scrollables, dialogues hauts, actions dans menus.
- Enterprise Activities: panels en liste/detail, formulaire plein ecran.
- Collaborateurs: liste de groupes accessible, conversation plein ecran, composer visible.
- Appels: controles tactiles, plein ecran portrait/paysage, chat d'appel borne.
- Calendrier: listes et formulaires sans debordement.

## 14. Sortie de validation

Documenter dans le ticket ou la PR:

- commandes executees et resultats;
- comptes de test utilises;
- domaines/sous-domaines testes;
- captures mobiles si une regression visuelle etait suspectee;
- migrations appliquees ou confirmation d'absence de migration;
- risques restants et limites du polling temporaire.
# Itération PHARMACY Produits & médicaments - 9 juin 2026

- [ ] Vérifier que le catalogue Produits & médicaments liste uniquement les produits de l'organisation PHARMACY active.
- [ ] Vérifier recherche, filtres catégorie/forme/statut/règle, tri et pagination sur desktop et mobile.
- [ ] Créer puis modifier un produit avec les sections identification, classification, dispensation, stock, conservation, prix et statut.
- [ ] Vérifier le refus d'un code interne ou code-barres déjà utilisé dans la même organisation.
- [ ] Vérifier les contrôles stock minimal/maximal, températures, prix et taux de remise.
- [ ] Archiver puis réactiver un produit et vérifier qu'aucune suppression physique n'a lieu.
- [ ] Vérifier qu'un produit du catalogue est sélectionnable dans lots, ventes, réceptions et Activités Pharmacie.
- [ ] Vérifier qu'un membre non autorisé ne peut pas créer, modifier ou archiver un produit via l'API.
- [ ] Exécuter `pnpm qa:regression` ou `node scripts/qa-regression-checks.mjs`.

# Itération PHARMACY Sorties, ventes & dispensation - 10 juin 2026

- [ ] Vérifier que les ventes listées appartiennent uniquement à l'organisation PHARMACY active.
- [ ] Créer une vente multi-produit et vérifier que seuls les lots vendables sont proposés selon FEFO.
- [ ] Confirmer une vente simple et vérifier les mouvements `SALE` ainsi que la diminution du stock.
- [ ] Vérifier qu'une vente réglementée n'impacte pas le stock avant validation pharmacien.
- [ ] Annuler une vente et vérifier la restauration idempotente du stock avec `SALE_CANCELLATION`.
- [ ] Rembourser des lignes avec et sans remise en stock puis vérifier les quantités et la traçabilité.
- [ ] Vérifier le refus des références d'une autre organisation et d'un lot expiré, bloqué, rappelé ou insuffisant.
- [ ] Vérifier les onze vues, les libellés français, les infos-bulles et l'absence de dépassement horizontal sur mobile.
- [ ] Exécuter `pnpm qa:regression` ou `node scripts/qa-regression-checks.mjs`.

# Itération PHARMACY Ordonnances / prescriptions - 10 juin 2026

- [ ] Créer des ordonnances avec produit référencé et ligne libre, puis vérifier l'isolation par organisation.
- [ ] Vérifier l'unicité du numéro d'ordonnance dans une pharmacie et le refus des produits ou collaborateurs externes.
- [ ] Soumettre, valider, rejeter avec motif et demander une information complémentaire selon les permissions.
- [ ] Rapprocher une ligne, appliquer une substitution autorisée et vérifier la traçabilité du produit prescrit et servi.
- [ ] Générer une vente brouillon depuis une ordonnance validée et vérifier qu'aucun impact stock n'est appliqué.
- [ ] Vérifier le refus de génération depuis une ordonnance rejetée ou déjà liée à une vente active.
- [ ] Vérifier les onze vues, les documents persistés, l'audit, les libellés français, les infos-bulles et le plein écran mobile.
- [ ] Exécuter `pnpm qa:regression` ou `node scripts/qa-regression-checks.mjs`.

# Itération PHARMACY Fournisseurs & commandes - 10 juin 2026

- [ ] Créer un fournisseur et vérifier l'unicité du code ainsi que l'isolation par organisation.
- [ ] Associer plusieurs produits à un fournisseur et refuser produit ou fournisseur d'un autre tenant.
- [ ] Créer, soumettre et valider une demande de réapprovisionnement, puis la convertir en commande.
- [ ] Créer une commande multi-lignes, vérifier les totaux serveur, puis soumettre, valider et marquer commandée.
- [ ] Créer une réception brouillon depuis une commande et vérifier qu'aucun impact stock n'est appliqué.
- [ ] Valider une réception partielle puis complète et vérifier les quantités reçues/restantes et statuts de commande.
- [ ] Annuler une réception validée et vérifier la contre-passation du stock et des quantités de commande.
- [ ] Vérifier les alertes de retard réelles, documents persistés, onze vues, infos-bulles et formulaires mobiles.
- [ ] Exécuter `pnpm qa:regression` ou `node scripts/qa-regression-checks.mjs`.
# Itération PHARMACY 8 - Caisse, factures et paiements

- [x] Les sessions, paiements, factures, reçus, remboursements et écarts utilisent des modèles dédiés isolés par `organizationId`.
- [x] Un caissier ne peut pas ouvrir deux sessions simultanées et un paiement comptoir exige une session ouverte.
- [x] Un paiement validé recalcule le payé, le reste et le statut de la vente.
- [x] La clôture recalcule les montants réels, crée l'écart et exige une justification significative.
- [x] Le caissier ne peut pas valider sa propre clôture.
- [x] Le remboursement ne dépasse pas le montant payé.
- [x] Les routes mutantes appliquent origine, rate limit, Zod, RBAC et audit.
- [x] Les treize vues caisse et formulaires plein écran restent mobiles, bornés et sans placeholder.

# Itération PHARMACY 9 - Retours, ajustements et pertes

- [ ] Vérifier que les déclarations, documents, alertes et mouvements listés appartiennent uniquement à l'organisation PHARMACY active.
- [ ] Créer et soumettre un retour client lié à une vente réelle; refuser une quantité supérieure à la quantité vendue restante.
- [ ] Valider un retour, un ajustement positif et une perte; vérifier les mouvements stock et l'idempotence d'une seconde validation.
- [ ] Annuler un événement validé et vérifier le mouvement inverse `RETURN_LOSS_REVERSAL` sans stock négatif.
- [ ] Vérifier le refus des produits, lots, remboursements, fournisseurs, commandes, réceptions, inventaires, emplacements et collaborateurs d'une autre organisation.
- [ ] Vérifier les retraits expirés, rappels, destructions, alertes critiques et leur résolution.
- [ ] Vérifier les douze vues, les libellés français, les infos-bulles et l'absence de dépassement horizontal sur mobile.
- [ ] Exécuter `pnpm qa:regression` ou `node scripts/qa-regression-checks.mjs`.

# Itération PHARMACY 10 - Alertes stock, péremption et rappel

- [ ] Lancer la détection et vérifier l'isolation stricte par `organizationId`.
- [ ] Vérifier rupture, stock faible, surstock, produit sans prix et sans lot.
- [ ] Vérifier péremption proche, lot expiré avec stock, rappel, quarantaine et blocage.
- [ ] Vérifier commande en retard, demande de réapprovisionnement et écart réception ouvert.
- [ ] Vérifier validation pharmacien, anomalie vente, écart inventaire et ajustement en attente.
- [ ] Vérifier perte critique, destruction en attente, caisse ouverte trop longtemps et écart caisse critique.
- [ ] Relancer la détection et vérifier la déduplication, `detectedCount` et `lastDetectedAt`.
- [ ] Assigner, prendre en charge, commenter, résoudre, ignorer et annuler une alerte; vérifier l'historique.
- [ ] Vérifier les quatorze vues, les règles persistées et le rendu mobile sans dépassement horizontal.
- [ ] Exécuter `pnpm qa:regression`, `pnpm type-check`, `pnpm build` et les contrôles Git.

# Itération PHARMACY 14 - Paramètres pharmacie

- [ ] Vérifier que les dix-sept sections chargent et enregistrent uniquement les paramètres de l'organisation active.
- [ ] Modifier un paramètre normal puis un paramètre critique; vérifier que le second exige un motif et crée un historique audité.
- [ ] Prévisualiser puis modifier une séquence; vérifier que les numéros générés restent uniques et progressifs dans l'organisation.
- [ ] Vérifier que ventes, réceptions, lots, caisse, documents, qualité, alertes et exports appliquent leurs paramètres côté serveur.
- [ ] Réinitialiser une section avec motif et vérifier que les valeurs par défaut sont restaurées sans supprimer l'historique.
- [ ] Vérifier les libellés métier français, infos-bulles, combobox référentielles et l'absence de dépassement horizontal mobile.
- [ ] Vérifier qu'un membre non autorisé ne peut ni modifier les paramètres ni consulter l'historique critique.
- [ ] Exécuter `pnpm qa:regression`, `pnpm type-check`, `pnpm lint`, `pnpm build` et les contrôles Git.

# Itération PHARMACY 15 - Activités pharmacie

- [ ] Vérifier que le tableau de bord, les tâches, validations, alertes, ventes, caisses, documents, workflows et historiques sont limités à l'organisation et à l'utilisateur autorisé.
- [ ] Créer une demande de réapprovisionnement, un signalement de rupture/péremption, une soumission d'inventaire et une demande d'ajustement; vérifier les objets métier liés et l'absence d'impact stock non validé.
- [ ] Soumettre un rapport caisse depuis la session ouverte du caissier; vérifier le recalcul serveur et l'attente de validation.
- [ ] Signaler une anomalie de vente et un incident qualité, puis demander et répondre à un avis pharmacien.
- [ ] Commenter une activité et lui associer un document autorisé; refuser un document confidentiel ou d'une autre organisation.
- [ ] Vérifier les permissions de validation/assignation, le masquage financier et sensible, les notifications, AuditLog et ApiLog.
- [ ] Vérifier les dix-sept vues, libellés français, infos-bulles, menus `...`, combobox relationnelles et l'absence de dépassement horizontal mobile.
- [ ] Exécuter `pnpm qa:regression`, `pnpm type-check`, `pnpm lint`, `pnpm build` et les contrôles Git.
