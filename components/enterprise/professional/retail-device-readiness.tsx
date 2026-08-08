"use client";

import { useEffect, useMemo, useState } from "react";
import { detectRetailBrowserDeviceCapabilities, evaluateRetailDeviceAvailability } from "@/lib/enterprise/retail/device-capabilities";

type Device = {
  id: string;
  code: string;
  name: string;
  deviceType: string;
  connectionMode: string;
  status: string;
};

type Props = { organizationId: string; locale?: "fr" | "en" };

export function RetailDeviceReadiness({ organizationId, locale = "fr" }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const capabilities = useMemo(() => detectRetailBrowserDeviceCapabilities(), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/devices`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("devices unavailable");
        return response.json() as Promise<{ items?: Device[] }>;
      })
      .then((payload) => {
        if (!cancelled) setDevices(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [organizationId]);

  if (!loaded || failed || devices.length === 0) return null;

  const labels = locale === "en"
    ? { title: "POS devices", ready: "Ready", degraded: "Fallback", unavailable: "Unavailable", manual: "Manual mode", bridge: "External bridge" }
    : { title: "Périphériques POS", ready: "Disponible", degraded: "Mode dégradé", unavailable: "Indisponible", manual: "Mode manuel", bridge: "Pont externe" };

  return (
    <section className="rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm" aria-label={labels.title}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{labels.title}</h2>
        <span className="text-xs text-muted-foreground">{devices.length}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {devices.map((device) => {
          const state = evaluateRetailDeviceAvailability(device, capabilities);
          const statusLabel = state.reason === "MANUAL_FALLBACK"
            ? labels.manual
            : state.reason === "EXTERNAL_BRIDGE"
              ? labels.bridge
              : state.available && !state.degraded
                ? labels.ready
                : state.degraded
                  ? labels.degraded
                  : labels.unavailable;
          return (
            <div key={device.id} className="min-w-[180px] rounded-xl border border-border/60 bg-background/80 px-3 py-2">
              <div className="truncate text-sm font-medium">{device.name}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{device.deviceType.replaceAll("_", " ")}</span>
                <span>{statusLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
