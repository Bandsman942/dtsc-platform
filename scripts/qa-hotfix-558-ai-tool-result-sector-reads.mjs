import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function loadStandaloneTsModule(file) {
  const source = read(file);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName: file,
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  return import(url);
}

const toolResult = await loadStandaloneTsModule("lib/ai/agent/tool-result.ts");
const assistantPolicy = await loadStandaloneTsModule("lib/ai/tools/erp-assistant-policy.ts");

const treasuryFixture = {
  toolCode: "FINANCE_TREASURY_READ",
  status: "EXECUTED",
  ok: true,
  reasonCode: null,
  result: {
    toolName: "FINANCE_TREASURY_READ",
    label: "Trésorerie",
    status: "AVAILABLE",
    summary: "Positions de trésorerie actuelles et flux confirmés récents lus par devise.",
    asOf: "2026-09-02T16:00:00.000Z",
    data: {
      accounts: {
        total: 1,
        items: [{
          code: "MM-CDF",
          name: "Mobile Money CDF",
          accountType: "MOBILE_MONEY",
          currencyCode: "CDF",
          operationalBalance: "125000",
          availableBalance: "120000",
        }],
      },
      flow: {
        periodStart: "2026-08-26T16:00:00.000Z",
        periodEnd: "2026-09-02T16:00:00.000Z",
        totals: [{ currencyCode: "CDF", direction: "IN", _sum: { amount: "43000" }, _count: { _all: 2 } }],
        items: [{
          transactionType: "MOBILE_MONEY_DEPOSIT",
          direction: "IN",
          currencyCode: "CDF",
          amount: "20000",
          transactionDate: "2026-08-31T21:36:36.044Z",
          reference: "MM-MTHRDD58-0F9D2E",
          reconciliationStatus: "UNRECONCILED",
          financialAccount: { code: "MM-CDF", name: "Mobile Money CDF", accountType: "MOBILE_MONEY" },
        }],
      },
    },
  },
  rawPayload: "must-not-leak",
  organizationId: "must-not-leak",
};

const treasurySerialized = toolResult.serializeAgentToolResult(treasuryFixture);
let treasuryParsed;
try { treasuryParsed = JSON.parse(treasurySerialized); } catch { treasuryParsed = null; }
assert(Boolean(treasuryParsed), "Treasury result must remain valid JSON");
assert(treasuryParsed?.result?.data?.flow?.items?.[0]?.amount === "20000", "Nested treasury amount must survive minimization");
assert(treasuryParsed?.result?.data?.flow?.items?.[0]?.currencyCode === "CDF", "Nested treasury currency must survive minimization");
assert(treasuryParsed?.result?.data?.flow?.items?.[0]?.transactionDate === "2026-08-31T21:36:36.044Z", "Nested treasury date must survive minimization");
assert(treasuryParsed?.result?.data?.flow?.items?.[0]?.reference === "MM-MTHRDD58-0F9D2E", "Nested treasury reference must survive minimization");
assert(treasuryParsed?.result?.data?.flow?.items?.[0]?.financialAccount?.name === "Mobile Money CDF", "Nested treasury account label must survive minimization");
assert(!treasurySerialized.includes("must-not-leak"), "Private backend fields must remain filtered");
assert(!treasurySerialized.includes("[résumé borné]"), "Normal treasury fixture must not collapse into bounded summaries");

const cashFixture = structuredClone(treasuryFixture);
cashFixture.toolCode = "FINANCE_CASH_READ";
cashFixture.result.toolName = "FINANCE_CASH_READ";
cashFixture.result.data.sessions = [{
  number: "CASH-MTDHFGSO-B79536",
  status: "OPEN",
  openingAmount: "100000",
  expectedClosingAmount: "145000",
  discrepancyAmount: "0",
  financialAccount: { code: "CASH-CDF", name: "Caisse CDF", currencyCode: "CDF" },
}];
const cashParsed = JSON.parse(toolResult.serializeAgentToolResult(cashFixture));
assert(cashParsed.result.data.sessions[0].openingAmount === "100000", "Cash session amounts must survive minimization");
assert(cashParsed.result.data.flow.items[0].amount === "20000", "Cash flow amounts must survive minimization");

const mobileMoneyFixture = {
  toolCode: "ERP_MOBILE_MONEY_READ",
  status: "EXECUTED",
  ok: true,
  result: {
    data: {
      totals: [{ currencyCode: "CDF", principalAmount: "20000", customerFeeAmount: "500", providerCommissionAmount: "300" }],
      items: [{
        number: "MM-001",
        providerCode: "AIRTEL_MONEY",
        transactionType: "DEPOSIT",
        currencyCode: "CDF",
        principalAmount: "20000",
        customerFeeAmount: "500",
        providerCommissionAmount: "300",
        cashEffectAmount: "20500",
        floatEffectAmount: "-20000",
        externalReference: "EXT-001",
        status: "CONFIRMED",
      }],
    },
  },
};
const mobileMoneyParsed = JSON.parse(toolResult.serializeAgentToolResult(mobileMoneyFixture));
assert(mobileMoneyParsed.result.data.items[0].principalAmount === "20000", "Mobile Money principal must survive serialization");
assert(mobileMoneyParsed.result.data.items[0].customerFeeAmount === "500", "Mobile Money customer fee must survive serialization");
assert(mobileMoneyParsed.result.data.items[0].providerCommissionAmount === "300", "Mobile Money provider commission must survive serialization");

const oversizedFixture = {
  result: {
    data: {
      items: Array.from({ length: 80 }, (_, index) => ({
        reference: `REF-${index}`,
        amount: String(1000 + index),
        currencyCode: "CDF",
        description: "x".repeat(4_000),
      })),
    },
  },
};
const oversizedSerialized = toolResult.serializeAgentToolResult(oversizedFixture);
assert(oversizedSerialized.length <= toolResult.AGENT_TOOL_RESULT_LIMITS.maxSerializedLength, "Serialized tool result must stay within its hard size limit");
try { JSON.parse(oversizedSerialized); } catch { failures.push("Oversized tool result must still be valid JSON"); }

const commonAssistants = assistantPolicy.assistantCodesForErpModule("CRM_PIPELINE");
for (const assistantCode of ["ENTERPRISE_GENERAL", "SHOP_ASSISTANT", "PHARMACY_ASSISTANT", "HEALTH_ASSISTANT"]) {
  assert(commonAssistants.includes(assistantCode), `Common ERP READ must allow compatible assistant ${assistantCode}`);
}
const retailAssistants = assistantPolicy.assistantCodesForErpModule("MOBILE_MONEY_AGENCY");
assert(retailAssistants.includes("ENTERPRISE_GENERAL"), "Retail READ must allow ENTERPRISE_GENERAL");
assert(retailAssistants.includes("SHOP_ASSISTANT"), "Retail READ must allow SHOP_ASSISTANT");
assert(!retailAssistants.includes("PHARMACY_ASSISTANT"), "Retail READ must reject PHARMACY_ASSISTANT");
assert(!retailAssistants.includes("HEALTH_ASSISTANT"), "Retail READ must reject HEALTH_ASSISTANT");

const runtime = read("lib/ai/agent/runtime.ts");
const contract = read("lib/ai/tools/erp-contract.ts");
const authorize = read("lib/ai/tools/authorize.ts");
const erpExecutor = read("lib/ai/tools/executors/erp.ts");
assert(runtime.includes('buildAgentToolResultMessage } from "@/lib/ai/agent/tool-result"'), "Agent runtime must use the structural tool-result serializer");
assert(!runtime.includes("serialized.slice(0,"), "Agent runtime must not truncate serialized JSON by slicing the string");
assert(contract.includes("allowedAssistantCodes: assistantCodesForErpModule(spec.moduleCode)"), "ERP contract must use the explicit assistant compatibility policy");
assert(authorize.includes("resolveEnterpriseModuleAccess") && authorize.includes('deny("MODULE_NOT_ALLOWED"'), "Module RBAC denial must remain authoritative");
for (const field of ["principalAmount: true", "customerFeeAmount: true", "providerCommissionAmount: true", "currencyCode: true"]) {
  assert(erpExecutor.includes(field), `Mobile Money executor must retain ${field}`);
}

if (failures.length) {
  console.error("[hotfix-558] FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[hotfix-558] PASS — nested treasury/cash values, valid structural serialization, sector assistant policy and RBAC guards verified.");
