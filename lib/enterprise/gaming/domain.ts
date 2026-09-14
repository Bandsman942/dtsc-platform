export const GAMING_SECTOR_CODE = "HOSPITALITY_EVENTS" as const;
export const GAMING_BUSINESS_SUBTYPE_CODE = "GAMING_LOUNGE" as const;

export const GAMING_MODULE_CODES = [
  "GAMING_DASHBOARD",
  "GAMING_STATIONS",
  "GAMING_SESSIONS",
  "GAMING_BOOKINGS",
  "GAMING_PRICING_PACKAGES",
  "GAMING_CHECKOUT",
  "GAMING_DAILY_CLOSE",
  "GAMING_TOURNAMENTS",
  "GAMING_REPORTS",
] as const;
export type GamingModuleCode = (typeof GAMING_MODULE_CODES)[number];

export const GAMING_STATION_PERMISSIONS = [
  "enterprise.gaming.stations.read",
  "enterprise.gaming.stations.create",
  "enterprise.gaming.stations.update",
  "enterprise.gaming.stations.manage",
] as const;
export type GamingStationPermission = (typeof GAMING_STATION_PERMISSIONS)[number];

export const GAMING_SESSION_PERMISSIONS = [
  "enterprise.gaming.sessions.read",
  "enterprise.gaming.sessions.create",
  "enterprise.gaming.sessions.update",
  "enterprise.gaming.sessions.manage",
] as const;
export type GamingSessionPermission = (typeof GAMING_SESSION_PERMISSIONS)[number];

export const GAMING_BOOKING_PERMISSIONS = [
  "enterprise.gaming.bookings.read",
  "enterprise.gaming.bookings.create",
  "enterprise.gaming.bookings.update",
  "enterprise.gaming.bookings.manage",
] as const;
export type GamingBookingPermission = (typeof GAMING_BOOKING_PERMISSIONS)[number];

export const GAMING_STATION_STATUSES = [
  "AVAILABLE",
  "IN_USE",
  "RESERVED",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;
export type GamingStationStatus = (typeof GAMING_STATION_STATUSES)[number];

export const GAMING_SESSION_STATUSES = [
  "WAITING",
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "TO_CHECKOUT",
  "PAID",
  "CANCELLED",
] as const;
export type GamingSessionStatus = (typeof GAMING_SESSION_STATUSES)[number];

export const GAMING_SESSION_ACTIONS = [
  "START",
  "PAUSE",
  "RESUME",
  "EXTEND",
  "TRANSFER",
  "END",
] as const;
export type GamingSessionAction = (typeof GAMING_SESSION_ACTIONS)[number];

export const GAMING_BOOKING_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "CHECKED_IN",
  "NO_SHOW",
  "CANCELLED",
  "CONVERTED",
] as const;
export type GamingBookingStatus = (typeof GAMING_BOOKING_STATUSES)[number];

export const GAMING_BOOKING_ACTIONS = [
  "CREATE",
  "UPDATE",
  "CONFIRM",
  "CHECK_IN",
  "NO_SHOW",
  "CANCEL",
  "CONVERT",
] as const;
export type GamingBookingAction = (typeof GAMING_BOOKING_ACTIONS)[number];

export const GAMING_PRICING_MODES = [
  "FIXED_DURATION",
  "PER_MINUTE",
  "PER_HOUR",
  "PACKAGE",
] as const;
export type GamingPricingMode = (typeof GAMING_PRICING_MODES)[number];

function normalizeCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() || "";
}

export function isGamingLoungeSubtype(
  sectorCode: string | null | undefined,
  businessSubtypeCode: string | null | undefined,
) {
  return (
    normalizeCode(sectorCode) === GAMING_SECTOR_CODE &&
    normalizeCode(businessSubtypeCode) === GAMING_BUSINESS_SUBTYPE_CODE
  );
}

export function isGamingModuleCode(value: string | null | undefined): value is GamingModuleCode {
  const normalized = normalizeCode(value);
  return GAMING_MODULE_CODES.includes(normalized as GamingModuleCode);
}
