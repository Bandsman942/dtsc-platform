import { CalendarOff, Pencil, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  absenceTypes,
  dateRangeLabel,
  effectivePeriodLabel,
  exceptionLabel,
  locationModeLabel,
  type DtscScheduleExceptionItem,
  type DtscWeeklyAvailabilityItem,
  type ScheduleText,
} from "@/components/calendar/dtsc-work-schedule/model";

export function ScheduleExceptionList({
  items,
  locale,
  text,
  onEdit,
  onDelete,
}: {
  items: DtscScheduleExceptionItem[];
  locale: string;
  text: ScheduleText;
  onEdit: (item: DtscScheduleExceptionItem) => void;
  onDelete: (item: DtscScheduleExceptionItem) => void;
}) {
  if (!items.length) {
    return <EmptyState icon={CalendarOff} title={text.noExceptions} description={text.noExceptionsDescription} compact />;
  }

  return (
    <BusinessList>
      {items.map((item) => (
        <BusinessListItem
          key={item.id}
          title={exceptionLabel(item.type, locale)}
          status={<StatusBadge tone={absenceTypes.has(item.type) ? "warning" : "info"}>{exceptionLabel(item.type, locale)}</StatusBadge>}
          meta={`${dateRangeLabel(item)} · ${item.allDay ? text.allDay : `${item.startTime}–${item.endTime}`} · ${locationModeLabel(item.locationMode, locale)}`}
          description={item.reason || text.privateReason}
          actions={(
            <ActionMenu
              label={text.actions}
              items={[
                { key: "edit", label: text.edit, icon: Pencil, onSelect: () => onEdit(item) },
                { key: "delete", label: text.delete, icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => onDelete(item) },
              ]}
            />
          )}
        />
      ))}
    </BusinessList>
  );
}

export function TeamScheduleReadOnly({
  weekly,
  exceptions,
  weekdays,
  locale,
  text,
}: {
  weekly: DtscWeeklyAvailabilityItem[];
  exceptions: DtscScheduleExceptionItem[];
  weekdays: string[];
  locale: string;
  text: ScheduleText;
}) {
  if (!weekly.length && !exceptions.length) {
    return <EmptyState title={text.noTeamData} description={text.noTeamDataDescription} compact />;
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-dtsc-blue">{text.weeklyTitle}</h3>
        <BusinessList>
          {weekly.map((item) => (
            <BusinessListItem
              key={item.id}
              title={`${weekdays[item.dayOfWeek ?? 0]} · ${item.startTime}–${item.endTime}`}
              meta={locationModeLabel(item.locationMode, locale)}
              description={effectivePeriodLabel(item, text)}
            />
          ))}
          {!weekly.length && <div className="py-4 text-sm text-dtsc-muted">{text.noWeekly}</div>}
        </BusinessList>
      </div>
      <div className="min-w-0">
        <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-dtsc-blue">{text.exceptionsAndAbsences}</h3>
        <BusinessList>
          {exceptions.map((item) => (
            <BusinessListItem
              key={item.id}
              title={exceptionLabel(item.type, locale)}
              status={<StatusBadge tone={absenceTypes.has(item.type) ? "warning" : "info"}>{exceptionLabel(item.type, locale)}</StatusBadge>}
              meta={`${dateRangeLabel(item)} · ${item.allDay ? text.allDay : `${item.startTime}–${item.endTime}`}`}
              description={text.reasonProtected}
            />
          ))}
          {!exceptions.length && <div className="py-4 text-sm text-dtsc-muted">{text.noExceptions}</div>}
        </BusinessList>
      </div>
    </div>
  );
}
