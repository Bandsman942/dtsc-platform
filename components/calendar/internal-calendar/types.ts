import type { CalendarWorkspaceKey } from "@/lib/i18n";

export type ProfessionalCalendarParticipant = {
  id: string;
  collaboratorId: string;
  participantStatus: string;
  responseStatus: string;
  role: string;
};

export type ProfessionalCalendarConflict = {
  id: string;
  collaboratorId: string;
  conflictType: string;
  severity: string;
  message: string;
  resolved: boolean;
};

export type ProfessionalCalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  eventType: string;
  startDateTime: string;
  endDateTime: string;
  status: string;
  priority: string;
  locationMode: string;
  physicalLocation?: string | null;
  meetingLink?: string | null;
  sourceModule?: string | null;
  ownerCollaboratorId?: string | null;
  departmentId?: string | null;
  visibility: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ProfessionalCalendarParticipant[];
  conflicts: ProfessionalCalendarConflict[];
};

export type ProfessionalAvailability = {
  id: string;
  collaboratorId: string;
  dayOfWeek?: number | null;
  specificDate?: string | null;
  startTime: string;
  endTime: string;
  availabilityStatus: string;
  recurrenceType: string;
  recurrenceStart?: string | null;
  recurrenceUntil?: string | null;
  recurrenceInterval?: number | null;
  locationMode: string;
  notes?: string | null;
};

export type ProfessionalCalendarCollaborator = {
  id: string;
  fullName: string;
  email?: string | null;
  department: string;
  departmentId?: string | null;
  jobTitle: string;
  userId?: string | null;
};

export type CalendarContext = {
  employeeId: string;
  userId: string;
  canViewGlobal: boolean;
  canViewPeopleAvailability?: boolean;
  canOverrideConflicts: boolean;
  dtscScheduleProjection?: boolean;
};

export type CalendarWorkspaceText = Record<CalendarWorkspaceKey, string>;
export type EventTemplate = { eventType?: string; participantIds?: string[]; title?: string };
export type DatePreset = "today" | "week" | "month" | "year" | "custom";
export type AvailabilityView = "list" | "collaborators" | "statuses";
export type CalendarView = "mine" | "team" | "invitations" | "availability";
