# E2E manuel — Modules standards itération 05

**Statut global : NON_EXÉCUTÉ**

> Tests E2E manuels préparés — validation du propriétaire en attente

## Préconditions

Production issue du SHA fusionné de `main`, migrations appliquées, compte FR et EN, organisation de test, documents français/anglais, accès Administration DTSC et au moins un rôle lecture seule.

## Scénarios

1. **Chatbot global** — créer, envoyer, observer le streaming, arrêter, régénérer, renommer, archiver, restaurer et supprimer.
2. **i18n français** — navigation, boutons, statuts, erreurs, guides, dates, nombres et coûts.
3. **i18n anglais** — mêmes surfaces, absence de français résiduel et fallback cohérent.
4. **Langue de réponse** — interface FR, réponse demandée EN, nouvelle conversation revenant à la langue par défaut.
5. **Guide natif** — ouvrir depuis le Chatbot, naviguer, changer la locale et tester sur mobile.
6. **Assistant entreprise** — organisation active, recherche de données/outils autorisés, liens, sources et isolation.
7. **RAG multilingue** — documents FR/EN, requêtes croisées, réponse dans la langue demandée, citation dans la langue source.
8. **Outil de préparation** — préparer une tâche, modifier l’aperçu, confirmer seulement via le service métier autorisé.
9. **Mutation sensible** — vérifier aperçu/annulation/confirmation et absence d’action après annulation. Ce scénario reste bloqué tant qu’aucun outil mutatif n’est activé.
10. **Quotas et coûts** — plusieurs modèles configurés, compteurs, devise, fallback et absence de double comptage.
11. **Administration DTSC** — ouvrir la maturité commerciale enrichie et basculer matrice/Kanban.
12. **Kanban** — colonnes, recherche, filtres, carte, preuves et historique.
13. **Transition professionnelle** — motif, preuve, critères, historique et audit.
14. **Blocage commercial** — tentative sans E2E/validation propriétaire refusée sans modification.
15. **Dégradation** — motif, preuve incident, historique et notification/audit.
16. **Permissions Kanban** — lecture seule refusée en écriture, administrateur autorisé accepté.
17. **Kanban mobile** — 320, 360, 375, 390, 414 et 768 px : scroll, filtres, cartes, détails, formulaire alternatif et guides.
18. **PWA/reprise** — génération en arrière-plan, reprise sans doublon, conservation du contexte et ouverture du Kanban.

Chaque scénario doit enregistrer date, acteur, environnement, résultat, capture/preuve, défaut éventuel et décision du propriétaire.
