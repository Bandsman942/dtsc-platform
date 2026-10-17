"use client";

// A lightweight notification, not a second CRM cache. Consumers re-fetch
// their own permission-scoped API after the server has committed the mutation.
export const ENTERPRISE_CRM_UPDATED_EVENT = "dtsc:enterprise-crm-updated";

type EnterpriseCrmUpdate = { organizationId: string; businessPartyId?: string };
const channelName = (organizationId: string) => `dtsc:enterprise-crm:${organizationId}`;

export function publishEnterpriseCrmUpdate(organizationId: string, businessPartyId?: string) {
  if (typeof window === "undefined") return;
  const detail: EnterpriseCrmUpdate = { organizationId, businessPartyId };
  window.dispatchEvent(new CustomEvent(ENTERPRISE_CRM_UPDATED_EVENT, { detail }));
  try {
    const channel = new BroadcastChannel(channelName(organizationId));
    channel.postMessage(detail);
    channel.close();
  } catch {
    // Same-tab invalidation works even when BroadcastChannel is unavailable.
  }
}

export function subscribeEnterpriseCrmUpdates(organizationId: string, onUpdate: (businessPartyId?: string) => void) {
  if (typeof window === "undefined") return () => undefined;
  const onLocalEvent = (event: Event) => {
    const detail = (event as CustomEvent<EnterpriseCrmUpdate>).detail;
    if (detail?.organizationId === organizationId) onUpdate(detail.businessPartyId);
  };
  window.addEventListener(ENTERPRISE_CRM_UPDATED_EVENT, onLocalEvent);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(channelName(organizationId));
    channel.onmessage = (message: MessageEvent<EnterpriseCrmUpdate>) => {
      if (message.data?.organizationId === organizationId) onUpdate(message.data.businessPartyId);
    };
  } catch {
    // No cross-tab channel support.
  }
  return () => {
    window.removeEventListener(ENTERPRISE_CRM_UPDATED_EVENT, onLocalEvent);
    channel?.close();
  };
}
