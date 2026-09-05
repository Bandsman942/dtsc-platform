# ADR — SCALE-4F utilise EnterpriseDomainEvent

## Décision

Les traitements bulk Finance de #515 réutilisent `EnterpriseDomainEvent` comme file durable et le stockage Supabase privé existant pour les payloads/artefacts volumineux.

## Alternatives rejetées

- nouvelle table `EnterpriseBulkJob` : rejetée, car elle dupliquerait lease/retry/idempotence/observabilité déjà fournis par SCALE-4 ;
- stockage des 10 000 lignes dans `payloadJson` : rejeté pour taille, coût et exposition inutile ;
- import 10 000 lignes synchrone : rejeté pour durée/timeout et impossibilité de reprise ;
- URL publique d’export : rejetée pour confidentialité ;
- réactivation d’un export Audit de 5 000 lignes dans la requête si le worker échoue : rejetée, car elle réintroduirait la dette.

## Conséquences

- zéro migration #515 ;
- contrat worker homogène avec les autres capacités SCALE-4 ;
- payloads bulk hors base, mais pointeurs/audit de job persistants ;
- besoin de stockage privé configuré pour les gros volumes ;
- petits volumes conservent un parcours synchrone borné.
