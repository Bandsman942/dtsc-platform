"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import {
  absenceTypeOptions,
  currentDateKey,
  exceptionLabel,
  exceptionTypes,
  locationModeLabel,
  type DtscScheduleExceptionItem,
  type DtscWeeklyAvailabilityItem,
  type ScheduleText,
} from "@/components/calendar/dtsc-work-schedule/model";

const weeklyLocationModes = ["Non défini", "Site DTSC", "Télétravail", "Hybride", "Externe"];
const exceptionLocationModes = [...weeklyLocationModes, "Mission"];

export function WeeklyAvailabilityDialog({
  record,
  isCopy,
  weekdays,
  text,
  locale,
  timezone,
  onClose,
  onSaved,
}: {
  record?: DtscWeeklyAvailabilityItem;
  isCopy: boolean;
  weekdays: string[];
  text: ScheduleText;
  locale: string;
  timezone: string;
  onClose: () => void;
  onSaved: (item: DtscWeeklyAvailabilityItem) => void;
}) {
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const today = currentDateKey(timezone);
  const effectiveFrom = !record?.effectiveFrom || record.effectiveFrom < today ? today : record.effectiveFrom;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      dayOfWeek: Number(form.get("dayOfWeek")),
      startTime: String(form.get("startTime") || ""),
      endTime: String(form.get("endTime") || ""),
      locationMode: String(form.get("locationMode") || "Non défini"),
      notes: String(form.get("notes") || ""),
      effectiveFrom: String(form.get("effectiveFrom") || today),
      effectiveUntil: String(form.get("effectiveUntil") || ""),
    };
    const endpoint = record?.id && !isCopy ? `/api/calendar/availabilities/${record.id}` : "/api/calendar/availabilities";
    const response = await fetch(endpoint, {
      method: record?.id && !isCopy ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { availability?: DtscWeeklyAvailabilityItem; message?: string } | null;
    if (!response.ok || !body?.availability) {
      setMessage(body?.message || text.saveFailed);
      return;
    }
    onSaved(body.availability);
  }

  return (
    <Dialog
      open
      title={isCopy ? text.copyTitle : record ? text.editSlot : text.newSlot}
      description={text.weeklyFormDescription}
      onClose={onClose}
      className="h-[92dvh] max-w-2xl"
    >
      <form onSubmit={submit} className="grid min-w-0 gap-4">
        <FormField label={text.dayOfWeek} hint={text.dayHint}>
          <select name="dayOfWeek" defaultValue={record?.dayOfWeek ?? 1} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.startTime}><Input name="startTime" required type="time" defaultValue={record?.startTime || "08:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.endTime}><Input name="endTime" required type="time" defaultValue={record?.endTime || "17:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label={text.locationMode} hint={text.locationHint}>
          <select name="locationMode" defaultValue={record?.locationMode || "Non défini"} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {weeklyLocationModes.map((value) => <option key={value} value={value}>{locationModeLabel(value, locale)}</option>)}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.effectiveFrom} hint={text.historyHint}><Input name="effectiveFrom" required type="date" min={today} defaultValue={effectiveFrom} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.effectiveUntil}><Input name="effectiveUntil" type="date" min={effectiveFrom} defaultValue={record?.effectiveUntil || ""} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label={text.notes}><textarea name="notes" defaultValue={record?.notes || ""} maxLength={800} className="min-h-24 w-full rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        <div className="flex flex-col justify-end gap-2 border-t border-dtsc-border pt-4 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>{text.cancel}</Button>
          <Button type="submit" className="bg-dtsc-navy text-white">{text.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ScheduleExceptionDialog({
  mode,
  record,
  locale,
  text,
  timezone,
  onClose,
  onSaved,
}: {
  mode: "exception" | "absence";
  record?: DtscScheduleExceptionItem;
  locale: string;
  text: ScheduleText;
  timezone: string;
  onClose: () => void;
  onSaved: (item: DtscScheduleExceptionItem) => void;
}) {
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const options = mode === "absence" ? absenceTypeOptions : exceptionTypes;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      type: String(form.get("type") || options[0]),
      startDate: String(form.get("startDate") || ""),
      endDate: String(form.get("endDate") || ""),
      startTime: String(form.get("startTime") || "00:00"),
      endTime: String(form.get("endTime") || "23:59"),
      allDay: form.get("allDay") === "on",
      locationMode: String(form.get("locationMode") || "Non défini"),
      reason: String(form.get("reason") || ""),
    };
    const endpoint = record ? `/api/calendar/exceptions/${record.id}` : "/api/calendar/exceptions";
    const response = await fetch(endpoint, {
      method: record ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { exception?: DtscScheduleExceptionItem; message?: string } | null;
    if (!response.ok || !body?.exception) {
      setMessage(body?.message || text.saveFailed);
      return;
    }
    onSaved(body.exception);
  }

  const startDate = record?.startDate || currentDateKey(timezone);
  return (
    <Dialog
      open
      title={record ? text.editException : mode === "absence" ? text.newAbsence : text.newException}
      description={mode === "absence" ? text.absenceFormDescription : text.exceptionFormDescription}
      onClose={onClose}
      className="h-[92dvh] max-w-2xl"
    >
      <form onSubmit={submit} className="grid min-w-0 gap-4">
        <FormField label={text.type}>
          <select name="type" defaultValue={record?.type || options[0]} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {options.map((value) => <option key={value} value={value}>{exceptionLabel(value, locale)}</option>)}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.startDate}><Input name="startDate" required type="date" defaultValue={startDate} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.endDate}><Input name="endDate" required type="date" defaultValue={record?.endDate || startDate} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-ink">
          <input name="allDay" type="checkbox" defaultChecked={record?.allDay ?? true} className="h-4 w-4" />
          {text.allDay}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={text.startTime}><Input name="startTime" required type="time" defaultValue={record?.startTime || "08:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
          <FormField label={text.endTime}><Input name="endTime" required type="time" defaultValue={record?.endTime || "17:00"} className="h-12 rounded-2xl bg-dtsc-page" /></FormField>
        </div>
        <FormField label={text.locationMode}>
          <select name="locationMode" defaultValue={record?.locationMode || "Non défini"} className="h-12 w-full rounded-2xl border border-dtsc-border bg-dtsc-page px-3 font-bold text-dtsc-ink">
            {exceptionLocationModes.map((value) => <option key={value} value={value}>{locationModeLabel(value, locale)}</option>)}
          </select>
        </FormField>
        <FormField label={text.reason} hint={text.reasonHint}><textarea name="reason" defaultValue={record?.reason || ""} maxLength={800} className="min-h-24 w-full rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" /></FormField>
        <div className="flex flex-col justify-end gap-2 border-t border-dtsc-border pt-4 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>{text.cancel}</Button>
          <Button type="submit" className="bg-dtsc-navy text-white">{text.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}
