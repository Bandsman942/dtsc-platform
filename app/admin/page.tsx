import { DtscConsolePage } from "@/app/admin/console-page";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return DtscConsolePage({ searchParams });
}
