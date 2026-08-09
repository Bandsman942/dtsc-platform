"use client";

import { useEffect, useMemo, useState } from "react";
import { detectRetailBrowserDeviceCapabilities, evaluateRetailDeviceAvailability } from "@/lib/enterprise/retail/device-capabilities";
import { customerFacingDeviceType } from "@/lib/customer-facing-language";

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
    ? {
        title: "Checkout equipment",
        subtitle: "See which connected tools are ready to use at this point of sale.",
        ready: "Ready",
        degraded: "Alternative available",
        unavailable: "Needs attention",
        manual: "Manual use available",
        bridge: "Connected through companion software",
      }
    : {
        title: "Équipements d’encaissement",
        subtitle: "Vérifiez rapidement quels équipements sont prêts à être utilisés sur ce point de vente.",
        ready: "Prêt",
        degraded: "Alternative disponible",
        unavailable: "À vérifier",
        manual: "Utilisation manuelle possible",
        bridge: "Connecté via le logiciel compagnon",
      };

  return (
    <section className="rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm" aria-label={labels.title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.subtitle}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{devices.length}</span>
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
            <div key={device.id} className="min-w-[190px] rounded-xl border border-border/60 bg-background/80 px-3 py-2.5">
              <div className="truncate text-sm font-semibold">{device.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{customerFacingDeviceType(device.deviceType, locale)}</div>
              <div className="mt-2 text-xs font-semibold text-foreground">{statusLabel}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
