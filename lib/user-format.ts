export type UserDatePreferences = {
  locale?: string | null;
  timezone?: string | null;
  dateFormat?: string | null;
};

export function userLocale(preferences?: UserDatePreferences) {
  return preferences?.locale === "en" ? "en-US" : "fr-FR";
}

export function userTimeZone(preferences?: UserDatePreferences) {
  return preferences?.timezone || "Africa/Kinshasa";
}

export function formatUserDateTime(value: string | Date, preferences?: UserDatePreferences, options?: Intl.DateTimeFormatOptions) {
  const date = typeof value === "string" ? new Date(value) : value;
  const format = preferences?.dateFormat || "FR";
  const hour12 = format === "US";
  const base: Intl.DateTimeFormatOptions =
    format === "ISO"
      ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12 }
      : format === "LONG"
        ? { weekday: "long", year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12 }
        : { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12 };

  return new Intl.DateTimeFormat(userLocale(preferences), {
    ...base,
    ...options,
    timeZone: userTimeZone(preferences),
  }).format(date);
}

export function formatUserTime(value: string | Date, preferences?: UserDatePreferences) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(userLocale(preferences), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: preferences?.dateFormat === "US",
    timeZone: userTimeZone(preferences),
  }).format(date);
}

export function formatRelativeUserDateTime(value: string | Date, preferences?: UserDatePreferences) {
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: userTimeZone(preferences),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = dayFormatter.format(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = dayFormatter.format(yesterday);
  const dateKey = dayFormatter.format(date);
  const time = formatUserTime(date, preferences);

  if (dateKey === todayKey) {
    return preferences?.locale === "en" ? `Today at ${time}` : `Aujourd'hui à ${time}`;
  }
  if (dateKey === yesterdayKey) {
    return preferences?.locale === "en" ? `Yesterday at ${time}` : `Hier à ${time}`;
  }
  return formatUserDateTime(date, preferences);
}
