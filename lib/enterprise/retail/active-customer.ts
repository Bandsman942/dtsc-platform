export const RETAIL_ACTIVE_CUSTOMER_COOKIE = "dtsc-retail-customer";

export function retailActiveCustomerCookieValue(organizationId: string, customerId: string) {
  return `${organizationId}:${customerId}`;
}

export function getRetailActiveCustomerIdFromCookieHeader(cookieHeader: string | null | undefined, organizationId: string) {
  const header = cookieHeader || "";
  const value = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${RETAIL_ACTIVE_CUSTOMER_COOKIE}=`))
    ?.slice(RETAIL_ACTIVE_CUSTOMER_COOKIE.length + 1);
  if (!value) return null;
  const decoded = decodeURIComponent(value);
  const prefix = `${organizationId}:`;
  return decoded.startsWith(prefix) ? decoded.slice(prefix.length) || null : null;
}
