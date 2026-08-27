import fs from 'node:fs';

const tracePath = process.argv[2];
if (!tracePath) {
  console.error('Usage: node scripts/reader-perf-report.mjs <trace.json>');
  process.exitCode = 1;
  process.exit();
}

const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const events = Array.isArray(trace.traceEvents) ? trace.traceEvents : [];
const marks = events
  .filter((event) => event.name === 'TimeStamp')
  .map((event) => {
    const data = event.args?.data;
    const label = typeof data?.message === 'string'
      ? data.message
      : typeof event.args?.label === 'string' ? event.args.label : undefined;
    if (!label?.startsWith('[LunarReader] ')) return undefined;
    return { ts: event.ts, label: label.slice('[LunarReader] '.length), tid: event.tid };
  })
  .filter(Boolean)
  .sort((left, right) => left.ts - right.ts);

if (marks.length === 0) {
  console.log('No [LunarReader] markers found. Start the app with EXPO_PUBLIC_READER_PERF=1.');
  process.exit();
}

const pending = new Map();
const spans = [];
for (const mark of marks) {
  const durationMatch = mark.label.match(/^(.*)\.end durationMs=([\d.]+)$/);
  if (durationMatch) {
    const name = durationMatch[1];
    const started = pending.get(name);
    if (started) {
      spans.push({ name, durationMs: (mark.ts - started.ts) / 1000, tid: mark.tid });
      pending.delete(name);
    }
    continue;
  }
  const endName = mark.label.match(/^(.*)\.end$/)?.[1];
  if (endName) {
    const started = pending.get(endName);
    if (started) {
      spans.push({ name: endName, durationMs: (mark.ts - started.ts) / 1000, tid: mark.tid });
      pending.delete(endName);
    }
    continue;
  }
  if (mark.label.endsWith('.start')) {
    pending.set(mark.label.slice(0, -'.start'.length), mark);
  }
}

console.log(`markers=${marks.length} spans=${spans.length}`);
for (const span of spans) {
  console.log(`${span.durationMs.toFixed(2).padStart(10)} ms  ${span.name}  tid=${span.tid}`);
}
console.log('\nRaw markers:');
for (const mark of marks) {
  console.log(`${(mark.ts / 1000).toFixed(3)} ms  ${mark.label}  tid=${mark.tid}`);
}
