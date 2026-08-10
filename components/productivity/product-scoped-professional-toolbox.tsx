"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getCurrentHostType, type HostType } from "@/lib/domains";

const ProfessionalToolbox = dynamic(
  () => import("@/components/productivity/professional-toolbox-v2").then((module) => module.ProfessionalToolboxV2),
  { ssr: false },
);

function isToolboxHostEnabled(hostType: HostType | null) {
  return hostType === "app" || hostType === "console" || hostType === "support" || hostType === "local";
}

export function ProductScopedProfessionalToolbox() {
  const [hostType, setHostType] = useState<HostType | null>(null);

  useEffect(() => {
    setHostType(getCurrentHostType(window.location.host));
  }, []);

  if (!isToolboxHostEnabled(hostType)) {
    return null;
  }

  return <ProfessionalToolbox />;
}
