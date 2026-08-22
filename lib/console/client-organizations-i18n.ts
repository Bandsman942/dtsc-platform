export type ClientOrganizationsLocale = "fr" | "en";

const dictionaries = {
  fr: {
    actionSaved: "Action enregistrée.",
    actionImpossible: "Action impossible. Réessayez ou vérifiez les informations saisies.",
    invalidForm: "Certaines informations obligatoires sont manquantes ou invalides. Vérifiez le formulaire puis réessayez.",
    companyCreated: "Entreprise cliente créée.",
    companyCreatedWithAdmin: "Entreprise cliente créée. L’invitation administrateur est en attente d’acceptation.",
    companyUpdated: "Entreprise mise à jour.",
    companyUpdatedSubscriptionFailed: "Les informations de l’entreprise ont été enregistrées, mais l’abonnement n’a pas pu être mis à jour.",
    adminInvitationSent: "Invitation administrateur envoyée. Elle restera en attente jusqu’à l’acceptation du nouvel administrateur.",
    adminReasonRequired: "Renseignez la raison de cette désignation avant d’envoyer l’invitation.",
    adminAlreadyActive: "Cet utilisateur est déjà administrateur actif de cette entreprise.",
    adminInvitationAlreadyPending: "Une invitation administrateur est déjà en attente pour cet utilisateur.",
    adminTargetPrivileged: "Cet utilisateur possède déjà un accès administrateur ou propriétaire dans cette entreprise.",
    currentAdmin: "Administrateur actif",
    noActiveAdmin: "Non désigné",
    pendingInvitation: "Invitation administrateur en attente",
    createAdminLabel: "Administrateur initial",
    createAdminHint: "Choisissez l’utilisateur qui recevra l’invitation d’administrateur après la création de l’entreprise.",
    createAdminEmpty: "Créer sans administrateur initial",
    changeAdminLabel: "Désigner ou changer l’administrateur",
    changeAdminHint: "Choisissez un utilisateur. L’invitation ne sera envoyée qu’après saisie d’une raison.",
    changeAdminEmpty: "Choisir un nouvel administrateur",
    noEligibleAdmin: "Aucun autre utilisateur disponible",
    reasonLabel: "Raison de la désignation",
    reasonHint: "Expliquez pourquoi DTSC désigne cet administrateur. Cette raison est conservée dans l’audit.",
    reasonPlaceholder: "Ex. administrateur principal du nouveau compte, remplacement, nouvelle responsabilité…",
    sendInvitation: "Envoyer l’invitation",
    sendingInvitation: "Envoi en cours…",
    acceptanceHint: "L’administrateur devra accepter explicitement l’invitation avant que son accès administrateur devienne actif.",
  },
  en: {
    actionSaved: "Action saved.",
    actionImpossible: "The action could not be completed. Try again or review the information entered.",
    invalidForm: "Some required information is missing or invalid. Review the form and try again.",
    companyCreated: "Client company created.",
    companyCreatedWithAdmin: "Client company created. The administrator invitation is pending acceptance.",
    companyUpdated: "Company updated.",
    companyUpdatedSubscriptionFailed: "The company information was saved, but the subscription could not be updated.",
    adminInvitationSent: "Administrator invitation sent. It will remain pending until the new administrator accepts it.",
    adminReasonRequired: "Enter the reason for this assignment before sending the invitation.",
    adminAlreadyActive: "This user is already an active administrator of this company.",
    adminInvitationAlreadyPending: "An administrator invitation is already pending for this user.",
    adminTargetPrivileged: "This user already has administrator or owner access in this company.",
    currentAdmin: "Active administrator",
    noActiveAdmin: "Not assigned",
    pendingInvitation: "Administrator invitation pending",
    createAdminLabel: "Initial administrator",
    createAdminHint: "Choose the user who will receive the administrator invitation after the company is created.",
    createAdminEmpty: "Create without an initial administrator",
    changeAdminLabel: "Assign or change administrator",
    changeAdminHint: "Choose a user. The invitation will only be sent after a reason is entered.",
    changeAdminEmpty: "Choose a new administrator",
    noEligibleAdmin: "No other user available",
    reasonLabel: "Reason for assignment",
    reasonHint: "Explain why DTSC is assigning this administrator. The reason is retained in the audit trail.",
    reasonPlaceholder: "E.g. primary administrator for the new account, replacement, new responsibility…",
    sendInvitation: "Send invitation",
    sendingInvitation: "Sending…",
    acceptanceHint: "The administrator must explicitly accept the invitation before administrator access becomes active.",
  },
} as const;

export type ClientOrganizationsCopyKey = keyof typeof dictionaries.fr;

export function translateClientOrganizations(
  locale: string | null | undefined,
  key: ClientOrganizationsCopyKey,
) {
  const dictionary = dictionaries[locale === "en" ? "en" : "fr"];
  return dictionary[key] || dictionaries.fr[key];
}
