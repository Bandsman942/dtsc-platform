"use client";

import { Gauge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFloatingAction } from "@/components/floating-actions/floating-action-hub";

export function CtoScalabilityFloatingAction({ label }: { label: string }) {
  const router = useRouter();

  useFloatingAction({
    id: "cto-scalability",
    label,
    icon: Gauge,
    order: 8,
    onSelect: () => router.push("/admin/cto/scalability"),
  });

  return null;
}
