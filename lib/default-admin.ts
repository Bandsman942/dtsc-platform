import { UserRole, UserStatus } from "@prisma/client";
import { defaultAdmin } from "@/lib/dtsc";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security";

export async function ensureDefaultAdmin(email: string, password: string) {
  const adminEmail = defaultAdmin.email.toLowerCase();
  if (email.toLowerCase() !== adminEmail || password !== defaultAdmin.password) {
    return;
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });

  if (existingAdmin) {
    return;
  }

  await prisma.user.create({
    data: {
      name: "Administrateur DTSC",
      email: adminEmail,
      passwordHash: hashPassword(defaultAdmin.password),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      companyName: "DTSC",
      phone: "+243971935917",
    },
  });
}
