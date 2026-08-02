export type FinanceUserGuide = {
  title: string;
  purpose: string;
  prerequisites: string[];
  steps: string[];
  workflow: string[];
  controls: string[];
  troubleshooting: string[];
};

export const FINANCE_USER_GUIDES: Record<string, FinanceUserGuide> = {
  FINANCE_OVERVIEW: {
    title: "Vue d’ensemble Finance",
    purpose: "Configurer les prérequis financiers de l’entreprise, suivre les indicateurs opérationnels et accéder aux actions recommandées sans créer une seconde comptabilité.",
    prerequisites: [
      "Disposer du droit de consultation Finance ; le droit d’administration Finance est requis pour modifier la configuration.",
      "Préparer la devise fonctionnelle, l’exercice, le plan comptable, les journaux et au moins un compte financier.",
    ],
    steps: [
      "Ouvrez l’Assistant de configuration et traitez les étapes dans l’ordre proposé.",
      "Définissez la devise fonctionnelle et la devise de présentation avant les premières écritures.",
      "Créez ou sélectionnez l’exercice, puis ouvrez la période de travail autorisée.",
      "Vérifiez le plan comptable, les journaux de ventes et d’achats, les taxes et les règles de comptabilisation.",
      "Ajoutez au moins un compte bancaire, une caisse ou un portefeuille financier.",
      "Consultez la checklist, les alertes et les actions recommandées pour rejoindre le module concerné.",
    ],
    workflow: [
      "Configuration incomplète → Prête pour les opérations lorsque toutes les étapes obligatoires sont validées.",
      "Période ouverte → Fermée → Verrouillée selon les permissions et contrôles comptables disponibles.",
    ],
    controls: [
      "La devise fonctionnelle ne peut pas être changée dangereusement après comptabilisation.",
      "Les indicateurs ne mélangent pas silencieusement des devises différentes.",
      "Une période fermée ou verrouillée refuse les nouvelles mutations financières.",
    ],
    troubleshooting: [
      "Une étape reste incomplète : ouvrez son action recommandée et vérifiez l’objet actif attendu.",
      "Une modification de devise est refusée : des écritures existent déjà ; conservez la devise historique.",
      "Une action n’est pas visible : vérifiez votre permission Finance et l’activation du module dans l’entreprise.",
    ],
  },
  FINANCE_RECEIVABLES: {
    title: "Créances et factures clients",
    purpose: "Créer, soumettre, approuver, émettre et suivre les factures clients, leurs créances, échéances, paiements et avoirs.",
    prerequisites: [
      "Client actif dans le référentiel des tiers et lignes de produit ou service disponibles.",
      "Période financière ouverte, devise autorisée et validateur différent du préparateur lorsque l’approbation est requise.",
    ],
    steps: [
      "Touchez Nouvelle facture client et sélectionnez le client, la source éventuelle, la devise et les dates.",
      "Ajoutez les lignes, quantités, prix, remises et taxes ; les totaux sont recalculés côté serveur.",
      "Enregistrez le brouillon, liez les justificatifs privés et ajoutez les commentaires utiles.",
      "Soumettez la facture puis faites-la approuver par la personne autorisée.",
      "Émettez et comptabilisez la facture pour produire une créance unique.",
      "Enregistrez les paiements dans Paiements, puis affectez-les partiellement ou totalement à la créance.",
      "Après émission, utilisez un avoir, un remboursement ou une contrepassation contrôlée au lieu de modifier silencieusement la facture.",
    ],
    workflow: [
      "Brouillon → En attente d’approbation → Approuvée → Émise/Comptabilisée.",
      "Créance ouverte → Partiellement payée → Payée.",
      "Correction après émission → Avoir distinct et traçable.",
    ],
    controls: [
      "L’auto-approbation est refusée lorsque la séparation des responsabilités est exigée.",
      "Une source commerciale ne peut pas être surfacturée et une facture ne crée qu’une créance commune.",
      "Les allocations ne dépassent ni le paiement disponible ni le solde de la facture.",
    ],
    troubleshooting: [
      "Client ou source absent : vérifiez son statut actif et son appartenance à la même entreprise.",
      "Soumission refusée : contrôlez les lignes, la période, la devise et le validateur.",
      "Solde inattendu : consultez les allocations confirmées et les avoirs liés, qui constituent la source du solde ouvert.",
    ],
  },
  FINANCE_PAYABLES: {
    title: "Dettes et factures fournisseurs",
    purpose: "Enregistrer les factures fournisseurs, contrôler la commande, la réception et la facture, puis suivre la dette et son règlement.",
    prerequisites: [
      "Fournisseur actif et, lorsqu’ils existent, commande et réception appartenant à la même entreprise.",
      "Période ouverte, compte comptable et validateur indépendant disponibles.",
    ],
    steps: [
      "Touchez Nouvelle facture fournisseur et choisissez le fournisseur.",
      "Liez la commande et la réception lorsque la facture provient d’un achat existant.",
      "Saisissez les lignes et vérifiez les quantités commandées, reçues et facturées ainsi que les écarts de prix.",
      "Corrigez l’écart ou saisissez une justification lorsque votre permission autorise une dérogation.",
      "Ajoutez les documents et commentaires, puis soumettez la facture à approbation.",
      "Après approbation et comptabilisation, suivez la dette dans les vues À payer et En retard.",
      "Créez le paiement fournisseur dans Paiements et affectez-le à la dette.",
    ],
    workflow: [
      "Brouillon → En attente d’approbation → Approuvée → Comptabilisée.",
      "Dette ouverte → Partiellement payée → Payée.",
      "Correction après comptabilisation → Avoir fournisseur, remboursement ou contrepassation.",
    ],
    controls: [
      "La référence fournisseur dupliquée est refusée dans le périmètre de l’entreprise.",
      "La réception reste distincte de la facture et la facture reste distincte du paiement.",
      "Toute dérogation au contrôle commande-réception-facture conserve le motif, l’écart original et l’audit.",
    ],
    troubleshooting: [
      "Commande ou réception absente : vérifiez le fournisseur, le statut et les quantités restantes.",
      "Approbation bloquée : le préparateur ne peut pas être son propre approbateur lorsque la politique l’interdit.",
      "Dette non visible : vérifiez que la facture a bien été approuvée et comptabilisée.",
    ],
  },
  FINANCE_PAYMENTS: {
    title: "Paiements et allocations",
    purpose: "Préparer, faire approuver, confirmer et affecter les encaissements clients, paiements fournisseurs, paiements de paie et remboursements autorisés.",
    prerequisites: [
      "Compte financier actif, tiers ou source compatible et devise correspondante.",
      "Créance ou dette ouverte pour une allocation immédiate ; un paiement peut aussi être confirmé sans affectation.",
    ],
    steps: [
      "Touchez Nouveau paiement et choisissez le type, le compte, le tiers ou la source, la date, la devise et le montant.",
      "Ajoutez la référence, les justificatifs privés et les commentaires nécessaires.",
      "Enregistrez puis soumettez le paiement à l’approbateur indépendant.",
      "Après approbation, confirmez le paiement pour rendre son montant disponible à l’affectation.",
      "Ouvrez Paiements non affectés ou le détail du paiement, choisissez la créance ou dette compatible et saisissez le montant à affecter.",
      "Répétez l’affectation si le paiement doit couvrir plusieurs objets, sans dépasser le disponible.",
      "Utilisez la contrepassation ou le remboursement prévu au lieu de supprimer un paiement confirmé.",
    ],
    workflow: [
      "Brouillon → Soumis → Approuvé → Confirmé → Partiellement ou totalement affecté.",
      "Rejeté ou annulé avant confirmation ; contrepassé ou remboursé après confirmation selon les actions disponibles.",
    ],
    controls: [
      "Le serveur refuse l’auto-approbation, le double clic, la double allocation et les liens inter-entreprises.",
      "Une allocation est limitée par le montant non affecté du paiement et par le solde de la facture.",
      "Une paie approuvée peut préparer un paiement, mais n’est jamais payée automatiquement.",
    ],
    troubleshooting: [
      "Facture absente de l’affectation : vérifiez le tiers, la devise, le statut et le solde ouvert.",
      "Montant refusé : réduisez-le au minimum entre le disponible du paiement et le solde de la facture.",
      "Paiement introuvable : recherchez-le dans Non affectés ou vérifiez son statut de confirmation.",
    ],
  },
  FINANCE_TREASURY: {
    title: "Trésorerie et transferts",
    purpose: "Gérer les comptes bancaires, caisses, portefeuilles et comptes de transit, puis effectuer des transferts contrôlés entre comptes.",
    prerequisites: [
      "Plan comptable et devises configurés.",
      "Deux comptes financiers actifs et distincts pour un transfert.",
    ],
    steps: [
      "Touchez Nouveau compte financier et choisissez le type, la devise, le compte comptable et le responsable.",
      "Saisissez la référence bancaire ou externe ; l’interface ne réaffiche ensuite qu’une version masquée.",
      "Pour déplacer des fonds, touchez Nouveau transfert et choisissez les comptes source et cible.",
      "Saisissez le montant source, le montant cible et le taux réellement utilisé si les devises diffèrent.",
      "Soumettez le transfert à une personne différente lorsque l’approbation indépendante est requise.",
      "Après approbation, exécutez et contrôlez les deux côtés du transfert ainsi que l’écriture liée.",
    ],
    workflow: [
      "Compte financier : Actif → Inactif ou Archivé selon les actions autorisées.",
      "Transfert : Brouillon → Soumis → Approuvé → Exécuté/Confirmé → Comptabilisé.",
    ],
    controls: [
      "Le même compte ne peut pas être utilisé comme source et destination.",
      "Les références sensibles restent masquées et les transferts sont idempotents.",
      "Les devises différentes exigent les montants et le taux historique réellement appliqué.",
    ],
    troubleshooting: [
      "Compte absent : vérifiez son statut, sa devise et votre permission sur le module.",
      "Transfert refusé : contrôlez les comptes distincts, le montant, la devise, le taux et l’approbateur.",
      "Solde inattendu : consultez les opérations confirmées et les écritures, sans additionner des devises différentes.",
    ],
  },
  FINANCE_CASH: {
    title: "Caisse",
    purpose: "Ouvrir une session de caisse, enregistrer les opérations, effectuer le comptage physique et obtenir une clôture validée indépendamment.",
    prerequisites: [
      "Caisse active, caissier autorisé et solde d’ouverture connu.",
      "Validateur distinct disponible pour la clôture lorsque la politique l’exige.",
    ],
    steps: [
      "Touchez Ouvrir une session de caisse, choisissez la caisse et saisissez le solde d’ouverture.",
      "Enregistrez les encaissements et décaissements autorisés avec leur source et leur justificatif.",
      "À la fin du service, ouvrez l’Assistant de clôture de caisse.",
      "Vérifiez les opérations, saisissez les dénominations ou le total physique et comparez-le au théorique.",
      "Expliquez tout écart, puis soumettez la clôture.",
      "Le validateur indépendant approuve ou retourne la clôture avec un motif.",
    ],
    workflow: [
      "Session ouverte → En comptage → En attente de validation → Validée/Clôturée.",
      "Une clôture retournée conserve l’écart, le motif et l’historique avant correction.",
    ],
    controls: [
      "Une seule session active compatible est autorisée pour une caisse.",
      "Le caissier ne peut pas auto-valider sa clôture lorsque la séparation des rôles est requise.",
      "Les écarts et mouvements ne sont jamais supprimés silencieusement.",
    ],
    troubleshooting: [
      "Ouverture refusée : une session active existe peut-être déjà pour cette caisse.",
      "Clôture bloquée : complétez le comptage et la justification de l’écart.",
      "Bouton de validation absent : connectez-vous avec le validateur autorisé, différent du caissier.",
    ],
  },
  FINANCE_BANK: {
    title: "Banque et relevés",
    purpose: "Importer un relevé bancaire CSV supporté, contrôler sa prévisualisation, consulter ses lignes et préparer le rapprochement.",
    prerequisites: [
      "Compte bancaire actif dans la bonne devise.",
      "Fichier CSV de 5 Mo maximum et de 10 000 lignes maximum, utilisant les colonnes reconnues par l’importeur.",
    ],
    steps: [
      "Touchez Importer un relevé bancaire et sélectionnez le compte concerné.",
      "Choisissez le fichier CSV ; vérifiez le type, la taille et les colonnes détectées.",
      "Examinez la prévisualisation, la période, la devise, les soldes et les premières lignes.",
      "Corrigez le fichier si une colonne obligatoire ou une valeur est invalide.",
      "Confirmez l’import puis ouvrez le relevé pour consulter ses lignes et leur statut de rapprochement.",
      "Passez dans Rapprochement pour associer les lignes aux paiements ou mouvements compatibles.",
    ],
    workflow: [
      "Fichier sélectionné → Prévisualisé → Confirmé/Importé → Partiellement ou totalement rapproché.",
      "La portée commerciale actuelle couvre le format CSV réellement supporté ; aucun format bancaire additionnel n’est simulé.",
    ],
    controls: [
      "Les doublons sont bloqués sans effacer la preuve du relevé existant.",
      "Les valeurs pouvant être interprétées comme des formules sont neutralisées.",
      "Les références bancaires complètes et les données privées ne sont pas exposées dans les logs applicatifs.",
    ],
    troubleshooting: [
      "Fichier refusé : utilisez un CSV conforme et respectez les limites de taille et de lignes.",
      "Colonnes non reconnues : adaptez les en-têtes au format présenté dans la prévisualisation.",
      "Réimportation bloquée : ouvrez le relevé déjà importé au lieu de créer un doublon.",
    ],
  },
  FINANCE_RECONCILIATION: {
    title: "Rapprochement bancaire",
    purpose: "Comparer les lignes de relevé aux paiements et mouvements financiers, enregistrer des correspondances explicables et clôturer une session contrôlée.",
    prerequisites: [
      "Relevé bancaire importé et opérations financières confirmées dans la même entreprise et la même devise.",
      "Validateur autorisé pour la soumission et la clôture selon la politique de l’entreprise.",
    ],
    steps: [
      "Touchez Créer un rapprochement et choisissez le relevé ou le compte concerné.",
      "Ouvrez une ligne bancaire et examinez les suggestions ainsi que leurs critères : montant, date, référence, tiers, compte et devise.",
      "Acceptez uniquement une suggestion non ambiguë ou choisissez Nouvelle correspondance pour un rapprochement manuel.",
      "Saisissez le montant rapproché sans dépasser la ligne ni l’opération sélectionnée.",
      "Traitez les lignes restantes et vérifiez la différence ainsi que les éléments non résolus.",
      "Soumettez puis faites valider la session avant sa clôture.",
    ],
    workflow: [
      "Préparé → En cours → Soumis → Validé → Clôturé.",
      "Une session clôturée devient immuable ; rejet, correction ou réouverture suivent les actions contrôlées disponibles.",
    ],
    controls: [
      "Une ligne ou un montant déjà rapproché ne peut pas être utilisé deux fois.",
      "Une suggestion ambiguë n’est jamais validée automatiquement.",
      "Chaque correspondance conserve son auteur, ses critères, son montant et son audit.",
    ],
    troubleshooting: [
      "Aucune suggestion : vérifiez la devise, le compte, la période, le montant et le statut confirmé des opérations.",
      "Correspondance refusée : réduisez le montant ou sélectionnez une opération non déjà consommée.",
      "Clôture impossible : résolvez ou justifiez les écarts et terminez les validations requises.",
    ],
  },
};
