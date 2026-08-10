import fs from "node:fs";

const path = "prisma/schema.prisma";
let schema = fs.readFileSync(path, "utf8");

if (schema.includes("model AiToolConfirmation {") || schema.includes("model AiToolExecution {")) {
  throw new Error("AI06_TOOL_MODELS_ALREADY_PRESENT");
}

const anchor = "model CommercialMaturityEvidence {";
if (!schema.includes(anchor)) throw new Error("AI06_SCHEMA_ANCHOR_NOT_FOUND");

const models = `model AiToolConfirmation {
  id             String   @id @default(cuid())
  userId         String
  organizationId String?
  conversationId String?
  turnId         String?
  toolCode       String
  argumentsHash  String
  argumentsJson  Json?
  status         String   @default("PENDING")
  expiresAt      DateTime
  confirmedAt    DateTime?
  cancelledAt    DateTime?
  consumedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, organizationId, toolCode, status, createdAt])
  @@index([conversationId, turnId, createdAt])
  @@index([expiresAt, status])
}

model AiToolExecution {
  id                  String   @id @default(cuid())
  userId              String
  organizationId      String?
  conversationId      String?
  turnId              String?
  toolCode            String
  toolMode            String
  argumentsHash       String
  confirmationId      String?
  idempotencyScopeKey String   @unique
  status              String   @default("STARTED")
  reasonCode          String?
  resultJson          Json?
  auditLevel          String   @default("STANDARD")
  startedAt           DateTime @default(now())
  completedAt         DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([userId, organizationId, toolCode, createdAt])
  @@index([conversationId, turnId, createdAt])
  @@index([status, reasonCode, createdAt])
}

`;

schema = schema.replace(anchor, `${models}${anchor}`);
fs.writeFileSync(path, schema);
console.log("AI06 Tool Gateway models synchronized into prisma/schema.prisma");
