from pathlib import Path

path = Path("lib/payroll-workflow.ts")
text = path.read_text()
old = "        accountId: budget.accountId,\n"
new = "        accountId: budget.accountId || undefined,\n"
count = text.count(old)
if count not in (1, 2):
    raise SystemExit(f"Expected one or two remaining budget account anchors, found {count}")
updated = text.replace(old, new)
if old in updated or updated.count(new) < 2:
    raise SystemExit("Budget account typing fix did not narrow both transaction call sites")
path.write_text(updated)
print(f"Narrowed {count} remaining budget account call site(s).")
