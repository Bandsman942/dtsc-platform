export type ClientOrganizationsLocale = "fr" | "en";

const dictionaries = {
  fr: {
    actionSaved: "Action enregistrée.",
    actionImpossible: "Action impossible. Réessayez ou vérifiez les informations saisies.",
    invalidForm: "Certaines informations obligatoires sont manquantes ou invalides. Vérifiez le formulaire puis réessayez.",
    companyUpdated: "Entreprise mise à jour.",
    companyUpdatedSubscriptionFailed: "Les informations de l’entreprise ont été enregistrées, mais l’abonnement n’a pas pu être mis à jour.",
    adminInvitationSent: "Invitation administrateur envoyée. Elle restera en attente jusqu’à l’acceptation du nouvel administrateur.",
    adminReasonRequired: "Renseignez la raison de ce changement avant d’envoyer l’invitation.",
    adminAlreadyActive: "Cet utilisateur est déjà administrateur actif de cette entreprise.",
    adminInvitationAlreadyPending: "Une invitation administrateur est déjà en attente pour cet utilisateur.",
    adminTargetPrivileged: "Cet utilisateur possède déjà un accès administrateur ou propriétaire dans cette entreprise.",
    currentAdmin: "Administrateur actif",
    noActiveAdmin: "Non désigné",
    pendingInvitation: "Invitation administrateur en attente",
    changeAdminLabel: "Désigner ou changer l’administrateur",
    changeAdminHint: "Choisissez un utilisateur. L’invitation ne sera envoyée qu’après saisie d’une raison.",
    changeAdminEmpty: "Choisir un nouvel administrateur",
    noEligibleAdmin: "Aucun autre utilisateur disponible",
    reasonLabel: "Raison du changement",
    reasonHint: "Expliquez pourquoi DTSC désigne ce nouvel administrateur. Cette raison est conservée dans l’audit.",
    reasonPlaceholder: "Ex. remplacement de l’administrateur précédent, nouvelle responsabilité…",
    sendInvitation: "Envoyer l’invitation",
    sendingInvitation: "Envoi en cours…",
    acceptanceHint: "Le nouvel administrateur devra accepter explicitement l’invitation avant que son accès administrateur devienne actif.",
  },
  en: {
    actionSaved: "Action saved.",
    actionImpossible: "The action could not be completed. Try again or review the information entered.",
    invalidForm: "Some required information is missing or invalid. Review the form and try again.",
    companyUpdated: "Company updated.",
    companyUpdatedSubscriptionFailed: "The company information was saved, but the subscription could not be updated.",
    adminInvitationSent: "Administrator invitation sent. It will remain pending until the new administrator accepts it.",
    adminReasonRequired: "Enter the reason for this change before sending the invitation.",
    adminAlreadyActive: "This user is already an active administrator of this company.",
    adminInvitationAlreadyPending: "An administrator invitation is already pending for this user.",
    adminTargetPrivileged: "This user already has administrator or owner access in this company.",
    currentAdmin: "Active administrator",
    noActiveAdmin: "Not assigned",
    pendingInvitation: "Administrator invitation pending",
    changeAdminLabel: "Assign or change administrator",
    changeAdminHint: "Choose a user. The invitation will only be sent after a reason is entered.",
    changeAdminEmpty: "Choose a new administrator",
    noEligibleAdmin: "No other user available",
    reasonLabel: "Reason for change",
    reasonHint: "Explain why DTSC is assigning this new administrator. The reason is retained in the audit trail.",
    reasonPlaceholder: "E.g. replacing the previous administrator, new responsibility…",
    sendInvitation: "Send invitation",
    sendingInvitation: "Sending…",
    acceptanceHint: "The new administrator must explicitly accept the invitation before administrator access becomes active.",
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
