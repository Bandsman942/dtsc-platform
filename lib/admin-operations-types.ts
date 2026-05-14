export type OperationRecord = {
  id: string;
  title: string;
  subtitle?: string | null;
  status: string;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  createdAt: string;
  meta: string[];
  href?: string | null;
};

export type OperationField = {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "date" | "textarea" | "select" | "hidden";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string; email?: string }>;
  helperText?: string;
  readOnly?: boolean;
};

export type OperationDataset = {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  fields: OperationField[];
  statusOptions: Array<{ value: string; label: string }>;
  records: OperationRecord[];
};
