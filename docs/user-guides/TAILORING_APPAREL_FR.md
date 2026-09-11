# DTSC Platform — Guide utilisateur Couture, confection & habillement

## 1. Objectif

Le sous-secteur **Couture, confection & habillement** complète le secteur `MANUFACTURING` sans dupliquer les données communes de DTSC ERP. Les clients, articles, sites, dépôts, stocks, employés, ventes, achats et données financières restent gérés dans leurs modules ERP canoniques. Les modules Couture ajoutent uniquement les données métier propres à l’atelier : mensurations, styles/patrons, gradation, profils matières, coupe, essayages, retouches, suivi des vêtements et finition.

## 2. Mise en service en 8 étapes

Ouvrez **Vue d’ensemble atelier** puis la section **Mise en service Couture**. La progression est recalculée depuis les données réelles de l’entreprise et reste reconfigurable.

1. **Identité** — renseignez le pays et le fuseau horaire de l’entreprise.
2. **Sites et dépôts** — créez au moins un site et un dépôt dans le référentiel commun.
3. **Équipe** — assurez-vous qu’un membre actif possède un dossier employé actif.
4. **Catalogue** — créez les produits finis et matières nécessaires ; activez le suivi de stock sur les articles physiques.
5. **Stock initial** — rattachez les articles suivis au stock et enregistrez les quantités initiales par les flux Stock & logistique.
6. **Finance** — terminez la configuration de la devise, du plan comptable, des exercices/périodes, mappings et journaux requis.
7. **Production** — configurez les dépôts par défaut Manufacturing, un centre de travail, une nomenclature active et une gamme active.
8. **Configuration Couture** — choisissez le mode de fonctionnement et l’unité de mensuration.

L’assistant d’onboarding ne crée pas silencieusement les données ERP communes. Chaque étape incomplète renvoie vers le module qui en est propriétaire.

## 3. Modes Couture

- **SUR_MESURE** (`MADE_TO_MEASURE`) : parcours individualisé avec mensurations client et essayages.
- **PRET_A_PORTER** (`READY_TO_WEAR`) : production par tailles, gradation et lots.
- **MIXTE** (`MIXED`) : les deux parcours coexistent dans le même atelier.

Le mode est un paramètre métier du sous-secteur, pas un nouveau secteur DTSC.

## 4. Parcours opérationnel recommandé

### Préparer le produit

Dans **Catalogue**, créez le vêtement fini et les matières. Dans **Nomenclatures**, décrivez les composants. Dans **Gammes de production**, définissez les opérations et centres de travail. Dans **Styles et patrons**, rattachez le produit Couture à sa nomenclature et, si nécessaire, à sa gamme.

### Préparer un travail sur mesure

Créez ou sélectionnez le client dans **CRM / Clients**. Enregistrez ensuite un profil de mensurations actif. Les anciennes mensurations sont historisées au lieu d’être écrasées.

### Lancer la production

Créez l’ordre dans **Ordres de production**. Les besoins matières sont dérivés de la nomenclature et utilisent le stock canonique. Soumettez puis faites approuver l’ordre selon les permissions disponibles.

### Coupe et suivi atelier

Créez un **plan de coupe** lié à l’ordre et à la matière concernée. Après coupe terminée, créez les lots de vêtements et faites-les progresser dans l’atelier. Les pertes physiques doivent être enregistrées par les flux Manufacturing/Stock prévus ; la coupe ne modifie jamais directement un solde de stock.

### Essayage et retouches

Pour le sur-mesure, planifiez un essayage. Un résultat `ADJUSTMENTS_REQUIRED` permet de créer une retouche. Les transitions de retouche sont contrôlées et révisées de façon optimiste.

### Finition et livraison

La finition `READY` exige toutes les cases de finition ainsi qu’un contrôle qualité Manufacturing conforme. Le lot passe alors à `READY_FOR_DELIVERY`. Les ventes, encaissements et écritures comptables restent pris en charge par les modules commerciaux et financiers communs.

## 5. Assistant IA entreprise

L’assistant peut lire les modules Manufacturing/Couture uniquement si l’utilisateur possède lui-même les accès nécessaires. Les actions disponibles passent par le Tool Gateway DTSC et exigent une confirmation explicite avant mutation. Les actions contrôlées incluent notamment la soumission d’un ordre de production, la clôture d’un essayage, la progression d’une retouche et la mise à jour de la finition.

L’IA ne peut pas contourner le module access resolver, le plan d’abonnement, le contexte de l’entreprise active ou les confirmations structurelles.

## 6. Contrôles et sécurité

- Toutes les références sont limitées à l’entreprise active.
- Les données communes ne sont jamais recopiées dans une seconde source Couture.
- Les mutations sensibles sont auditées.
- Les révisions empêchent d’écraser silencieusement une modification concurrente.
- L’Administration DTSC configure le secteur, le sous-secteur et l’abonnement mais n’accède pas aux données métier privées du tenant.

## 7. Readiness commerciale

`BETA` signifie que la capacité est encore en validation. `READY` signifie que le contrat produit, les modules, les contrôles et la QA automatisée existent mais que la preuve finale de commercialisation n’est pas encore complète. `COMMERCIAL_READY` ne peut être déclaré qu’après CI probante et validation E2E owner du parcours : création DTSC → invitation → onboarding → commande → production → livraison → finance.

## 8. Dépannage

- **Une étape reste incomplète** : ouvrez son lien et complétez la donnée dans le module canonique indiqué.
- **Un article n’apparaît pas en matière** : vérifiez qu’il est actif, suivi en stock et appartient à la même entreprise.
- **Un essayage sur mesure refuse la clôture** : vérifiez les mensurations actives et le statut de l’essayage.
- **Une finition refuse READY** : complétez la checklist et liez un contrôle qualité Manufacturing `PASS`.
- **L’IA ne propose pas une action** : vérifiez l’abonnement, l’accès à l’Assistant IA, le module concerné et les permissions de l’utilisateur.
