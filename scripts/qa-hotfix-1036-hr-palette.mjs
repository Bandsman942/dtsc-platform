import assert from 'node:assert/strict';
import fs from 'node:fs';

const dossier = fs.readFileSync('components/enterprise/professional/enterprise-employee-dossier-dialog.tsx', 'utf8');
const hr = fs.readFileSync('components/enterprise/professional/enterprise-human-resources-workspace.tsx', 'utf8');
const self = fs.readFileSync('components/enterprise/professional/enterprise-my-hr-self-service.tsx', 'utf8');

// Sections and content use DTSC surface tokens in both themes.
assert.match(dossier, /function Section\(\{ title, icon: Icon, children/);
assert.match(dossier, /border-dtsc-border bg-dtsc-surface p-3 text-dtsc-ink/);
assert.doesNotMatch(dossier, /<Section[^>]*\bcolor=/);
assert.doesNotMatch(dossier, /border-(sky|violet|fuchsia|amber|emerald)-500\//);
assert.match(dossier, /<StatusBadge tone=\{employee\.archivedAt/);

assert.match(hr, /grouped\.map\(\(\[departmentId, employees\], index\) => <details/);
assert.match(hr, /border-dtsc-border bg-dtsc-surface p-3 sm:p-4/);
for (const name of ['sky', 'violet', 'emerald', 'amber']) {
  assert.doesNotMatch(hr, new RegExp('group min-w-0 rounded-xl border border-' + name + '-500'));
}
assert.match(hr, /<StatusBadge tone=\{detail\.status/);
assert.match(hr, /border-rose-400\/30 bg-rose-500\/10/); // archived warning is semantic

for (const section of ['pays', 'time', 'report']) {
  assert.match(self, new RegExp('className="grid min-w-0 gap-[34] rounded-2xl border border-dtsc-border bg-dtsc-surface p-4"[\\s\\S]*?\\{c\\.' + section + '\\}'));
}
assert.doesNotMatch(self, /rounded-2xl border border-(sky|emerald|violet)-200/);
assert.match(self, /<StatusBadge tone=\{sheet\.status === "APPROVED"/);
assert.match(self, /professionalErpEnumLabel\(locale, "timeStatus", sheet\.status\)/);
assert.match(self, /bg-amber-200 text-amber-950/); // active clock status
assert.match(self, /copy\[locale === "en" \? "en" : "fr"\]/);

console.log('HOTFIX #1036: DTSC HR palette contract passed (rendered OWNER_E2E pending).');
