import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const prefix = '[LunarReader][perf] ';

/** Accept plain Metro/logcat output, NDJSON, and console labels in a trace JSON. */
export function parseReaderPerformanceLog(input) {
  const records = [];
  const parseLine = (line) => {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
    const index = clean.indexOf(prefix);
    const json = index >= 0 ? clean.slice(index + prefix.length) : clean.trim();
    try {
      const record = JSON.parse(json);
      if (record.v === 1 && typeof record.name === 'string' && Number.isFinite(record.atMs)) records.push(record);
    } catch { /* Ignore unrelated logs and truncated lines. */ }
  };
  try {
    const document = JSON.parse(input);
    if (Array.isArray(document.traceEvents)) {
      const pending = new Map();
      for (const event of document.traceEvents) {
        const label = event.args?.data?.message ?? event.args?.label;
        if (typeof label !== 'string') continue;
        if (label.includes(prefix)) { parseLine(label); continue; }
        // Older recordings used console.timeStamp and microsecond trace clocks.
        const match = /^\[LunarReader\] (.+)\.(start|end)(?: durationMs=([\d.]+))?$/.exec(label);
        if (!match || !Number.isFinite(event.ts)) continue;
        const key = `${event.tid}:${match[1]}`;
        const stack = pending.get(key) ?? [];
        if (match[2] === 'start') { stack.push(event.ts); pending.set(key, stack); continue; }
        const start = stack.pop();
        if (start !== undefined) records.push({ v: 1, session: 'legacy', kind: 'span', name: match[1],
          startAtMs: start / 1000, atMs: event.ts / 1000, durationMs: (event.ts - start) / 1000 });
      }
    } else if (Array.isArray(document)) {
      for (const record of document) parseLine(JSON.stringify(record));
    } else parseLine(input);
  } catch {
    for (const line of input.split(/\r?\n/)) parseLine(line);
  }
  return records.sort((a, b) => a.atMs - b.atMs);
}

export function readerPerformanceSpans(records) {
  const spans = records.filter((r) => r.kind === 'span' && Number.isFinite(r.durationMs) && r.durationMs >= 0);
  const submissions = new Map();
  const starts = new Map();
  const releases = new Map();
  const terminals = new Set();
  const milestones = new Map();
  const add = (name, from, event, endAtMs) => {
    const startAtMs = from.nativeAtMs ?? from.submittedAtMs ?? from.atMs;
    if (endAtMs < startAtMs) return;
    spans.push({ ...event, kind: 'span', name, workId: event.workId ?? from.workId,
      startAtMs, durationMs: endAtMs - startAtMs });
  };
  for (const record of records) {
    if (record.workId) {
      const workKey = `${record.session}:${record.workId}`;
      const points = milestones.get(workKey) ?? new Map();
      const pairs = {
        'reader.native.submit': ['reader.turn.ready', 'reader.turn.ready-to-submit'],
        'reader.animation.settled': ['reader.animation.release', 'reader.animation.release-to-settle'],
        'reader.turn.complete': ['reader.handoff.snapshot', 'reader.handoff.wait'],
        'reader.gesture.release': ['reader.gesture.wait-prepare', 'reader.gesture.prepare-after-release'],
      };
      const pair = pairs[record.name];
      const previous = pair && points.get(pair[0]);
      if (previous) { add(pair[1], previous, record, record.atMs); points.delete(pair[0]); }
      points.set(record.name, record);
      milestones.set(workKey, points);
    }
    const id = record.nativeId?.replace(/#turn:.*$/, '');
    const key = `${record.session}:${id}`;
    if (record.name === 'reader.native.submit' && record.accepted) {
      submissions.set(key, record);
      starts.delete(key); releases.delete(key); terminals.delete(key);
    }
    if (record.name === 'reader.native.event' && Number.isFinite(record.nativeAtMs)) {
      const linked = { ...record, workId: record.workId ?? submissions.get(key)?.workId };
      if (record.event === 'started' || record.event === 'gesture-started') {
        if (!starts.has(key)) {
          const submitted = submissions.get(key);
          if (submitted) add(record.event === 'started' ? 'reader.native.submit-to-present'
            : 'reader.native.stock-to-gesture', submitted, linked, record.nativeAtMs);
          starts.set(key, linked);
        }
      }
      if (record.event === 'gesture-released') releases.set(key, linked);
      if ((record.event === 'completed' || record.event === 'cancelled') && !terminals.has(key)) {
        const start = releases.get(key) ?? starts.get(key);
        if (start) add(releases.has(key) ? 'reader.native.release-to-complete'
          : 'reader.native.animation', start, linked, record.nativeAtMs);
        terminals.add(key);
      }
    }
    if (record.name === 'reader.texture.capture') {
      for (const field of ['queueMs', 'rasterMs', 'callbackDelayMs']) {
        if (Number.isFinite(record[field])) spans.push({ ...record, kind: 'span',
          name: `reader.texture.${field.slice(0, -2)}`, durationMs: record[field] });
      }
    }
    if (record.name === 'reader.picture.compile' && Number.isFinite(record.shapeMs)) {
      spans.push({ ...record, kind: 'span', name: 'reader.text.shape', durationMs: record.shapeMs });
    }
  }
  return spans;
}

export function formatReaderPerformanceReport(records) {
  if (records.length === 0) return 'No reader performance records. Enable EXPO_PUBLIC_READER_PERF=1 and capture Metro or logcat output.';
  const spans = readerPerformanceSpans(records);
  const lines = [`records=${records.length} spans=${spans.length}`,
    'Durations are inclusive wall time; nested stages overlap. Animation duration and gesture holding are not CPU blocking time.'];
  const groups = new Map();
  for (const span of spans) {
    const group = groups.get(span.name) ?? [];
    group.push(span.durationMs); groups.set(span.name, group);
  }
  const summaries = [...groups].map(([name, values]) => ({ name, count: values.length,
    total: values.reduce((a, b) => a + b, 0), max: values.reduce((a, b) => Math.max(a, b), 0) })).sort((a, b) => b.max - a.max);
  lines.push('\nStage totals, ordered by maximum duration:', ' max ms   mean ms  count  stage');
  for (const s of summaries) lines.push(`${s.max.toFixed(2).padStart(7)} ${(s.total / s.count).toFixed(2).padStart(9)} ${String(s.count).padStart(6)}  ${s.name}`);
  const workIds = [...new Set(spans.map((span) => span.workId).filter(Boolean))];
  for (const workId of workIds) {
    lines.push(`\nWork ${workId}:`);
    for (const span of spans.filter((s) => s.workId === workId).sort((a, b) => b.durationMs - a.durationMs)) {
      lines.push(`  ${span.durationMs.toFixed(2).padStart(9)} ms  ${span.name}${span.operation ? ` [${span.operation}]` : ''}`);
    }
    for (const r of records.filter((r) => r.workId === workId && r.name === 'reader.picture.compile' && r.hits !== undefined)) {
      lines.push(`  text cache: hits=${r.hits} misses=${r.misses} evictions=${r.evictions}`);
    }
  }
  const activity = records.filter((r) => r.kind === 'activity');
  if (activity.length) lines.push('\nActivity windows; missing counters mean no observed activity. JS timer lag is not a dropped-frame count.');
  for (const record of activity) {
    lines.push(`  at=${record.atMs} window=${Number(record.windowMs).toFixed(0)} ms`);
    for (const [name, value] of Object.entries(record.activities ?? {})) {
      lines.push(`    ${name}: count=${value.count} total=${value.totalMs.toFixed(2)} ms max=${value.maxMs.toFixed(2)} ms${value.latest ? ` latest=${JSON.stringify(value.latest)}` : ''}`);
    }
  }
  const nativeEvents = records.filter((r) => r.name === 'reader.native.event');
  if (nativeEvents.length) lines.push(`\nNative event delivery delay: max=${Math.max(...nativeEvents.map((r) => r.deliveryDelayMs ?? 0)).toFixed(2)} ms`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/reader-perf-report.mjs <metro.log|logcat.log|trace.json>');
    process.exitCode = 1;
  } else {
    console.log(formatReaderPerformanceReport(parseReaderPerformanceLog(fs.readFileSync(process.argv[2], 'utf8'))));
  }
}
