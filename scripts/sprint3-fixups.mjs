import fs from "node:fs";

function replace(file, from, to, label) {
  const current = fs.readFileSync(file, "utf8");
  if (current.includes(to)) return false;
  if (!current.includes(from)) throw new Error(`Missing replacement target: ${label} in ${file}`);
  fs.writeFileSync(file, current.replace(from, to), "utf8");
  console.log(`updated: ${label}`);
  return true;
}

let changed = false;

changed = replace(
  "app/api/calendar/availabilities/[id]/route.ts",
  `    const mergedLegacy = internalCalendarAvailabilitySchema.safeParse({\n      collaboratorId: existing.collaboratorId,\n      dayOfWeek: existing.dayOfWeek,`,
  `    const mergedLegacy = internalCalendarAvailabilitySchema.safeParse({\n      dayOfWeek: existing.dayOfWeek,`,
  "remove duplicate forced collaboratorId",
) || changed;

changed = replace(
  "components/calendar/dtsc-work-schedule-panel.tsx",
  `          lang={lang}\n          text={text}\n          onClose={() => setExceptionDraft(null)}`,
  `          lang={lang}\n          text={text}\n          timezone={timezone}\n          onClose={() => setExceptionDraft(null)}`,
  "pass user timezone to exception dialog",
) || changed;

changed = replace(
  "components/calendar/dtsc-work-schedule-panel.tsx",
  `function ScheduleExceptionDialog({ mode, record, lang, text, onClose, onSaved }: { mode: "exception" | "absence"; record?: DtscScheduleExceptionItem; lang: "fr" | "en"; text: typeof copy.fr; onClose: () => void; onSaved: (item: DtscScheduleExceptionItem) => void }) {`,
  `function ScheduleExceptionDialog({ mode, record, lang, text, timezone, onClose, onSaved }: { mode: "exception" | "absence"; record?: DtscScheduleExceptionItem; lang: "fr" | "en"; text: typeof copy.fr; timezone: string; onClose: () => void; onSaved: (item: DtscScheduleExceptionItem) => void }) {`,
  "type exception dialog timezone",
) || changed;

changed = replace(
  "components/calendar/dtsc-work-schedule-panel.tsx",
  `  const startDate = record?.startDate || currentDateKey(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");`,
  `  const startDate = record?.startDate || currentDateKey(timezone);`,
  "use profile timezone for exception default date",
) || changed;

changed = replace(
  "components/calendar/dtsc-work-schedule-panel.tsx",
  `} as const;`,
  `};`,
  "widen bilingual copy value types",
) || changed;

changed = replace(
  "lib/work-schedule.ts",
  `    end: dateKey === endDate ? timeStringValue(record.endTime) : 1440,`,
  `    end: dateKey === endDate\n      ? (record.startTime === "00:00" && record.endTime === "23:59" ? 1440 : timeStringValue(record.endTime))\n      : 1440,`,
  "treat all-day exception as full local day",
) || changed;

changed = replace(
  "app/api/calendar/exceptions/route.ts",
  `  const canSeePrivateReason = requestedCollaboratorId\n    ? requestedCollaboratorId === context.calendarCollaboratorId || normalizePositionCode(context.positionCode || "") === "HR_CFO"\n    : !canViewOrganizationAvailability(context) || normalizePositionCode(context.positionCode || "") === "HR_CFO";\n  const exceptions = records\n    .map((record) => serializeScheduleException(record, canSeePrivateReason && record.collaboratorId === (requestedCollaboratorId || context.calendarCollaboratorId) || normalizePositionCode(context.positionCode || "") === "HR_CFO"))`,
  `  const isHrcfo = normalizePositionCode(context.positionCode || "") === "HR_CFO";\n  const exceptions = records\n    .map((record) => serializeScheduleException(record, isHrcfo || record.collaboratorId === context.calendarCollaboratorId))`,
  "simplify private absence reason visibility",
) || changed;

changed = replace(
  "app/api/calendar/exceptions/route.ts",
  `  canViewOrganizationAvailability,\n`,
  ``,
  "remove obsolete exception visibility import",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `  userPreferences,\n}: {\n  initialEvents: CalendarEventItem[];\n  initialAvailabilities: CalendarAvailabilityItem[];\n  collaborators: CollaboratorOption[];\n  context: { employeeId?: string | null; canViewGlobal: boolean; canViewPeopleAvailability?: boolean; canManagePeople: boolean; canOverrideConflicts: boolean };\n  userPreferences: UserDatePreferences;\n}) {`,
  `  userPreferences,\n  showLegacyAvailabilityEditor = true,\n}: {\n  initialEvents: CalendarEventItem[];\n  initialAvailabilities: CalendarAvailabilityItem[];\n  collaborators: CollaboratorOption[];\n  context: { employeeId?: string | null; canViewGlobal: boolean; canViewPeopleAvailability?: boolean; canManagePeople: boolean; canManagePeopleAvailability?: boolean; canOverrideConflicts: boolean; dtscScheduleProjection?: boolean };\n  userPreferences: UserDatePreferences;\n  showLegacyAvailabilityEditor?: boolean;\n}) {`,
  "separate legacy availability editor policy",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `  function canManageAvailability(availability: CalendarAvailabilityItem) {\n    return context.canManagePeople || availability.collaboratorId === context.employeeId;\n  }`,
  `  function canManageAvailability(availability: CalendarAvailabilityItem) {\n    return Boolean(context.canManagePeopleAvailability) || availability.collaboratorId === context.employeeId;\n  }`,
  "separate availability write from people management",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `            <Button type="button" variant="outline" onClick={() => setAvailabilityFormOpen(true)} className="max-w-full rounded-2xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">\n              <Clock className="h-4 w-4" />\n              {translate(locale, "calendar.availability")}\n            </Button>`,
  `            {showLegacyAvailabilityEditor && (\n              <Button type="button" variant="outline" onClick={() => setAvailabilityFormOpen(true)} className="max-w-full rounded-2xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">\n                <Clock className="h-4 w-4" />\n                {translate(locale, "calendar.availability")}\n              </Button>\n            )}`,
  "hide legacy mixed availability creation in DTSC",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `          {(["today", "week", "month", "collaborator", "department", "conflicts", "availability"]).map((view) => (`,
  `          {(showLegacyAvailabilityEditor\n            ? ["today", "week", "month", "collaborator", "department", "conflicts", "availability"]\n            : ["today", "week", "month", "collaborator", "department", "conflicts"]\n          ).map((view) => (`,
  "hide legacy availability tab in DTSC",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `          context={context}\n          locale={locale}\n          onClose={() => setAvailabilityFormOpen(false)}`,
  `          context={{ ...context, canManagePeople: Boolean(context.canManagePeopleAvailability) }}\n          locale={locale}\n          onClose={() => setAvailabilityFormOpen(false)}`,
  "scope new legacy availability form ownership",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `          context={context}\n          locale={locale}\n          onClose={() => setEditingAvailability(null)}`,
  `          context={{ ...context, canManagePeople: Boolean(context.canManagePeopleAvailability) }}\n          locale={locale}\n          onClose={() => setEditingAvailability(null)}`,
  "scope legacy availability edit ownership",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `  context: { employeeId?: string | null; canManagePeople: boolean; canOverrideConflicts: boolean };`,
  `  context: { employeeId?: string | null; canManagePeople: boolean; canOverrideConflicts: boolean; dtscScheduleProjection?: boolean };`,
  "type DTSC event schedule projection flag",
) || changed;

changed = replace(
  "components/calendar/internal-calendar-module.tsx",
  `            {["Tâche", "Réunion", "Mission", "Absence", "Congé", "Télétravail", "Présence sur site", "Appel audio", "Appel vidéo", "Formation", "Blocage", "Deadline", "Autre"].map((type) => <option key={type}>{type}</option>)}`,
  `            {(context.dtscScheduleProjection\n              ? ["Tâche", "Réunion", "Appel audio", "Appel vidéo", "Blocage", "Deadline", "Autre"]\n              : ["Tâche", "Réunion", "Mission", "Absence", "Congé", "Télétravail", "Présence sur site", "Appel audio", "Appel vidéo", "Formation", "Blocage", "Deadline", "Autre"]\n            ).map((type) => <option key={type}>{type}</option>)}`,
  "remove duplicated schedule source event types in DTSC",
) || changed;

changed = replace(
  "app/calendar/page.tsx",
  `            canViewPeopleAvailability: context.canViewPeopleAvailability,\n            canManagePeople: context.canManagePeople,\n            canOverrideConflicts: context.canOverrideConflicts,\n          }}\n          userPreferences={{ locale: user.locale, timezone: user.timezone, dateFormat: user.dateFormat }}\n        />`,
  `            canViewPeopleAvailability: context.canViewPeopleAvailability,\n            canManagePeople: context.canManagePeople,\n            canManagePeopleAvailability: !context.dtscInternal && context.canManagePeople,\n            canOverrideConflicts: context.canOverrideConflicts,\n            dtscScheduleProjection: context.dtscInternal,\n          }}\n          userPreferences={{ locale: user.locale, timezone: user.timezone, dateFormat: user.dateFormat }}\n          showLegacyAvailabilityEditor={!context.dtscInternal}\n        />`,
  "wire DTSC read/write UI separation",
) || changed;

console.log(changed ? "Sprint 3 fixups applied." : "Sprint 3 fixups already applied.");
