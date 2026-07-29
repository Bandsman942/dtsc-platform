from pathlib import Path

path = Path("scripts/sprint5-integrate.py")
text = path.read_text()
old = r'].filter(Boolean).join("\n"),'
new = r'].filter(Boolean).join("\\n"),'
count = text.count(old)
if count < 2:
    raise SystemExit(f"Expected at least 2 escaped join anchors, found {count}")
path.write_text(text.replace(old, new))
print(f"Fixed {count} payroll activity newline anchors.")
