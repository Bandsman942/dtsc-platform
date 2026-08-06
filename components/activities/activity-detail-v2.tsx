import { ActivityDetail } from "@/components/activities/activity-detail";
import type { ActivityItem, CollaboratorOption } from "@/components/activities/activity-types";
import { OperationalChecklistPanel } from "@/components/operations/operational-checklist-panel";
import type { OperationalObjectType } from "@/lib/operational-access";

const CHECKLIST_OBJECT_TYPES: Partial<Record<ActivityItem["entityType"], OperationalObjectType>> = {
  TASK: "TASK",
  OPERATION: "OPERATION",
  DEPARTMENT_REQUEST: "DEPARTMENT_REQUEST",
  BLOCKER: "BLOCKER",
  MEETING: "MEETING",
  COLLAB_REQUEST: "COLLAB_REQUEST",
  CEO_OBJECTIVE: "CEO_OBJECTIVE",
  CEO_SUPERVISION: "CEO_SUPERVISION",
  SCO_PURCHASE_REQUEST: "SCO_PURCHASE_REQUEST",
  SCO_LOGISTICS: "SCO_LOGISTICS",
  MPO_PROJECT: "MPO_PROJECT",
  MPO_RECORD: "MPO_RECORD",
  CTO_PROJECT: "CTO_PROJECT",
  CTO_RECORD: "CTO_RECORD",
};

export function ActivityDetailV2({
  item,
  collaborators,
  currentUserId,
  currentUserRole,
  onChanged,
}: {
  item: ActivityItem;
  collaborators: CollaboratorOption[];
  currentUserId: string;
  currentUserRole: string;
  onChanged?: () => void;
}) {
  const checklistObjectType = CHECKLIST_OBJECT_TYPES[item.entityType];
  return (
    <div className="min-w-0 space-y-5">
      {checklistObjectType ? (
        <OperationalChecklistPanel
          objectType={checklistObjectType}
          objectId={item.id}
          title="Tâches et résultats à réaliser"
        />
      ) : null}
      <ActivityDetail
        item={item}
        collaborators={collaborators}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        onChanged={onChanged}
      />
    </div>
  );
}
