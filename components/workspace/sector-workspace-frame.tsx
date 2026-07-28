import type { ReactNode } from "react";
import styles from "./sector-workspace-frame.module.css";

export function SectorWorkspaceFrame({ children, variant }: { children: ReactNode; variant: "health" }) {
  return <div className={variant === "health" ? styles.healthFrame : undefined}>{children}</div>;
}
