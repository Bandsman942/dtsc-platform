# Rapprochement bancaire et financier professionnel

Le workspace compare lignes de relevé, paiements, mouvements de trésorerie et écritures sans fusionner ces objets.

Une correspondance conserve la ligne, l’opération, le montant, l’état, l’auteur et l’audit. Le serveur refuse les liens inter-tenant, montants dépassés, lignes utilisées deux fois et modifications de sessions clôturées.

Les critères explicables sont : montant exact, date proche, référence, tiers, compte et devise. Une correspondance ambiguë n’est jamais validée automatiquement.

Workflow : préparé → en cours → soumis → validé → clôturé. Rejet, correction et réouverture restent contrôlés.

Maturité : `PROFESSIONAL_READY`. Tests E2E manuels préparés — validation du propriétaire en attente.
