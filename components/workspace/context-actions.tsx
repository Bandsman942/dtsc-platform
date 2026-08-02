"use client";

import type { ElementType } from "react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";

export type BusinessContextAction = {
  id: string;
  label: string;
  icon?: ElementType;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
};

export function ContextActions({
  label,
  actions,
  orientation = "vertical",
}: {
  label: string;
  actions: BusinessContextAction[];
  orientation?: "vertical" | "horizontal";
}) {
  const items: ActionMenuItem[] = actions
    .filter((action) => !action.hidden)
    .map((action) => ({
      key: action.id,
      label: action.label,
      icon: action.icon,
      destructive: action.destructive,
      disabled: action.disabled,
      separatorBefore: action.separatorBefore,
      onSelect: action.onSelect,
    }));

  return <ActionMenu label={label} items={items} orientation={orientation} />;
}
