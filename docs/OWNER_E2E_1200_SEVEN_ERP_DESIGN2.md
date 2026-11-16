# OWNER E2E — Issue #1200 · 7 modules ERP communs Design DTSC 2.0

**Statut : NON EXÉCUTÉE / NOT_EXECUTED.** Candidat de recette seulement ; aucune autorisation de fusion, de déploiement Vercel ou de publication n'est donnée avant la validation explicite « E2E final #PR BON ».

## Périmètre
Achats et ressources : `SUPPLIERS_PURCHASES`, `SITES_WAREHOUSES`, `DOCUMENTS`, `INVENTORY_LOGISTICS`.
Projets et actifs : `PROJECTS_SERVICES`, `TIME_DELIVERABLES`, `ASSETS_MAINTENANCE`.
Utiliser une entreprise RETAIL multi-boutiques et une entreprise de services (organisations A et B différentes), une fiche fournisseur, un compte collaborateur acheteur, un validateur, une personne chargée du stock, un responsable projet et un profil lecture seule. Ne jamais manipuler des écritures réelles en production.

## Recette commune à exécuter sur chaque module
1. Naviguer depuis l'espace entreprise vers le module autorisé ; retour discret et aucun écran vide. Vérifier l'entête compact, indicateurs à couleurs sémantiques, liste directement visible, formulaires distincts et menus contextuels.
2. Tester **320, 360, 375, 390, 414, 768, 1024 px** et desktop 1440 px ; Samsung Internet / Chrome Android + navigateur desktop ; portrait / paysage, clair / sombre, français / anglais. Les rails de statut doivent défiler horizontalement sans débordement de page, avec focus clavier visible.
3. Tester recherche par terme pertinent, sélection de statut, dates « aujourd'hui / semaine / mois / date exacte / intervalle », pagination > 1 et retour à la page 1 au changement de filtre. Vérifier l'inclusion du dernier jour et les intervalles invalides.
4. Exporter **CSV, Excel et PDF professionnels** avec plus d'une page de résultats. Compter les lignes sur le serveur et dans les fichiers, vérifier les colonnes métier, le nom de l'entreprise, le filtre sélectionné et le plafond explicite de 1000 lignes. Aucun export « page affichée seulement ».
5. Vérifier les messages erreur/chargement/succès, les écrans vides, le mode lecture seule, 403/404 sans fuite de données, absence de contrôle visuel désactivé mais cliquable et noms longs.
6. Ouvrir la même URL/API depuis une deuxième organisation, et depuis un collaborateur sans l'entitlement ou sans permission : **aucune donnée interentreprise ni inter-boutique** ne doit apparaître dans la liste, le détail, le compteur ou l'export.

## Parcours détaillés
### A. Fournisseurs et achats
- Onglet Fournisseurs : tiers canonique existant ou nouveau, contact représentatif, statut actif/suspendu, confidentialité du lien d'identité, recherche pays/statut/date.
- Onglet Commandes et réceptions : brouillon, validation par acteur indépendant, commande, réception partielle puis complète, clôture et annulation. Vérifier montants HT, TVA, total, devise, fournisseur, quantité et correspondance avec le stock, le budget et le circuit de facture fournisseur. Aucun paiement ni posting automatique.
- **Aperçu A4 de chaque statut** : depuis « … » puis « Imprimer la copie commerciale », et depuis le détail. Examiner brouillon, attente d'approbation, approuvé, commandé, partiellement reçu, reçu, clôturé, annulé, rejeté. Brouillon et document rejeté/annulé comportent un avertissement non exécutable. Contrôler référence, entreprise, fournisseur, lignes, taxes, total, quantités reçues, révision et mise en page papier/PDF. Le PDF n'est jamais une facture fiscale.
- Tenter l'URL d'impression en tant qu'autre utilisateur et autre organisation : attendre 403/404.

### B. Sites et entrepôts
- Site → entrepôt → emplacement ; parcourir l'arbre et les quatre sections. Tester codes distincts, statut, capacité, fuseau horaire et édition conditionnelle.
- Répéter les exports sur chaque onglet ; vérifier le périmètre autorisé d'un responsable boutique.

### C. Documents
- Ajouter un document, publier une nouvelle version, modifier métadonnées, rattacher à un fournisseur, achat, projet et actif et contrôler expirations.
- La liste, les exports de **métadonnées seulement** et le téléchargement signé appliquent exactement la visibilité ORGANIZATION, DEPARTMENT, RESTRICTED ; un lecteur sans droit DOWNLOAD ne peut télécharger une version privée. Aucune URL signée, blob ni contenu du fichier dans CSV/XLSX/PDF.
- Vérifier recherche, type, visibilité, statut, plage de création et archivage.

### D. Stocks et logistique
- Vérifier article physique/quantité réservée/disponible, inventaire, ajustement, transfert entre entrepôts, lot et péremption, validation, réception.
- Un transfert ne crédite le stock destinataire qu'à la réception effective. Un ajustement ou inventaire refusé ne modifie pas les balances.
- Répéter liste/export/recherche dates/statuts ; stocks au niveau de l'entrepôt et accès d'une boutique. L'indicateur « stock faible » existant provient de la page renvoyée par l'API ; ne pas l'interpréter comme une consolidation intégrale tant que l'agrégation globale dédiée n'est pas certifiée.

### E. Projets et services
- Créer un projet avec client/contrat, site, chef de projet, budget indicatif, membres. Tester jalons, risques, incidents, progression, statut et clôture.
- Vérifier qu'un projet ou budget d'une autre organisation n'apparaît pas et que l'export affiche le progrès, l'échéance et la devise source.

### F. Temps et livrables
- Rattacher un livrable au projet, à un jalon/document, le soumettre puis le faire accepter/rejeter/demander des corrections par un autre acteur.
- Enregistrer des temps non approuvés puis approuvés ; seuls ces derniers contribuent aux minutes déclarées et facturables. Aucune facture/paie générée par l'export.
- Vérifier les statuts, recherche, période, export et impossibilité d'auto-validation.

### G. Actifs et maintenance
- Enregistrer un actif avec catégorie/site/fournisseur/achat si autorisé ; affecter puis restituer ; créer une maintenance et un incident ; changer les statuts.
- Confirmer que l'état source est synchronisé depuis ses affectations/incidents/maintenance ; exporter sous l'angle site, état, devise et valeur **indicative** (non amortissement comptable).

## Critères finaux et livraison
- Qualité GitHub, TypeScript, build, tests métiers, migration (aucun nouveau schéma), régression Finance/RETAIL, QA `qa:erp-seven-design2-1200` : **CI_PROVEN** requis.
- Visuel E2E propriétaire sur 7 modules : **OWNER_E2E** requis. Aucun test déclaré exécuté ici.
- Ne fusionner que lorsque le propriétaire confirme explicitement « E2E final #PR BON », puis Vercel Production exclusivement depuis `main`.
