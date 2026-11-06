import assert from 'node:assert/strict';
import fs from 'node:fs';

const dossier = fs.readFileSync('components/enterprise/professional/enterprise-employee-dossier-dialog.tsx', 'utf8');
const hr = fs.readFileSync('components/enterprise/professional/enterprise-human-resources-workspace.tsx', 'utf8');
const self = fs.readFileSync('components/enterprise/professional/enterprise-my-hr-self-service.tsx', 'utf8');
const workspace = fs.readFileSync('components/enterprise/professional/enterprise-time-attendance-workspace.tsx', 'utf8');
const route = fs.readFileSync('app/api/enterprise/[organizationId]/my-hr/route.ts', 'utf8');
const moduleHub = fs.readFileSync('app/enterprise-modules/page.tsx', 'utf8');
const moduleRoute = fs.readFileSync('app/enterprise-modules/[moduleCode]/page.tsx', 'utf8');
const personalRoute = fs.readFileSync('app/enterprise-modules/my-hr/page.tsx', 'utf8');
const payrollWorkspace = fs.readFileSync('components/enterprise/professional/enterprise-payroll-operations-workspace.tsx', 'utf8');

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

// Personal HR is a lazy, full-module tab within the same horizontal rail.
assert.match(workspace, /type TimeTab = .*"SELF_SERVICE"/);
assert.match(workspace, /id: "SELF_SERVICE" as const, label: copy\.selfService/);
assert.match(workspace, /tab === "SELF_SERVICE" \? <EnterpriseMyHrSelfService/);
assert.match(workspace, /tab !== "SCHEDULES" && tab !== "SELF_SERVICE"/);
assert.doesNotMatch(workspace, /<EnterpriseMyHrSelfService organizationId=\{organizationId\} \/>\s*<ModuleMetrics/);

// Each private history is paginated independently on the server, including an
// active clock record that stays visible while history pages change.
for (const key of ['page', 'reportPage', 'clockPage']) {
  assert.ok(self.includes(key + '=${' + key + '}'), `Missing private page parameter ${key}`);
}
assert.match(self, /<HrPager pagination=\{data\.payslipsPagination\}/);
assert.match(self, /<HrPager pagination=\{data\.reportsPagination\}/);
assert.match(self, /<HrPager pagination=\{data\.clockSessionsPagination\}/);
assert.doesNotMatch(self, /clockSessions\.slice\(|timesheets\.slice\(/);
assert.match(route, /getActiveEnterpriseSelfEmployee\(session, organizationId\)/);
assert.match(route, /hasEnterpriseSelfHrModule\(session, organizationId, "TIME_ATTENDANCE"\)/);
assert.match(route, /skip: \(reportPage - 1\) \* pageSize, take: pageSize/);
assert.match(route, /skip: \(clockPage - 1\) \* pageSize, take: pageSize/);
assert.match(route, /reportsPagination:/);
assert.match(route, /clockSessionsPagination:/);
assert.match(route, /activeClockSession,/);
assert.match(route, /Cache-Control": "private, no-store/);

// Navigation never implies management permissions; links are resolved from the
// canonical module registry and the owner-only fallback route stays available.
assert.match(self, /relatedModules\.filter\(\(module\) => module\.code !== "TIME_ATTENDANCE"\)/);
assert.match(self, /href=\{module\.href\}/);
assert.match(self, /onOpenTimeTab\(item\.tab\)/);
assert.match(self, /href="#my-hr-payslips"/);
assert.match(self, /href="#my-hr-clock"/);
assert.match(self, /href="#my-hr-reports"/);
assert.match(workspace, /relatedModules=\{relatedModules\}/);
assert.match(workspace, /new URL\(window\.location\.href\)\.searchParams\.get\("tab"\)/);
assert.match(moduleHub, /\?tab=SELF_SERVICE/);
assert.match(moduleHub, /hasEnterpriseSelfHrModule\(session, organizationId/);
assert.doesNotMatch(moduleHub, /<EnterpriseMyHrSelfService/);
assert.doesNotMatch(payrollWorkspace, /<EnterpriseMyHrSelfService/);
assert.match(payrollWorkspace, /href="\/enterprise-modules\/my-hr"/);
assert.match(moduleRoute, /getEnterpriseNavigationModules\(organizationId, user\.id, user\.locale\)/);
assert.match(personalRoute, /hasEnterpriseSelfHrModule\(session, organizationId/);
assert.match(personalRoute, /<EnterpriseMyHrSelfService organizationId=\{organizationId\} relatedModules=\{relatedModules\}/);

console.log('HOTFIX #1036: DTSC palette, HR links, personal tab and private pagination contract passed (OWNER_E2E pending).');
