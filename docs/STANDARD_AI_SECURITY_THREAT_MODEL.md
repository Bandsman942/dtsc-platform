# Modèle de menaces IA

## Menaces couvertes

Prompt injection, exfiltration inter-tenant, données sensibles, fichier malveillant, URL dangereuse, outil forgé, duplication de mutation, secret dans les logs, modèle interdit, fallback moins confidentiel et confusion entre contenu/document et instruction système.

## Contrôles

- vérifications serveur et same-origin ;
- Zod, quotas et rate limit ;
- catalogue allow-listé ;
- documents traités comme données ;
- filtres tenant/confidentialité avant récupération ;
- outils enregistrés, permissions et confirmation ;
- idempotence et audit ;
- contenu sensible non journalisé ;
- erreurs stables sans détails secrets ;
- annulation avant toute mutation ultérieure.

Les fichiers restent soumis au pipeline de validation existant. Aucun antivirus universel n’est prétendu si aucun service réel n’est configuré.
