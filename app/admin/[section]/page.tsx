import { DtscConsolePage } from "@/app/admin/console-page";

export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { section } = await params;
  return DtscConsolePage({ forcedSection: section, searchParams });
}
