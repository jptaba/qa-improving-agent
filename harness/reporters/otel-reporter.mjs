// Playwright reporter: exports one OpenTelemetry trace per run (roadmap Phase 0 / autonomy phase I).
// Zero dependencies: sends OTLP/HTTP JSON to $OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces.
// Enabled in playwright.config.ts only when OTEL_EXPORTER_OTLP_ENDPOINT is set, so it is a no-op by default.
//
//   OTEL_EXPORTER_OTLP_ENDPOINT   e.g. http://localhost:4318 (Langfuse, Grafana Tempo, Honeycomb, Jaeger …)
//   OTEL_EXPORTER_OTLP_HEADERS    optional, "key=value,key2=value2" (auth tokens)
//   OTEL_SERVICE_NAME             optional, default "qa-harness"
//
// Spans: one root span "playwright run", one child span per test (and per retry). Attributes carry the
// requirement tags, status, retry, file and the first line of any error, so a trace backend can group
// failures by requirement. A failed export is logged and never fails the run.
import { randomBytes } from 'node:crypto';

const hex = (n) => randomBytes(n).toString('hex');
const nanos = (ms) => String(BigInt(Math.round(ms)) * 1_000_000n);
const attr = (key, value) =>
  typeof value === 'number'
    ? { key, value: Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value } }
    : typeof value === 'boolean'
      ? { key, value: { boolValue: value } }
      : { key, value: { stringValue: String(value) } };

function parseHeaders(s) {
  return Object.fromEntries(
    (s || '')
      .split(',')
      .map((kv) => kv.trim())
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf('=');
        return [decodeURIComponent(kv.slice(0, i).trim()), decodeURIComponent(kv.slice(i + 1).trim())];
      }),
  );
}

export default class OtelReporter {
  constructor(options = {}) {
    this.endpoint = (options.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').replace(/\/$/, '');
    this.headers = parseHeaders(options.headers ?? process.env.OTEL_EXPORTER_OTLP_HEADERS);
    this.service = options.serviceName || process.env.OTEL_SERVICE_NAME || 'qa-harness';
    this.traceId = hex(16);
    this.rootId = hex(8);
    this.spans = [];
  }

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    this.start = Date.now();
    this.total = suite.allTests().length;
    this.workers = config.workers;
  }

  onTestEnd(test, result) {
    const tags = test.tags ?? [];
    const requirements = [...new Set([...tags, ...(test.titlePath().join(' ').match(/@?REQ-\d+/g) ?? [])].map((t) => t.replace(/^@/, '')).filter((t) => /^REQ-\d+$/.test(t)))];
    const startMs = result.startTime.getTime();
    const error = (result.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim()) ?? '';
    this.spans.push({
      traceId: this.traceId,
      spanId: hex(8),
      parentSpanId: this.rootId,
      name: test.titlePath().slice(1).join(' › ').replace(/\\/g, '/'),
      kind: 1,
      startTimeUnixNano: nanos(startMs),
      endTimeUnixNano: nanos(startMs + result.duration),
      attributes: [
        attr('test.file', test.location.file.replace(/\\/g, '/').split('/tests/').pop()),
        attr('test.line', test.location.line),
        attr('test.status', result.status),
        attr('test.expected_status', test.expectedStatus),
        attr('test.outcome', test.outcome()),
        attr('test.retry', result.retry),
        attr('test.requirements', requirements.join(',')),
        attr('test.project', test.parent.project()?.name ?? ''),
        ...(error ? [attr('test.error', error.slice(0, 500))] : []),
      ],
      status: result.status === 'passed' || result.status === 'skipped' ? { code: 1 } : { code: 2, message: error.slice(0, 200) },
    });
  }

  async onEnd(result) {
    if (!this.endpoint) return;
    const end = Date.now();
    const failed = this.spans.filter((s) => s.status.code === 2).length;
    const root = {
      traceId: this.traceId,
      spanId: this.rootId,
      name: 'playwright run',
      kind: 1,
      startTimeUnixNano: nanos(this.start ?? end),
      endTimeUnixNano: nanos(end),
      attributes: [
        attr('run.status', result.status),
        attr('run.tests', this.total ?? this.spans.length),
        attr('run.failed_results', failed),
        attr('run.workers', this.workers ?? 0),
        attr('run.base_url', process.env.BASE_URL ?? 'http://localhost:4173'),
        attr('ci', !!process.env.CI),
        ...(process.env.GITHUB_SHA ? [attr('vcs.revision', process.env.GITHUB_SHA)] : []),
        ...(process.env.GITHUB_RUN_ID ? [attr('ci.run_id', process.env.GITHUB_RUN_ID)] : []),
      ],
      status: result.status === 'passed' ? { code: 1 } : { code: 2, message: result.status },
    };
    const body = {
      resourceSpans: [
        {
          resource: { attributes: [attr('service.name', this.service), attr('telemetry.sdk.name', 'qa-harness-otel-reporter')] },
          scopeSpans: [{ scope: { name: 'playwright', version: '1' }, spans: [root, ...this.spans] }],
        },
      ],
    };
    try {
      const res = await fetch(`${this.endpoint}/v1/traces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.warn(`otel-reporter: export failed with HTTP ${res.status} (run not affected)`);
    } catch (e) {
      console.warn(`otel-reporter: export failed: ${e.message} (run not affected)`);
    }
  }
}
