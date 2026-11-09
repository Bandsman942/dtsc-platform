# Hotfix #1080 — RETAIL POS multi-boutiques, poste officiel et facturation séparée

**Candidat :** v1.6.6 (PATCH) — 09/11/2026. **État :** branche candidate, non fusionnée, non déployée. Référence : Issue #1080.

## Constat et contrat métier

1. **Boutiques et droits.** Un collaborateur non administrateur ne doit pas voir les écrans de gouvernance du réseau (« Configurer mes boutiques », « Pilotage des boutiques », « Accès des collaborateurs », configuration des paiements, équipements, activation, inventaire global, etc.). Les cartes de tâches sont filtrées par habilitation ; la page détail et l'API restent soumises à une vérification serveur. Un lien `?siteId=...` forgé ne peut pas ouvrir une autre boutique. Les affectations révoquées bloquent la boutique même si l'option d'isolation générale du tenant n'a pas encore été activée.
2. **Un seul poste officiel.** `OrganizationMember.positionId` est la référence du poste RH/Administration entreprise ; `EnterprisePosition.labelFr/labelEn` en fournit le nom traduit. Le `roleCode` de `EnterpriseRetailSiteAssignment` devient explicitement un **profil opérationnel d'accès par boutique** (gestionnaire / facturier / caissier). Il ne crée ni ne modifie un deuxième poste RH. Une personne peut conserver son poste « Agent commercial » tout en ayant le profil « Facturier » à Gombe et « Caissier » à Limete, sous réserve des droits de chaque boutique.
3. **Facturier vs caissier.** La vente au comptoir utilise le parcours canonique `RetailInvoiceFlowWorkbench` quand `invoiceCheckoutEnabled` est actif. Choix du client existant ou création sur place intégrés au bloc, recherche d'articles, panier compact avec quantité/lot, calcul de prix/taxes côté serveur, **aperçu pro-forma imprimable avant confirmation**, préparation de la facture sans paiement. La validation Finance préexistante conditionne son émission. L'impression de la véritable facture A4 ou 80 mm réutilise l'endpoint canonique Finance. Aucun second registre comptable n'est créé.
4. **File de caisse distincte.** `POS → Encaissements au comptoir` n'affiche que les factures émises non soldées (`ISSUED`, `PARTIALLY_PAID`, `OVERDUE`) des boutiques où l'opérateur dispose de `COLLECT_PAYMENT`. Recherche par numéro, filtre boutique, pagination, montants restant dus, impression A4/80 mm. L'encaissement passe par le dialogue et le service Finance existants. Un profil de caisse ne peut pas accéder aux brouillons de facturation ; l'impression lui est autorisée uniquement pour les factures émises ou déjà soldées de sa boutique.

## Conditions d'activation et compatibilité

- Les deux interrupteurs administrés issus du flux de mise en service RETAIL restent requis : `siteStaffIsolationEnabled` puis `invoiceCheckoutEnabled`, avec leurs prérequis Finance, caisses, stocks et droits. **Ce hotfix ne force pas l'activation sur les entreprises existantes.**
- Si `invoiceCheckoutEnabled=false`, la vente historique directe est maintenue pour éviter un arrêt brutal de caisse ; l'administrateur doit achever la mise en service pour disposer du nouveau circuit facture → validation → encaissement. **Même dans cette compatibilité, le client actif, sa fidélité et ses avoirs sont accessibles directement et de manière compacte dans « Vente comptoir ».** Aucun nouveau flux n'effectue le paiement dans le panier.
- Les anciennes URLs `?section=customers` des utilisateurs habilités redirigent vers `?section=checkout`. Le profil de boutique n'élève jamais le rôle global dans Administration entreprise.
- Aucun changement de schéma Prisma ni migration destructive. Les documents de paiement et de vente Finance existants restent les sources canoniques.

## Contrôles ciblés

```bash
node scripts/qa-hotfix-1080-retail-pos-rbac-invoice-cashier.mjs
node scripts/qa-hotfix-1042-site-staff.mjs
node scripts/qa-retail-multistore-onboarding.mjs
node scripts/qa-hotfix-1042-retail-invoice-print.mjs
node scripts/qa-hotfix-1042-retail-invoice-payments.mjs
node scripts/qa-hotfix-1044-retail-activation.mjs
node scripts/qa-retail-pos-dashboard-site-isolation.mjs
node scripts/qa-shop2-customer-payments.mjs
```

## Scénario E2E final à remettre au propriétaire

1. Administrateur : créer **BCN-GOMBE**, **BCN-LIMETE**, leurs dépôts et caisses ; affecter un facturier Gombe, un caissier Gombe, et un second caissier Limete. Vérifier leur **poste officiel inchangé** dans Administration entreprise, distinct du profil d'accès affiché dans POS.
2. Facturier Gombe : connexion en session propre ; vérifier l'absence de toute carte de configuration réseau, l'impossibilité d'ouvrir les pages admin/depot Limete par URL, sélectionner/créer un client, chercher un article, vérifier panier/prix/taxes, imprimer une pro-forma et confirmer une facture. **Aucun encaissement** n'est proposé.
3. Validateur Finance : contrôler le circuit d'approbation de la facture puis son émission ; vérifier qu'elle devient disponible dans la file d'encaissement, pas auparavant.
4. Caissier Gombe : voir uniquement ses factures émises impayées, filtrer/rechercher, encaisser partiellement puis solder via une session de caisse autorisée. Vérifier le solde et le statut côté Finance et l'impression A4/80 mm. Ne pas voir les brouillons, ni les factures Limete.
5. Révocation : désactiver l'affectation Gombe du caissier puis essayer une URL et une API avec `siteId` forgé ; refus attendu. Un administrateur conserve la vue réseau complète. Tester également la mise en service non activée sans casser la vente historique.
6. Mobile 320–430 px, desktop, clair/sombre et FR/EN : contrôles accessibles au clavier, boutons non superposés, menus et toasts contextualisés. Vérifier impression pro-forma vs véritable facture.

**Livraison :** CI et validation `E2E final BON` du propriétaire avant squash merge. Production exclusivement via `main`, aucun déploiement Preview ou `--prod` manuel.

## Repli

Si la séparation de caisse provoque un incident après mise en production, l'administrateur peut suspendre `invoiceCheckoutEnabled` via le circuit d'activation contrôlé. Les factures déjà préparées/émises, leurs validations et paiements Finance ne sont ni supprimés ni modifiés. Un rollback du code passe par les procédures GitHub/Vercel autorisées sur `main`, sans migration.
