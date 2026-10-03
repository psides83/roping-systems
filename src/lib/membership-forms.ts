export type MembershipFieldType =
  | "text"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "textarea"
  | "checkbox";

export interface StandardMembershipField {
  key: string;
  label: string;
  type: MembershipFieldType;
  options?: string[];
}

export interface SelectedMembershipField {
  key: string;
  required: boolean;
}

export interface CustomMembershipField {
  id: string;
  label: string;
  type: MembershipFieldType;
  required: boolean;
  options: string[];
}

export interface CustomMembershipSection {
  id: string;
  title: string;
  details: string;
  fields: CustomMembershipField[];
}

export const standardMembershipFields: StandardMembershipField[] = [
  { key: "first_name", label: "First name", type: "text" },
  { key: "last_name", label: "Last name", type: "text" },
  { key: "birth_date", label: "Birth date", type: "date" },
  {
    key: "competition_gender",
    label: "Competition gender",
    type: "select",
    options: ["Female", "Male"],
  },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Primary phone", type: "phone" },
  { key: "secondary_phone", label: "Secondary phone", type: "phone" },
  { key: "street_address", label: "Street address", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "postal_code", label: "ZIP code", type: "text" },
  { key: "member_number", label: "Existing member number", type: "text" },
  {
    key: "jacket_size",
    label: "Jacket size",
    type: "select",
    options: [
      "Youth S",
      "Youth M",
      "Youth L",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "2XL",
      "3XL",
    ],
  },
  {
    key: "completer_role",
    label: "Applicant, parent, or guardian",
    type: "select",
    options: ["Applicant", "Parent", "Guardian"],
  },
  { key: "completer_name", label: "Person completing form", type: "text" },
];

export function getStandardMembershipField(key: string) {
  return standardMembershipFields.find((field) => field.key === key);
}
