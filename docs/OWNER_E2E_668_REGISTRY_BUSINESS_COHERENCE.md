# OWNER_E2E — Hotfix #668 Registry & Business Coherence

Statut initial : **NOT_EXECUTED**.

Tester le SHA final de la PR uniquement après réussite de la CI.

1. **Contrats** : depuis la navigation ERP et depuis un ancien/deep link utilisant `CONTRACTS`, vérifier qu’un seul module Contrats est présenté et qu’il ouvre le workspace professionnel attendu.
2. **Ventes & créances sans Devis & commandes** : désactiver `SALES_QUOTES_ORDERS` dans une entreprise autorisée, conserver `CRM_CUSTOMERS` et `FINANCE_RECEIVABLES` actifs, puis vérifier que Ventes & créances s’ouvre et qu’une facture client directe peut être créée sans commande source.
3. **Ventes & créances — sécurité d’intégration** : vérifier qu’une référence de commande/contrat provenant d’un module désactivé ou d’un autre tenant ne permet aucun contournement d’accès.
4. **Paiements** : avec Trésorerie active, vérifier que le module Paiements s’ouvre même si Créances ou Dettes est désactivé. Une allocation vers une source désactivée ne doit pas devenir accessible par ce seul fait.
5. **Trésorerie et Comptabilité** : vérifier qu’elles peuvent s’ouvrir lorsqu’elles sont individuellement activées et autorisées même si Vue d’ensemble Finance est désactivée.
6. **Caisse** : avec Trésorerie active et Paiements désactivé, vérifier que Caisse reste accessible ; les fonctions nécessitant réellement Paiements ne doivent pas contourner son entitlement.
7. **Rapprochement** : vérifier que Banque reste un prérequis bloquant ; Paiements doit apparaître comme intégration recommandée et non comme blocage d’ouverture.
8. **Clôture financière** : vérifier que Comptabilité reste obligatoire ; Rapprochement doit être recommandé mais son absence ne doit pas bloquer la Clôture si les autres règles métier de clôture sont satisfaites.
9. **Administration Modules & abonnement** : vérifier qu’un module distingue clairement les prérequis obligatoires des intégrations recommandées et qu’activer un module n’active pas automatiquement ses recommandations.
10. **Désactivation** : vérifier qu’un prérequis réellement utilisé par un module actif reste protégé contre une désactivation incohérente, alors qu’une simple recommandation ne crée pas ce blocage.
11. **IA Entreprise** : essayer un outil ERP d’un module désactivé/non inclus alors que ce module est seulement recommandé par un autre module actif. L’outil doit rester refusé.
12. **Permissions et tenant isolation** : vérifier qu’un utilisateur sans permission et qu’un identifiant d’une autre entreprise ne gagnent aucun accès par les nouvelles relations recommandées.
13. **FR/EN** : sur la surface d’administration des modules concernée, vérifier que les libellés métier restent compréhensibles et qu’aucun code technique n’est présenté comme message principal.

Après validation, confirmer explicitement dans la conversation ou sur la PR : `E2E #668 bon`, pour le SHA final testé.
