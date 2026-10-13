## 2026-10-13 — AI-CONSOLE-01 : Centre IA et observabilité

### Ajouté
- Nouvelle section **Centre IA & intégrations** dans les réglages de l'Administration DTSC pour les administrateurs autorisés.
- Indicateurs des appels aux modèles, tokens, coût estimé en USD, couverture tarifaire, réussite et latence P95, avec leur source et leur période.
- Consultation des fournisseurs et de l'activité des agents, sans exposition des données privées des clients.
- Suivi des serveurs et outils MCP configurés, distinct de la disponibilité opérationnelle réelle.
- Filtres 24 heures, 7 jours, 30 jours et 90 jours ; aide intégrée en français et en anglais.

### Amélioré
- Les valeurs indisponibles sont affichées comme **inconnues** et non comme des chiffres fictifs.
- Accès gouverné par une permission IA distincte de la consultation des paramètres généraux.
- Affichage compact, adapté aux mobiles, avec navigation clavier et mode sombre.

### Limites actuelles
- Centre en **lecture seule** : réglages des modèles et quotas prévus dans #800.
- Certification et administration MCP prévues dans #802 ; métriques de connectivité réelle requises dans #803.
