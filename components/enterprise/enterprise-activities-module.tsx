"use client";

import { useMemo, useState } from "react";
import { Accordion } from "@/components/ui/accordion";
import {
  EnterpriseActivitiesDashboard,
  EnterpriseActivityBlocksPanel,
  EnterpriseActivityFormDialog,
  EnterpriseHealthcareActivitiesPanel,
  EnterpriseRequestsPanel,
  EnterpriseWorkflowsPanel,
} from "@/components/enterprise/enterprise-activities-panels";
import type { EnterpriseActivitiesDataset } from "@/lib/enterprise/enterprise-activities-types";

export function EnterpriseActivitiesModule({ organization, blocks, requests, members, sectorRecords, workflows }: EnterpriseActivitiesDataset) {
  const [selectedBlockCode, setSelectedBlockCode] = useState(blocks[0]?.blockCode || "");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const selectedBlock = useMemo(() => blocks.find((block) => block.blockCode === selectedBlockCode) || null, [blocks, selectedBlockCode]);

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <EnterpriseActivitiesDashboard organization={organization} />

      <Accordion>
        <EnterpriseActivityBlocksPanel
          blocks={blocks}
          selectedBlockCode={selectedBlockCode}
          selectedBlock={selectedBlock}
          onSelectBlock={setSelectedBlockCode}
          onOpenForm={() => setFormOpen(true)}
        />
        <EnterpriseHealthcareActivitiesPanel sectorRecords={sectorRecords} />
        <EnterpriseWorkflowsPanel workflows={workflows} />
        <EnterpriseRequestsPanel requests={requests} />
      </Accordion>

      <EnterpriseActivityFormDialog
        organization={organization}
        selectedBlockCode={selectedBlockCode}
        selectedBlock={selectedBlock}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        members={members}
        sectorRecords={sectorRecords}
        onMessage={setMessage}
      />

      {message && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-bold text-dtsc-blue">{message}</p>}
    </div>
  );
}
