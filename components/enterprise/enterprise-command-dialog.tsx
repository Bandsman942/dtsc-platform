"use client";

import { useEffect, useRef } from "react";
import { EnterpriseQuickAccess } from "@/components/enterprise/enterprise-quick-access";
import { Dialog } from "@/components/ui/dialog";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";

export function EnterpriseCommandDialog({
  organizationId,
  userId,
  activeOrganizationRole,
  locale,
  modules,
  focusSearch,
  onClose,
}: {
  organizationId: string;
  userId: string;
  activeOrganizationRole?: string | null;
  locale?: string | null;
  modules: EnterpriseNavigationModule[];
  focusSearch: boolean;
  onClose: () => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusSearch) return;
    // Keyboard shortcut may focus its search control after the dialog focus trap
    // is mounted. Touch opening intentionally does not invoke the virtual keyboard.
    const timer = window.setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), 90);
    return () => window.clearTimeout(timer);
  }, [focusSearch]);

  return (
    <Dialog
      open
      title={locale === "en" ? "Search ERP modules" : "Rechercher dans les modules ERP"}
      description={locale === "en"
        ? "Only modules you can access in this organization appear."
        : "Seuls les modules autorisés dans cette entreprise sont proposés."}
      onClose={onClose}
      className="max-w-3xl"
    >
      <EnterpriseQuickAccess
        organizationId={organizationId}
        userId={userId}
        activeOrganizationRole={activeOrganizationRole}
        modules={modules}
        locale={locale}
        searchInputRef={searchInputRef}
      />
    </Dialog>
  );
}
