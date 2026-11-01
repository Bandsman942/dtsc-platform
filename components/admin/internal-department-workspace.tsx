import type { ReactNode } from "react";
import { translate } from "@/lib/i18n";
import { InternalDepartmentWorkspaceClient } from "@/components/admin/internal-department-workspace-client";

type DepartmentSection = { id: string; titleKey: string; content: ReactNode };

/** Keep translation and authorized RSC content at the console's server boundary. */
export function InternalDepartmentWorkspace({
  locale,
  sections,
}: {
  locale: string | null | undefined;
  sections: DepartmentSection[];
}) {
  return (
    <InternalDepartmentWorkspaceClient
      locale={locale}
      navigationLabel={translate(locale, "console.internalSections.navigation")}
      sections={sections.map((item) => ({
        id: item.id,
        title: translate(locale, `console.internalSections.${item.titleKey}`),
        content: item.content,
      }))}
    />
  );
}
