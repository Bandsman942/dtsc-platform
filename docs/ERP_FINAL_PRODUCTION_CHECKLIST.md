# ERP — Checklist finale Production

## Identité du déploiement

- [ ] SHA de la PR approuvée connu
- [ ] SHA main correspond au merge attendu
- [ ] SHA Production correspond au SHA main
- [ ] un seul déploiement Production issu du merge
- [ ] aucun déploiement manuel ou preview utilisé comme validation

## Migrations et démarrage

- [ ] `prisma migrate deploy` réussi
- [ ] génération Prisma réussie
- [ ] build réussi
- [ ] démarrage et authentification réussis
- [ ] sélection tenant et isolation inter-tenant vérifiées

## Smoke tests

- [ ] Core ERP : tiers, CRM, ventes, achats, stock, RH, paie, projets, actifs, documents, validations
- [ ] Finance : périodes, factures, créances, dettes, paiements, caisse, banque, rapprochements, taxes, écritures, clôture et états
- [ ] Pharmacy : fournisseur, produit, lot, FEFO, achat, réception, vente, paiement, caisse, retour, péremption, qualité et comptabilité
- [ ] Health : patient, rendez-vous, consultation, laboratoire, facture, patient/assurance, paiement, document et confidentialité
- [ ] Workflow Engine v2 : définition, version, instance, transitions et audit
- [ ] Legacy : lectures historiques possibles, mutations refusées sans 500
- [ ] mobile/iPhone : rail KPI, formulaires, clavier, selects, dialogues, deep links, retour arrière et absence de débordement

## Intégrité et sécurité

- [ ] audit d’intégrité comptable sans anomalie critique
- [ ] aucune double facture, créance, dette, paiement, allocation ou écriture
- [ ] périodes fermées protégées
- [ ] aucune donnée clinique inutile dans Finance
- [ ] IDOR, inter-tenant, exports, documents et notifications vérifiés
- [ ] aucune tentative d’écriture legacy légitime dans les logs
- [ ] aucun secret dans client, logs, migrations ou documentation

## Clôture

- [ ] logs Production sans erreur critique
- [ ] incidents et rollbacks documentés
- [ ] dette technique restante inscrite dans le rapport final
- [ ] observation Release A validée avant toute Release B destructive
