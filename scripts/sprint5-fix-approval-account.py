from pathlib import Path

path = Path("lib/payroll-workflow.ts")
text = path.read_text()
old = "        accountId: budget.accountId,\n"
new = "        accountId: budget.accountId || undefined,\n"
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected exactly one remaining approval account anchor, found {count}")
updated = text.replace(old, new, 1)
if old in updated or updated.count(new) < 2:
    raise SystemExit("Approval account typing fix did not produce the expected two narrowed call sites")
path.write_text(updated)
print("Approval account typing narrowed successfully.")
