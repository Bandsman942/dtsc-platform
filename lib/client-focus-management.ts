/** Shared keyboard focus rules for DTSC's nested, client-rendered modal surfaces. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) =>
    element.getClientRects().length > 0 && !element.closest('[inert], [aria-hidden="true"]'),
  );
}

/** Portalled dialogs are appended after their parent workspace, so the last visible modal owns focus. */
export function isTopmostModal(container: HTMLElement | null): boolean {
  if (!container) return false;
  const modals = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter((element) =>
    element.getClientRects().length > 0,
  );
  return modals[modals.length - 1] === container;
}

export function containModalTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!active || !container.contains(active) || !focusable.includes(active as HTMLElement) && active !== container) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
  } else if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}
