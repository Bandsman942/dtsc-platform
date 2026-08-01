export function parseSectorBackfillArgs(argv = process.argv.slice(2)) {
  const value = (name) => {
    const equals = argv.find((arg) => arg.startsWith(`--${name}=`));
    if (equals) return equals.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  const limit = Math.min(Math.max(Number(value("limit") || 500), 1), 5000);
  return {
    dryRun,
    organizationId: value("organization-id") || null,
    cursor: value("cursor") || null,
    resume: argv.includes("--resume"),
    fromDate: value("from-date") ? new Date(value("from-date")) : null,
    toDate: value("to-date") ? new Date(value("to-date")) : null,
    limit,
  };
}

export function backfillWhere(options, dateField = "createdAt") {
  return {
    ...(options.organizationId ? { organizationId: options.organizationId } : {}),
    ...(options.cursor ? { id: { gt: options.cursor } } : {}),
    ...(options.fromDate || options.toDate ? { [dateField]: { ...(options.fromDate ? { gte: options.fromDate } : {}), ...(options.toDate ? { lte: options.toDate } : {}) } } : {}),
  };
}

export function createBackfillReport(name, options) {
  const report = { name, mode: options.dryRun ? "dry-run" : "apply", analyzed: 0, mapped: 0, skipped: 0, ambiguous: 0, failed: 0, ids: { mapped: [], skipped: [], ambiguous: [], failed: [] }, nextCursor: null };
  const record = (bucket, id) => {
    report[bucket] += 1;
    if (report.ids[bucket].length < 200) report.ids[bucket].push(id);
  };
  return { report, record };
}

export function printBackfillReport(report) {
  console.log(JSON.stringify(report, null, 2));
}

export function safeErrorCode(error) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}
