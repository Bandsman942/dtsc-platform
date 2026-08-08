import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";
import { getRetailUserGuide as getBaseRetailUserGuide } from "@/lib/user-guides/retail-telco-mobile-money-guides";

function iterationThreeSteps(code: string, locale: "fr" | "en"): ContextualUserGuide["steps"] {
  if (code === "MOBILE_MONEY_AGENCY" || code === "TELCO_TOPUPS") {
    return locale === "en"
      ? [
          { title: "Choose manual or connected mode", description: "MANUAL keeps controlled operator entry. CONNECTED requires an enabled provider integration and a registered adapter; the browser never declares provider success by itself." },
          { title: "Follow asynchronous status", description: "Connected operations move through INITIATED, PENDING_PROVIDER, CONFIRMED, FAILED, UNKNOWN and RECONCILED. Cash/float effects are created only after provider confirmation.", cautions: ["UNKNOWN is not success. Reconcile before applying a manual business conclusion."] },
          { title: "Reconcile safely", description: "Authorized controllers can retry/reconcile provider operations. Signed webhooks are idempotent and duplicate callbacks do not duplicate the business or Finance effect." },
        ]
      : [
          { title: "Choisir le mode manuel ou connecté", description: "MANUAL conserve la saisie opérateur contrôlée. CONNECTED exige une intégration provider active et un adaptateur enregistré ; le navigateur ne déclare jamais lui-même le succès opérateur." },
          { title: "Suivre le statut asynchrone", description: "Les opérations connectées évoluent entre INITIATED, PENDING_PROVIDER, CONFIRMED, FAILED, UNKNOWN et RECONCILED. Les effets cash/float ne sont créés qu’après confirmation provider.", cautions: ["UNKNOWN n’est pas un succès. Effectuez le rapprochement avant toute conclusion métier manuelle."] },
          { title: "Rapprocher sans doublon", description: "Les contrôleurs autorisés peuvent relancer/rapprocher les opérations provider. Les webhooks signés sont idempotents et un callback dupliqué ne duplique ni l’opération métier ni l’effet Finance." },
        ];
  }
  if (code !== "RETAIL_POS") return [];
  return locale === "en"
    ? [
        { title: "Recognize the customer at the POS", description: "Search the canonical CRM by name, code, email or phone and select the customer before checkout. A walk-in sale remains possible. Quick customer creation uses the common CRM API and is shown only when the user has the required write permission." },
        { title: "Use customer history", description: "The Retail customer view consolidates recent purchases, returns, loyalty balances and stored value without creating a second customer master." },
        { title: "Operate loyalty", description: "Points are held in a transactional ledger. Automatic earning runs only for an ACTIVE programme explicitly configured with autoEarn=true. Redeeming checks the locked balance and an idempotency key." },
        { title: "Use gift cards and store credit", description: "The bearer code is displayed when issued but only its hash is stored. Redemption and refund lock the account and reject double spend or currency mismatch." },
        { title: "Use provider-neutral payments", description: "Payment transactions use explicit states INITIATED, AUTHORIZED, CAPTURED, FAILED, VOIDED and REFUNDED. Provider integrations store credential references, never raw secrets." },
        { title: "Print or share a receipt", description: "The receipt endpoint exposes structured JSON or print-friendly HTML. Customer contact details appear only when the existing identity/consent domain contains an active RETAIL_RECEIPT_CONTACT consent link." },
        { title: "Check POS devices", description: "Configured scanners, printers, terminals, customer displays, cash drawers and scales report browser readiness. Missing WebUSB/WebBluetooth/WebSerial support degrades cleanly instead of blocking the POS." },
      ]
    : [
        { title: "Reconnaître le client à la caisse", description: "Recherchez le CRM canonique par nom, code, email ou téléphone et sélectionnez le client avant l’encaissement. Une vente de passage reste possible. La création rapide passe par l’API CRM commune et n’apparaît qu’avec la permission d’écriture requise." },
        { title: "Consulter l’historique client", description: "La vue Retail consolide achats récents, retours, soldes fidélité et valeur stockée sans créer un second référentiel client." },
        { title: "Exploiter la fidélité", description: "Les points sont tenus dans un ledger transactionnel. Le gain automatique ne s’applique qu’à un programme ACTIVE explicitement configuré avec autoEarn=true. La dépense verrouille le solde et exige une clé d’idempotence." },
        { title: "Utiliser cartes-cadeaux et avoirs", description: "Le code porteur est affiché à l’émission mais seul son hash est conservé. Débit et remboursement verrouillent le compte et refusent double dépense ou incohérence de devise." },
        { title: "Utiliser les paiements provider-neutral", description: "Les paiements suivent INITIATED, AUTHORIZED, CAPTURED, FAILED, VOIDED et REFUNDED. Les intégrations provider stockent des références de secrets, jamais les secrets bruts." },
        { title: "Imprimer ou partager un reçu", description: "Le reçu est disponible en JSON structuré ou HTML imprimable. Email/téléphone ne sont exposés que si le domaine d’identité/consentement existant contient un lien actif RETAIL_RECEIPT_CONTACT." },
        { title: "Vérifier les périphériques POS", description: "Scanners, imprimantes, terminaux, afficheurs, tiroirs et balances configurés indiquent leur disponibilité navigateur. L’absence de WebUSB/WebBluetooth/WebSerial passe en mode dégradé sans bloquer le POS." },
      ];
}

export function getShop2Iteration3UserGuide(code: string, localeValue: string): ContextualUserGuide {
  const locale: "fr" | "en" = localeValue === "en" ? "en" : "fr";
  const base = getBaseRetailUserGuide(code, locale);
  const obsoleteFragments = locale === "en"
    ? ["iteration 3", "provider asynchronous", "asynchronous PSP", "POS hardware", "connected Mobile Money"]
    : ["itération 3", "state machine provider", "PSP et webhooks asynchrones", "périphériques POS", "opérateurs Mobile Money"];
  const limitations = (base.limitations || []).filter((item) => !obsoleteFragments.some((fragment) => item.toLowerCase().includes(fragment.toLowerCase())));
  const extraCapabilities = code === "RETAIL_POS"
    ? locale === "en"
      ? ["Canonical CRM customer at POS", "Customer purchase/return history", "Transactional loyalty", "Gift cards and store credit", "Provider-neutral payments", "Consent-aware digital/print receipt", "POS device readiness"]
      : ["Client CRM canonique au POS", "Historique achats/retours client", "Fidélité transactionnelle", "Cartes-cadeaux et avoirs", "Paiements provider-neutral", "Reçu digital/imprimable selon consentement", "Disponibilité des périphériques POS"]
    : locale === "en"
      ? ["Manual/connected provider modes", "Asynchronous provider states", "Signed idempotent webhooks", "Timeout/unknown/reconciliation"]
      : ["Modes provider manuel/connecté", "États provider asynchrones", "Webhooks signés idempotents", "Timeout/unknown/rapprochement"];

  return {
    ...base,
    updatedAt: "2026-08-08",
    capabilities: Array.from(new Set([...(base.capabilities || []), ...extraCapabilities])),
    steps: [...(base.steps || []), ...iterationThreeSteps(code, locale)],
    limitations,
  };
}
