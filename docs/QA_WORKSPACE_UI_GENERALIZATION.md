# QA — Généralisation Workspace UI/UX

## Portée

Valider la généralisation du design Sprint 2 vers les candidats suivants, dans cet ordre : COO, CEO, HR & CFO, MPO, CTO, SCO, Legal, Finance, Administration Entreprise, Health, Pharmacy.

## Gates automatisés

Exécuter :

- `pnpm qa:regression`
- `pnpm qa:workspace:generalization`
- `pnpm type-check`
- `pnpm build`

et les autres gates imposés par `AGENTS.md` lorsque l'environnement les permet.

Le script `qa-workspace-generalization-checks.mjs` vérifie les invariants de composition, les gardes serveur, la conservation des endpoints réels et les durcissements du Sprint 1.

## Matrice responsive

À vérifier sur :

- 320 px
- 375 px
- 390 px
- 414 px
- 768 px
- 1024 px
- 1440 px

Pour chaque largeur :

- aucun débordement horizontal de page ;
- rails KPI/navigation limités à leur zone ;
- actions tactiles utilisables ;
- menus contextuels entièrement visibles ;
- dialogues utilisables avec clavier ;
- listes et formulaires sans largeur fixe bloquante ;
- contenu non masqué par navigation ou safe areas.

## Parcours DTSC internes

### COO

- ouvrir Administration → COO ;
- vérifier header, KPIs, filtre période, playbook et volumes ;
- rechercher dans plusieurs registres ;
- créer/modifier/supprimer seulement lorsque le compte y est autorisé ;
- vérifier téléchargement/aperçu des documents existants.

### CEO

- ouvrir la synthèse consolidée ;
- filtrer une période puis réinitialiser ;
- vérifier les groupes de métriques ;
- ouvrir le panneau de supervision ;
- confirmer qu'aucune permission supplémentaire n'apparaît.

### HR & CFO

- vérifier KPIs financiers/RH et montants ;
- rechercher les registres ;
- vérifier les CRUD existants ;
- confirmer que les données financières conservent les mêmes calculs.

### MPO / CTO / SCO

Pour chacun :

- vérifier l'identité métier du module ;
- filtres ;
- registres ;
- actions réelles ;
- état vide et aucun résultat ;
- permissions serveur inchangées.

### Legal Advisor

- vérifier la synthèse juridique ;
- vérifier les graphiques compacts ;
- vérifier les dossiers/opérations du panneau partagé ;
- vérifier les actions juridiques existantes sans action fictive ajoutée.

## Finance Entreprise

- ouvrir `FINANCE_BUDGETS` depuis une organisation autorisée ;
- vérifier budgets/dépenses sous forme de lignes ;
- créer un objet si le rôle l'autorise ;
- ouvrir détail ;
- commentaire ;
- démarrage ;
- demande de validation ;
- approbation/rejet uniquement avec rôle de gestion ;
- clôture ;
- vérifier l'isolation organisationnelle.

## Administration Entreprise

- contexte, abonnement et KPIs ;
- modules ;
- calendrier ;
- collaborateurs/postes ;
- départements ;
- workflows ;
- branding ;
- demandes récentes ;
- vérifier que les accordéons restants correspondent à de vrais groupes de configuration.

## Health

La validation porte d'abord sur le shell généralisé :

- conteneur décoratif racine supprimé ;
- navigation sous-modules compacte ;
- aucun débordement horizontal de page ;
- accès aux sous-modules spécialisés inchangé ;
- patients, rendez-vous, consultations, dossiers, équipe, laboratoire, pharmacie interne, facturation, assurances, qualité et documents continuent à ouvrir leurs workspaces réels ;
- aucune permission clinique élargie.

Les sous-modules spécialisés ne sont pas tous refondus intérieurement dans cette phase.

## Pharmacy

- navigation des sous-modules ;
- dashboard compact ;
- Produits ;
- Lots ;
- Stock ;
- Réceptions ;
- Ventes ;
- Prescriptions ;
- Fournisseurs/commandes ;
- Caisse ;
- Ajustements/pertes ;
- Alertes ;
- Qualité ;
- Documents ;
- Rapports ;
- Paramètres ;
- vérifier les transitions et permissions métier existantes.

## Rôles et comptes

Ne déclarer un rôle « testé » que si un compte réel correspondant a été utilisé.

DTSC interne : CEO, COO, CTO, HR_CFO, MPO, SCO, LA.

Entreprise : OWNER, ADMIN_ENTREPRISE/ADMIN_ENTERPRISE, MANAGER, MEMBER, GUEST selon disponibilité des comptes et règles du module.

## Sprint 1 — non-régression obligatoire

Vérifier :

- clavier iOS ;
- focus ;
- select/dropdown ;
- dialogs ;
- ActionMenu ;
- scroll interne ;
- viewport ;
- safe areas ;
- PWA ;
- absence de scroll horizontal de page.

Ne pas déclarer Safari/iPhone validé sans appareil ou navigateur réel correspondant.
