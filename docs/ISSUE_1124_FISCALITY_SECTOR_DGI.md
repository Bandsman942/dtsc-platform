# Issue #1124 — Fiscalité sectorielle et préparation DGI RDC

**État :** candidat de développement (PR #1125, non fusionnée). Version cible v1.15.0. Aucun déploiement de branche.

## Responsabilité des données

La facture canonique `EnterpriseSalesInvoice` et la facture fournisseur `EnterpriseSupplierInvoice` restent les seules sources de vérité pour les flux Finance. Le POS/Retail convertit ses lignes vers Finance avec un pays fiscal de boutique contrôlé. Santé et Pharmacie projettent leurs factures vers les modules communs, mais n'ont historiquement pas de ventilation fiscale par ligne ; tant qu'un détail prouvable n'existe pas, la projection d'une taxe globale positive doit être bloquée, plutôt que transformée en fausse TVA.

## Assiette, cumuls et contrôle documentaire

- TaxCode + TaxRate actifs à date, code propre à l'organisation et pays compatible. Les codes `EXEMPT` et `ZERO_RATED` imposent une référence de justification, taux appliqué zéro et un instantané sur le document.
- Une taxe complémentaire sur la même assiette est additive par défaut (`NET`). Le calcul séquentiel (`SEQUENTIAL`) exige une preuve plus une `EnterpriseTaxRule` active, limitée à la source, portant `criteriaJson.calculationMode === "SEQUENTIAL"` et une référence légale. Les priorités sont conservées et les ambiguïtés ne sont pas arbitrées silencieusement.
- Retenue à la source et fiscalité transfrontière non homologuée restent bloquées dans le montant TVA/TTC. Une retenue n'est pas une TVA collectée ; implémenter son flux séparé exige une base, un fait générateur, des comptes dédiés et une validation juridique.
- La TVA d'achat n'est comptabilisée au compte de récupération que si `taxRecoveryRequested` est justifié, que le TaxCode contient un compte récupérable, et qu'un réviseur distinct a validé les pièces. Sinon, taxe non déductible en coût.
- Les instantanés de DRAFT ne participent pas aux états fiscaux. Le journal `EnterpriseTaxLine` naît à la comptabilisation et les avoirs inversent ses directions. Les avoirs citent les lignes d'origine, limitent le nombre de produits et reconstituent les taux/montants d'époque, sans recalcule à date.
- Les états calculent `OUTPUT - OUTPUT_REVERSAL - INPUT + INPUT_REVERSAL`, excluant les taxes `INPUT_NONRECOVERABLE`.

## Facture normalisée — non-homologation

Source primaire DGI : https://dgi.gouv.cd/reforme-de-la-facture-normalisee/

Communiqué du 25 février 2026 : https://dgi.gouv.cd/wp-content/uploads/2026/02/FACNO-TVA.pdf (évolution des groupes sur e-DEF et mise en conformité des systèmes certifiés). Les groupes C/G (8 → 5 %) et O/P (1 %) sont spécifiques au contexte e-DEF décrit ; ne jamais les imposer globalement à la TVA ordinaire.

Le registre de préparation `GET /api/enterprise/:organizationId/sales-invoices/:invoiceId/fiscalization-readiness` vérifie la complétude des noms, NIF, RCCM, adresses, factures, taxes et lignes. Le résultat est **toujours** `certificationState: NOT_HOMOLOGATED`, `canTransmit: false`, `canClaimNormalizedInvoice: false`.

Aucun QR DGI, numéro DEF, code d'autorisation, signature, certificat ou transmission e-DEF ne peut être produit sans dispositif homologué, homologation officielle, contrat d'intégration, tests en environnement DGI, gestion des erreurs / reprise et revue juridique. Un reçu ou PDF DTSC ne devient pas une facture DGI officielle en l'absence de ces preuves.

## Contrôles à valider avant E2E final

1. Régression sur catalogue de taxes et facture TTC/HT POS, boutiques en pays distincts.
2. Facture de vente multi-taxes additive et séquentielle autorisée ; erreur si preuve/règle absente, ou retenue inappropriée.
3. Facture fournisseur avec TVA récupérable versus coût non récupérable, validation par revue indépendante, journal et balances.
4. Avoir client et fournisseur partiel puis total, remboursement idem source, plafonds originaux, taxe inversée.
5. Santé/Pharmacie : sans taxe, avec taxe positive justifiée par ligne et avec taxe agrégée non ventilée (bloquée), sans divulgation patient.
6. Vérification des états TVA par devise et période, droits et multitenancy, E2E authentifié.
7. Endpoint de pré-contrôle DGI retourne toujours NOT_HOMOLOGATED et n'émet aucun code officiel.

**Politique :** une PR DRAFT et `OWNER_E2E: NOT_EXECUTED` jusqu'à validation explicite. Aucun déploiement hors `main`.

## Provenance fiscale sectorielle ajoutée

Les nouvelles lignes `HealthMedicalInvoiceItem` et `PharmacySaleLine` conservent désormais le code, le taux appliqué, la juridiction, la version du modèle, la référence documentaire, le montant et l'instantané détaillé calculés par le **moteur fiscal commun**. L'absence de code ne déclenche aucune TVA implicite. Les valeurs de taxe globale isolées sans ventilation sont refusées. Le taux d'une facture existante n'est jamais recalculé lors de la convergence.

Le montant de remise Pharmacie est une remise **en pourcentage**, convertie en montant monétaire avant projection Finance (correction de la confusion historique). Les remises globales diminuent l'assiette des taxes au moment de la création du document source. L'émission Finance conserve la mécanique de validation et le journal fiscal canonique.

Les anciens documents sans tax provenance restent lisibles, mais une taxe positive non ventilée empêche volontairement la convergence. Les formulaires de facturation Santé et de vente Pharmacie proposent désormais les codes fiscaux actifs, les cumuls explicites et les justificatifs, dans le périmètre de l'entreprise et de sa juridiction. Le serveur recalcule les montants et rejette tout total global dépourvu de ventilation, sans prétendre à une homologation réglementaire.
