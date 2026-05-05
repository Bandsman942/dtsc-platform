import { prisma } from "@/lib/prisma";

export async function getAppSettings() {
  return prisma.appSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
}
