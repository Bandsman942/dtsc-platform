# Machine d’états des appels

États serveur : `RINGING`, `ACTIVE`, `REJECTED`, `MISSED`, `CANCELLED`, `FAILED`, `ENDED`.

- `RINGING → ACTIVE` lors de la première acceptation ; `acceptedAt` est fixé une seule fois.
- `RINGING → REJECTED` quand tous les destinataires requis refusent.
- `RINGING → MISSED` après le délai serveur explicite de 45 secondes sans réponse.
- `RINGING → CANCELLED` quand l’appelant annule avant acceptation.
- `ACTIVE → ENDED` quand l’appelant ou un gestionnaire autorisé termine globalement.
- Une perte réseau produit des événements d’interruption/reconnexion ; elle ne réécrit pas l’historique.

La durée est calculée côté serveur depuis `acceptedAt`, jamais depuis un compteur local. Les transitions terminales sont idempotentes.
