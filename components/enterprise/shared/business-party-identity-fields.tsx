"use client";

import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalFormSection } from "@/components/enterprise/professional/professional-erp-ui";
import { Input } from "@/components/ui/input";

export type BusinessPartyIdentityLabels = {
  identityTitle: string;
  identityDescription: string;
  contactTitle: string;
  contactDescription: string;
  partyType: string;
  personType: string;
  organizationType: string;
  legalNamePerson: string;
  legalNameOrganization: string;
  displayName: string;
  taxIdentifier: string;
  registrationId: string;
  primaryEmail: string;
  primaryPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  countryCode: string;
};

export function BusinessPartyIdentityFields({
  partyType,
  onPartyTypeChange,
  labels,
}: {
  partyType: "PERSON" | "ORGANIZATION";
  onPartyTypeChange: (value: "PERSON" | "ORGANIZATION") => void;
  labels: BusinessPartyIdentityLabels;
}) {
  return <>
    <ProfessionalFormSection title={labels.identityTitle} description={labels.identityDescription}>
      <Field label={labels.partyType} required>
        <NativeSelect
          value={partyType}
          onChange={(value) => onPartyTypeChange(value as "PERSON" | "ORGANIZATION")}
          items={[
            { id: "PERSON", label: labels.personType },
            { id: "ORGANIZATION", label: labels.organizationType },
          ]}
        />
      </Field>
      <Field label={partyType === "PERSON" ? labels.legalNamePerson : labels.legalNameOrganization} required>
        <Input name="legalName" required minLength={2} />
      </Field>
      <Field label={labels.displayName}><Input name="displayName" /></Field>
      {partyType === "ORGANIZATION" ? <>
        <Field label={labels.taxIdentifier}><Input name="taxIdentifier" /></Field>
        <Field label={labels.registrationId}><Input name="registrationId" /></Field>
      </> : null}
    </ProfessionalFormSection>
    <ProfessionalFormSection title={labels.contactTitle} description={labels.contactDescription}>
      <Field label={labels.primaryEmail}><Input name="primaryEmail" type="email" /></Field>
      <Field label={labels.primaryPhone}><Input name="primaryPhone" /></Field>
      <Field label={labels.addressLine1}><Input name="addressLine1" /></Field>
      <Field label={labels.addressLine2}><Input name="addressLine2" /></Field>
      <Field label={labels.city}><Input name="city" /></Field>
      <Field label={labels.stateProvince}><Input name="stateProvince" /></Field>
      <Field label={labels.postalCode}><Input name="postalCode" /></Field>
      <Field label={labels.countryCode}><Input name="countryCode" maxLength={3} /></Field>
    </ProfessionalFormSection>
  </>;
}
