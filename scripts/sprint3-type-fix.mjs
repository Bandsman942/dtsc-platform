import fs from "node:fs";

function replace(file, from, to, label) {
  const current = fs.readFileSync(file, "utf8");
  if (current.includes(to)) return false;
  if (!current.includes(from)) throw new Error(`Missing target: ${label} in ${file}`);
  fs.writeFileSync(file, current.replace(from, to), "utf8");
  console.log(`updated: ${label}`);
  return true;
}

let changed = false;

changed = replace(
  "app/api/calendar/availabilities/[id]/route.ts",
  `                organizationId: context.activeOrganizationId,\n                collaboratorId: context.calendarCollaboratorId,`,
  `                organizationId: context.activeOrganizationId!,\n                collaboratorId: context.calendarCollaboratorId!,`,
  "narrow organization and collaborator inside transaction callback",
) || changed;

changed = replace(
  "components/calendar/dtsc-work-schedule-panel.tsx",
  `  },\n} as const;`,
  `  },\n};`,
  "widen localized copy values",
) || changed;

changed = replace(
  "lib/internal-calendar.ts",
  `  } as CalendarContext);`,
  `  } as unknown as CalendarContext);`,
  "make synthetic conflict context cast explicit",
) || changed;

changed = replace(
  "lib/work-schedule.ts",
  `    const effectiveIntervals = blockersForDay.reduce((current, blocker) => subtractIntervalList(current, blocker), availableIntervals);`,
  `    const effectiveIntervals = blockersForDay.reduce<Array<{ id?: string; start: number; end: number }>>(\n      (current, blocker) => subtractIntervalList(current, blocker),\n      availableIntervals,\n    );`,
  "stabilize effective interval reduce typing",
) || changed;

console.log(changed ? "Sprint 3 type fixes applied." : "Sprint 3 type fixes already applied.");
