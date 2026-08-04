# Modèle de citation IA

Une citation peut contenir : identifiant de source, titre, confidentialité, langue, version, page, section, extrait court, distance/score et lien autorisé.

## Présentation

La réponse distingue donnée sourcée, synthèse, hypothèse, proposition et absence de preuve. Le contenu cité reste dans sa langue source sauf demande explicite de traduction. Une citation n’est jamais fabriquée côté frontend : elle provient du résultat RAG persisté dans le message.

## Accès

Un lien de citation n’accorde aucun accès supplémentaire. La route cible revalide session, tenant, membership, source, confidentialité et permission avant de fournir le document.
