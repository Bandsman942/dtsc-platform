export type PayrollWorkEntry = {
  id: string;
  workDate: string;
  approvedMinutes: number;
  summary: string;
  workType: string;
  submissionId: string;
};

export type PayrollReviewItem = {
  id: string;
  action: string;
  comment: string | null;
  actorEmployeeId: string;
  actorName: string;
  createdAt: string;
};

export type PayrollWorkflowItem = {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  isLegacy: boolean;
  workflowVersion: number | null;
  grossAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  netAmount: number;
  bonusReason: string | null;
  deductionReason: string | null;
  baseAmountSource: string | null;
  baseAmountOverride: number | null;
  baseAmountOverrideReason: string | null;
  workCoverage: string | null;
  workCoverageExceptionReason: string | null;
  approvedWorkMinutes: number | null;
  approvedWorkEntryCount: number | null;
  approvedSubmissionCount: number | null;
  workEvidenceCapturedAt: string | null;
  requiredApproverCode: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  reviewComment: string | null;
  adjustmentEvidenceUrl: string | null;
  paymentReference: string | null;
  revision: number;
  notes: string | null;
  transactionId: string | null;
  submissionReadiness: {
    ready: boolean;
    requiredApproverCode: "CEO" | "COO";
    approverName: string | null;
    blockers: Array<{ code: string; message: string; status: number }>;
  } | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    fullName: string;
    jobTitle: string;
    positionCode: string;
    department: string;
    status: string;
    monthlyCompensation: number | null;
  };
  budget: { id: string; name: string; status: string; accountId: string | null; accountName: string | null } | null;
  account: { id: string; name: string; status: string } | null;
  preparedBy: { id: string; fullName: string; positionCode: string } | null;
  approver: { id: string; fullName: string; positionCode: string } | null;
  workEntries: PayrollWorkEntry[];
  reviewHistory: PayrollReviewItem[];
};

export type PayrollEmployeeOption = {
  id: string;
  fullName: string;
  jobTitle: string;
  positionCode: string;
  department: string;
  status: string;
  monthlyCompensation: number | null;
};

export type PayrollBudgetOption = {
  id: string;
  name: string;
  status: string;
  amount: number;
  spentAmount: number;
  accountId: string | null;
  accountName: string | null;
};
