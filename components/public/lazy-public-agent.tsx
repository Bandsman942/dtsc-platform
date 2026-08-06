"use client";

import dynamic from "next/dynamic";

const DtscAgentWidget = dynamic(() => import("@/components/public/dtsc-agent-widget").then((entry) => entry.DtscAgentWidget), { ssr: false });

export function LazyPublicAgent() { return <DtscAgentWidget />; }
