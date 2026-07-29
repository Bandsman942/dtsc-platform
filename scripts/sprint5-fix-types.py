from pathlib import Path


def replace_once(path_string: str, old: str, new: str) -> None:
    path = Path(path_string)
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Missing fix anchor in {path_string}: {old!r}")
    path.write_text(text.replace(old, new, 1))


replace_once(
    "lib/payroll-workflow.ts",
    "        accountId: budget.accountId,\n",
    "        accountId: budget.accountId || undefined,\n",
)

replace_once(
    "app/api/admin/hr-cfo/[entity]/[id]/route.ts",
    "  return updatePayroll(id, data);\n",
    '  throw new Error("Entité HR & CFO non prise en charge par le CRUD générique.");\n',
)

replace_once(
    "app/api/admin/hr-cfo/[entity]/[id]/route.ts",
    "  return hrcfoSchemas.payrolls.partial().safeParse(body);\n",
    "  return hrcfoSchemas.budgets.partial().safeParse(body);\n",
)

path = Path("app/api/admin/hr-cfo/[entity]/[id]/route.ts")
text = path.read_text()
old = '''  const payroll = await prisma.hrcfoPayroll.findUnique({ where: { id } });
  if (payroll?.transactionId || payroll?.status === "VALIDATED" || payroll?.status === "PAID") {
    throw new Error("Une paie validée ou payée ne peut pas être supprimée.");
  }
  return prisma.hrcfoPayroll.delete({ where: { id } });
'''
new = '  throw new Error("Entité HR & CFO non prise en charge par le CRUD générique.");\n'
if old not in text:
    raise SystemExit("Missing generic payroll delete fallback")
path.write_text(text.replace(old, new, 1))

replace_once(
    "app/api/admin/hr-cfo/[entity]/route.ts",
    "  return hrcfoSchemas.payrolls.safeParse(body);\n",
    "  return hrcfoSchemas.budgets.safeParse(body);\n",
)

print("Sprint 5 typecheck fixes applied.")
