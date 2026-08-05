# Tableaux internes DTSC

Routes canoniques : `/admin/hr-cfo`, `/admin/sco`, `/admin/coo`, `/admin/ceo`, `/admin/mpo`, `/admin/cto`, `/admin/legal`.

Chaque route vérifie poste, bloc ou permission individuelle et charge uniquement ses sources canoniques. HR & CFO consomme RH/finance ; SCO achats/stock/actifs ; COO opérations ; CEO indicateurs et arbitrages ; MPO projets ; CTO projets techniques/incidents/API ; Legal dossiers/contrats/risques.

Aucune donnée GitHub ou Vercel n’est inventée. Chaque indicateur absent est rendu comme indisponible, non comme zéro fictif.
