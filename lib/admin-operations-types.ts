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
  hrefLabel?: string | null;
  values?: Record<string, string>;
};

export type OperationField = {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "date" | "textarea" | "select" | "hidden" | "preview" | "file";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string; email?: string }>;
  helperText?: string;
  readOnly?: boolean;
  previewFor?: string;
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
