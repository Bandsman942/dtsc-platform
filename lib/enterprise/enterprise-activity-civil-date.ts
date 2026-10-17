/** Strict civil calendar date (YYYY-MM-DD) validation.
 *
 * An activity date is a business calendar day, not a timestamp. Do not
 * construct Date objects or convert UTC/local time zones: this would conflate
 * human-entered dates with instants and violates the ERP date-only contract.
 */
export function isValidEnterpriseActivityCivilDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}
