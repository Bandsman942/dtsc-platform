# Guide utilisateur — Couture, confection & habillement

**Contrat de guide DTSC v2**

## Objectif et périmètre

Le sous-secteur **Couture, confection & habillement** complète le secteur `MANUFACTURING` sans dupliquer les données communes de DTSC ERP. Les clients, articles, sites, dépôts, stocks, employés, ventes, achats et données financières restent gérés dans leurs modules ERP canoniques. Les modules Couture ajoutent uniquement les données métier propres à l’atelier : mensurations, styles/patrons, gradation, profils matières, coupe, essayages, retouches, suivi des vêtements et finition.

La mise en service se fait depuis **Vue d’ensemble atelier** avec une checklist en huit étapes recalculée depuis les données réelles de l’entreprise : identité ; sites et dépôts ; équipe ; catalogue ; stock initial ; finance ; production ; configuration Couture. L’assistant ne crée pas silencieusement les référentiels communs : chaque étape incomplète renvoie vers le module qui possède la donnée.

### Modes Couture

- **SUR_MESURE** (`MADE_TO_MEASURE`) : parcours individualisé avec mensurations client et essayages.
- **PRET_A_PORTER** (`READY_TO_WEAR`) : production par tailles, gradation et lots.
- **MIXTE** (`MIXED`) : les deux parcours coexistent dans le même atelier.

Le mode est un paramètre métier du sous-secteur, pas un nouveau secteur DTSC.

### Parcours opérationnel recommandé

Dans **Catalogue**, créez le vêtement fini et les matières. Dans **Nomenclatures**, décrivez les composants. Dans **Gammes de production**, définissez les opérations et centres de travail. Dans **Styles et patrons**, rattachez le produit Couture à sa nomenclature et, si nécessaire, à sa gamme.

Pour le sur-mesure, créez ou sélectionnez le client dans **CRM / Clients**, puis enregistrez un profil de mensurations actif. Les anciennes mensurations sont historisées au lieu d’être écrasées.

Créez ensuite l’ordre dans **Ordres de production**. Les besoins matières sont dérivés de la nomenclature et utilisent le stock canonique. Soumettez puis faites approuver l’ordre selon les permissions disponibles. Créez un plan de coupe lié à l’ordre et à la matière concernée. Après coupe terminée, créez les lots de vêtements et faites-les progresser dans l’atelier. Les pertes physiques doivent être enregistrées par les flux Manufacturing/Stock prévus ; la coupe ne modifie jamais directement un solde de stock.

Pour le sur-mesure, planifiez un essayage. Un résultat `ADJUSTMENTS_REQUIRED` permet de créer une retouche. La finition `READY` exige toutes les cases de finition ainsi qu’un contrôle qualité Manufacturing conforme. Le lot passe alors à `READY_FOR_DELIVERY`. Les ventes, encaissements et écritures comptables restent pris en charge par les modules commerciaux et financiers communs.

## Accès et permissions

L’accès dépend de l’entreprise active, de l’abonnement, de l’activation des modules et du rôle/poste de l’utilisateur. La mise en service Couture est réservée aux administrateurs autorisés du tenant car elle agrège des informations de configuration provenant de RH, Stock, Finance et Production.

L’assistant IA entreprise peut lire les modules Manufacturing/Couture uniquement si l’utilisateur possède lui-même les accès nécessaires. Les actions opérationnelles passent par le **Tool Gateway** DTSC et exigent une confirmation explicite avant mutation. Elles peuvent inclure la soumission d’un ordre de production, la clôture d’un essayage, la progression d’une retouche et la mise à jour de la finition. L’IA ne peut pas contourner le module access resolver, le plan d’abonnement, le contexte organisationnel actif ou les confirmations structurelles.

## Statuts, validations et traçabilité

Les ordres de production, essayages, retouches, lots et finitions suivent leurs transitions métier autorisées. Les révisions optimistes empêchent d’écraser silencieusement une modification concurrente. Les mutations opérationnelles importantes produisent les traces d’audit prévues par le domaine.

La readiness commerciale distingue trois niveaux. `BETA` signifie que la capacité est encore en validation. `READY` signifie que le contrat produit, les modules, les contrôles et la QA automatisée existent mais que la preuve finale de commercialisation n’est pas encore complète. `COMMERCIAL_READY` ne peut être déclaré qu’après CI probante et validation E2E owner du parcours création DTSC → invitation → onboarding → commande → production → livraison → finance.

## Sécurité et confidentialité

Toutes les références sont limitées à l’entreprise active. Les clients, articles, stocks, employés et données financières ne sont jamais recopiés dans une seconde source Couture. L’Administration DTSC configure le secteur, le sous-secteur, le template et l’abonnement, mais ne lit pas les données métier privées du tenant. Les actions IA mutantes demandent une confirmation structurelle, sont idempotentes et sont auditées avec un niveau sensible.

Les informations de stock restent autoritaires dans Inventory ; les mouvements de production utilisent les contrats Manufacturing/Inventory. Les données comptables restent autoritaires dans Finance. Les données RH restent autoritaires dans Ressources humaines. Les liens inter-modules sont contrôlés côté serveur et doivent rester dans le même tenant.

## Dépannage

- **Une étape reste incomplète** : ouvrez son lien et complétez la donnée dans le module canonique indiqué.
- **Un article n’apparaît pas en matière** : vérifiez qu’il est actif, suivi en stock et appartient à la même entreprise.
- **Le stock initial n’est pas reconnu** : vérifiez l’existence d’un article Inventory actif et d’un solde positif dans le dépôt sélectionné.
- **La Finance reste incomplète** : contrôlez devise fonctionnelle, exercice/période, plan comptable, mappings et journaux requis.
- **Un essayage sur mesure refuse la clôture** : vérifiez les mensurations actives et le statut de l’essayage.
- **Une finition refuse READY** : complétez la checklist et liez un contrôle qualité Manufacturing `PASS`.
- **L’IA ne propose pas une action** : vérifiez l’abonnement, l’accès à l’Assistant IA, le module concerné et les permissions de l’utilisateur.
