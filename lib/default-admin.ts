import { UserRole, UserStatus } from "@prisma/client";
import { defaultAdmin } from "@/lib/dtsc";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security";

export async function ensureDefaultAdmin(email: string, password: string) {
  if (!env.DEFAULT_ADMIN_BOOTSTRAP_ENABLED) return;

  const adminEmail = defaultAdmin.email?.trim().toLowerCase();
  const adminPassword = defaultAdmin.password;
  if (!adminEmail || !adminPassword) {
    throw new Error("DEFAULT_ADMIN_BOOTSTRAP_ENABLED requires DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD");
  }
  if (adminPassword.length < 16) {
    throw new Error("DEFAULT_ADMIN_PASSWORD must contain at least 16 characters");
  }
  if (email.toLowerCase() !== adminEmail || password !== adminPassword) return;

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existingAdmin) return;

  await prisma.user.create({
    data: {
      name: "Administrateur DTSC",
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      companyName: "DTSC",
      phone: "+243971935917",
    },
  });
}
