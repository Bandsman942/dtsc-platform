# Hotfix #1064 — RETAIL_CORE indépendant de SHOP, packs administrés par DTSC

**Date : 8 novembre 2026. Version candidate : v1.6.2.** État : PR, CI et E2E propriétaire requis avant fusion. **Source :** le code et le registre canonique de `Bandsman942/dtsc-platform` (main SHA `0431bbe`).

## 1. Classification, modèles et valeur commerciale

```text
COMMERCE_RETAIL (secteur parent)
├─ RETAIL_CORE : CRM, catalogue, achats, stock, POS, caisse, Finance et clôture
├─ SHOP (sous-secteur historique actif, optionnel)
├─ packs RETAIL indépendants du sous-secteur (selon abonnement)
│  ├─ TELCO_TOPUPS : forfaits, crédit opérateur, marge, références, rapprochement
│  └─ MOBILE_MONEY_AGENCY : dépôt/retrait, frais, cash/float, rapprochement
└─ propositions PLANNED : 9 spécialisations, SANS workspace/API vendus comme actifs
```

- `RETAIL_POS` et `RETAIL_DAILY_CLOSE` sont communs au secteur et ne sont plus conditionnés par SHOP dans l'adaptateur de sous-secteurs. Le sous-secteur peut rester NULL (= commerce général).
- Les entreprises historiques SHOP restent classifiées SHOP jusqu'à un changement explicite administré. Le profil historique RETAIL_TELCO_MOBILE_MONEY est conservé en lecture et pour les données existantes.
- Les modules `MOBILE_MONEY_AGENCY` et `TELCO_TOPUPS` restent des modules canoniques ACTIVE existants ; ils ne sont jamais créés artificiellement comme disponibles pour un abonnement inéligible.
- Les nouvelles entreprises RETAIL sans sous-secteur reçoivent automatiquement le modèle RETAIL_CORE (si secteur et template actif) et des intentions de packs OFF. Aucune migration de données ou de classification automatique.
- Le niveau BUSINESS reste le minimum déclaré par le registre pour les quatre modules Retail ; l'activation tient aussi compte du statut de l'abonnement, de la permission serveur, des dépendances et des règles Finance. Un prix d'add-on spécifique ne doit pas être inventé ; toute commercialisation de packs payants additionnels demandera une évolution du contrat de facturation distincte.

## 2. Source de vérité pour l'intention de pack

`EnterpriseRetailConfiguration.settingsJson.optionalRetailModules` (booleans optionnels par code canonique) contient la **décision d'activation**. La ligne `EnterpriseModule.isEnabled` est l'état matérialisé opérationnel, soumis aux abonnements et aux permissions ; elle n'accorde jamais un droit en l'absence de l'entitlement.

- Pour un **nouveau RETAIL générique** : explicitement OFF.
- Pour un **tenant ancien sans préférence explicite** : la ligne `EnterpriseModule.isEnabled` existante reste la référence de compatibilité. Aucun désabonnement ni effacement silencieux.
- Toute activation/désactivation manuelle passe par `activateEnterpriseModule` / `disableEnterpriseModule` et écrit l'intention dans la même transaction Prisma SERIALIZABLE que les changements de modules. Le système valide le plan et les dépendances.
- La réconciliation d'abonnement (`reconcileOrganizationModulesWithSubscription`) respecte explicitement le choix OFF. Un upgrade, downgrade ou renouvellement ne réactive pas un module volontairement désactivé ; les choix ON ne bypassent ni un abonnement expiré ni un niveau insuffisant.
- Réappliquer un modèle sectoriel SHOP ne doit pas écraser les opt-outs (la même préférence gouverne le `defaultEnabled` du template).
- Les fournisseurs opérateurs ne sont réactivés par la compatibilité du profil historique que tant qu'aucune décision explicite n'existe pour le pack. En présence d'un choix, leur activation reflète le vrai module tenant.
- Désactivation refusée si un module actif dépend encore du service, ou si des opérations fournisseur restent INITIATED/PENDING_PROVIDER/UNKNOWN. Les pièces comptables et historiques sont préservés.

## 3. Administration DTSC, Design System 2.0

Chemin : **Console / Administration DTSC → Entreprises clientes → menu de l'entreprise RETAIL → Modules spécialisés RETAIL**.

- GET : `/api/admin/client-organizations/:id/retail-extensions`, lecture `ORGANIZATIONS_READ`, réponse `private, no-store`.
- PATCH : même endpoint, `ORGANIZATIONS_MANAGE`, origine vérifiée, rate limit fermé, payload Zod strict (extension ou classification), cookie de step-up récent (mot de passe et MFA si présent), motif 8–500 caractères, AuditLog et ApiLog.
- Mode extension : cartes TELCO / Mobile Money avec état, plan minimum, disponibilité, action et historique. Les extensions non compatibles avec l'abonnement ne sont pas activables.
- Mode classification : transformer explicitement SHOP ↔ Commerce général. Modification dans une transaction SERIALIZABLE du registre générique `EnterpriseBusinessSubtypeSelection` et du miroir historique RETAIL, en conservant les packs activés/neutralisés, comptes, clients et transactions.
- Les neuf propositions sont en cartes `PLANNED` informatives et non cliquables. Pas de facturation ni de navigation vers un module inexistant.
- Responsive : 1 colonne petit écran, 2 colonnes desktop, cartes interactives, focus clavier, FR/EN, mode clair/sombre, erreurs contextualisées et modal de confirmation identitaire.

## 4. Catalogue prospectif — valeur ajoutée attendue

| Sous-secteur (PLANNED) | Capacités métier non encore livrées | Valeur |
|---|---|---|
| SUPERMARKET_GROCERY | PLU/pesée, rayons, DLC, approvisionnement | Moins de pertes et de ruptures |
| FASHION_ACCESSORIES | tailles/couleurs, collections, échanges | Traçabilité variantes et invendus |
| ELECTRONICS_PHONES | IMEI, numéros de série, garanties/SAV | SAV fiable, protection des appareils |
| BEAUTY_COSMETICS | lots, nuances, testeurs, coffrets | contrôle des références sensibles |
| HARDWARE_DIY | unités converties, devis de chantier, livraison | précision quantités et tarification |
| AUTO_PARTS | compatibilité véhicule, références équivalentes | réduction des mauvaises pièces |
| BOOKS_STATIONERY | ISBN, éditions, listes scolaires, kits | préparation des pics de rentrée |
| FURNITURE_APPLIANCES | acomptes, livraison, installation, garanties | suivi de commande jusqu'au service |
| FRESH_FOOD | traçabilité, DLC, pesée, démarque | baisse gaspillage et retours |

Ces modules requièrent chacun modèle/service métier réel, route, workspace, permission, entitlement, guides, QA et revue de commercialisation avant de passer à ACTIVE. Le socle CRM/Catalogue/Stock/Finance n'est jamais dupliqué. Pharmacie reste dans PHARMACY ; couture sur mesure dans MANUFACTURING.

## 5. Vérifications avant fusion / E2E

```bash
git diff --check
pnpm prisma generate
pnpm type-check
pnpm lint
node scripts/qa-hotfix-1064-retail-sector-packs.mjs
node scripts/qa-605-generic-sector-subtypes.mjs
node scripts/qa-hotfix-512-retail-subtypes-mobile-money-forms.mjs
pnpm qa:regression
pnpm build
```

**Parcours Owner E2E requis** (en environnement isolé autorisé, sans données réelles) :
1. DTSC crée entreprise A, COMMERCE_RETAIL, sous-secteur vide, abonnement BUSINESS et modèle automatique ; POS et clôture possibles, libellés neutres ; TELCO/MM désactivés et non navigables.
2. DTSC active TELCO après step-up, motif et validations ; s'assure que le bon collaborateur voit TELCO et un non-autorisé non ; Mobile Money reste OFF.
3. DTSC désactive TELCO ; vérifier impossible avec des opérations fournisseur en attente et vérifier que l'historique et les pièces comptables restent lisibles.
4. Renouveler ou modifier l'abonnement ; l'intention OFF reste OFF, l'abonnement inférieur refuse ON. Modifier le plan sur les deux parcours de console.
5. Entreprise B historique SHOP avec MM/TELCO : les modules et les fournisseurs restent actifs tant qu'aucune décision n'est prise ; changer classification en commerce général sans modifier l'historique ni l'accès aux packs déjà en cours.
6. Réappliquer modèle sectoriel SHOP à l'entreprise test après un opt-out ; aucun réarmement silencieux.
7. Rejouer en FR/EN, clair/sombre, 320/390/768/1440 px, lecteur d'écran, clavier, réseau lent, E2E multi-tenant, autorisations administrateur vs client.

**Rollback :** revert PR ; aucune migration ; aucune suppression physique de données. Les préférences enregistrées dans JSON restent inoffensives si l'ancien code les ignore. Ne pas fusionner sans Quality Gates au vert et validation E2E finale explicite par le propriétaire. Production exclusivement depuis main ; aucune Preview.
