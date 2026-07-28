export type ActivityEntityType = "TASK" | "OPERATION" | "DEPARTMENT_REQUEST" | "BLOCKER" | "MEETING" | "REPORT" | "WORKFLOW" | "PAYROLL" | "CEO_OBJECTIVE" | "CEO_SUPERVISION" | "COLLAB_REQUEST" | "SCO_PURCHASE_REQUEST" | "SCO_VENDOR" | "SCO_MATERIAL" | "SCO_INVENTORY" | "SCO_ASSET" | "SCO_LOGISTICS" | "MPO_PROJECT" | "MPO_RECORD" | "CTO_PROJECT" | "CTO_RECORD" | "LEGAL_CASE" | "LEGAL_CONTRACT" | "LEGAL_TEMPLATE" | "LEGAL_RISK" | "LEGAL_DOCUMENT" | "LEGAL_DISPUTE" | "LEGAL_REQUEST" | "LEGAL_REPORT";

export type ActivityAttachment = {
  name: string;
  url: string;
  type?: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
};

export type ActivityItem = {
  id: string;
  entityType: ActivityEntityType;
  title: string;
  status: string;
  detail: string;
  body?: string | null;
  requestMessage?: string | null;
  requestResponse?: string | null;
  requesterName?: string | null;
  targetName?: string | null;
  canRespond?: boolean;
  date: string;
  href?: string | null;
  hrefLabel?: string | null;
  attachments?: ActivityAttachment[];
  priority?: string | null;
  progress?: number | null;
};

export type ActivitySection = {
  id: string;
  title: string;
  description: string;
  items: ActivityItem[];
};

export type CollaboratorOption = {
  id: string;
  userId?: string | null;
  label: string;
};

export type ActivityComment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  author: { id: string; name: string; role: string; avatarUrl?: string | null };
  replyTo?: { id: string; content: string; deletedAt?: string | null; author: { name: string } } | null;
  mentions?: Array<{ mentionedUser: { id: string; name: string } }>;
};
