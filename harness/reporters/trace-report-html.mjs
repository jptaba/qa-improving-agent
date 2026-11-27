// Renders the standalone trace report (harness/reporters/trace-report.mjs) from one or more runs.
// Several runs (CI shards) are merged into one view: lanes are "shard · worker".
// Output is a single HTML file with inline CSS and JS and the data embedded as JSON. No network access.

const css = String.raw`
:root{--bg:#f7f8fa;--panel:#fff;--ink:#1c2133;--muted:#5b6275;--line:#e3e6ec;--soft:#eef0f4;
--pass:#1f8a4c;--fail:#c9372c;--flaky:#b7791f;--skip:#8a8f9e;--accent:#1c4ed8;
--c-hook:#7c5cc4;--c-fixture:#8a8f9e;--c-pw:#1c4ed8;--c-expect:#1f8a4c;--c-step:#b7791f;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--panel:#1a1e27;--ink:#e6e8ee;--muted:#9aa1b2;--line:#2b303c;--soft:#222733;
--pass:#3fb872;--fail:#ef6b5f;--flaky:#e0a33a;--skip:#7d8394;--accent:#6b93ff;--c-hook:#a58cf0;--c-fixture:#7d8394;--c-pw:#6b93ff;--c-expect:#3fb872;--c-step:#e0a33a;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1240px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:15px;margin:0 0 12px;letter-spacing:.01em}
.meta{color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:4px 16px}
.meta a{color:var(--accent)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin-top:16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:16px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
.kpi span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.kpi.pass b{color:var(--pass)}.kpi.fail b{color:var(--fail)}.kpi.flaky b{color:var(--flaky)}.kpi.skip b{color:var(--skip)}
.chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap}
.chip.passed,.chip.expected{background:var(--pass)}.chip.failed,.chip.unexpected,.chip.timedOut{background:var(--fail)}
.chip.flaky{background:var(--flaky)}.chip.skipped,.chip.interrupted{background:var(--skip)}
.tag{display:inline-block;padding:0 6px;border:1px solid var(--line);border-radius:6px;font-size:12px;color:var(--muted);margin-right:4px;cursor:pointer;background:var(--soft)}
.tag:hover{color:var(--ink)}
.scroll{overflow-x:auto}
.timeline{position:relative;min-width:640px}
.axis{position:relative;height:18px;margin-left:110px;border-bottom:1px solid var(--line);font-size:11px;color:var(--muted)}
.axis i{position:absolute;top:0;transform:translateX(-50%);font-style:normal}
.lane{display:flex;align-items:center;height:22px}
.lane>span{width:110px;flex:none;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.track{position:relative;flex:1;height:16px;background:var(--soft);border-radius:4px}
.bar{position:absolute;top:1px;height:14px;border-radius:3px;min-width:2px;cursor:pointer;opacity:.9}
.bar:hover,.bar.sel{opacity:1;outline:2px solid var(--ink);outline-offset:0}
.bar.passed{background:var(--pass)}.bar.failed,.bar.timedOut{background:var(--fail)}.bar.skipped,.bar.interrupted{background:var(--skip)}.bar.retry{background:repeating-linear-gradient(45deg,var(--flaky) 0 4px,transparent 4px 7px),var(--flaky)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600;cursor:pointer;user-select:none;white-space:nowrap}
th.num,td.num{text-align:right}
tbody tr{cursor:pointer}tbody tr:hover{background:var(--soft)}tr.sel{background:var(--soft);box-shadow:inset 3px 0 var(--accent)}
.title small{display:block;color:var(--muted);font-size:12px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.filters button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:999px;padding:4px 12px;font:inherit;font-size:13px;cursor:pointer}
.filters button.on{background:var(--ink);color:var(--panel);border-color:var(--ink)}
.filters input{flex:1;min-width:180px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:6px 10px;font:inherit}
.reqbar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--soft);min-width:80px}
.reqbar i{display:block}
#detail:empty{display:none}
.attempts{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}
.attempts button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}
.attempts button.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
pre{background:var(--soft);border-radius:8px;padding:10px 12px;overflow:auto;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;margin:8px 0;white-space:pre-wrap;word-break:break-word}
pre.err{border-left:3px solid var(--fail)}
.steps{font-size:13px}
.step{display:grid;grid-template-columns:minmax(0,1fr) 38% 64px;gap:8px;align-items:center;padding:2px 0;border-bottom:1px dashed var(--line)}
.step .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.step .name em{font-style:normal;font-size:11px;color:var(--muted);margin-right:6px;text-transform:uppercase}
.step.err .name{color:var(--fail)}
.step .w{position:relative;height:10px;background:var(--soft);border-radius:3px}
.step .w i{position:absolute;top:0;height:10px;border-radius:3px;min-width:2px}
.step .t{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--muted);margin-top:8px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.muted{color:var(--muted)}
code{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--soft);padding:1px 5px;border-radius:4px}
@media (max-width:640px){.step{grid-template-columns:minmax(0,1fr) 64px}.step .w{display:none}td.hide-sm,th.hide-sm{display:none}}
`;

const js = String.raw`
const RUNS = JSON.parse(document.getElementById('data').textContent);
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ms = (v) => (v < 1000 ? Math.round(v) + ' ms' : v < 60000 ? (v / 1000).toFixed(v < 10000 ? 2 : 1) + ' s' : Math.floor(v / 60000) + ' m ' + Math.round((v % 60000) / 1000) + ' s');
const outcomeLabel = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' };

// Flatten runs → tests, tagging each result with its lane.
const tests = [];
RUNS.forEach((run, ri) => run.tests.forEach((t) => {
  t.results.forEach((r) => (r.laneKey = (RUNS.length > 1 ? (run.shard ? 'shard ' + run.shard : 'run ' + (ri + 1)) + ' · ' : '') + 'worker ' + r.lane));
  t.run = ri;
  t.id = ri + ':' + t.id; // unique even if two merged runs contain the same test
  t.last = t.results[t.results.length - 1];
  t.total = t.results.reduce((a, r) => a + r.duration, 0);
  t.state = outcomeLabel[t.outcome] ?? t.outcome;
  tests.push(t);
}));
const t0 = Math.min(...tests.flatMap((t) => t.results.map((r) => r.start)), ...RUNS.map((r) => r.started));
const t1 = Math.max(...tests.flatMap((t) => t.results.map((r) => r.start + r.duration)), t0 + 1);

// Header and KPIs
const count = (s) => tests.filter((t) => t.state === s).length;
const failed = count('failed'), flaky = count('flaky');
const overall = failed ? 'failed' : flaky ? 'flaky' : 'passed';
const commit = RUNS.find((r) => r.commit)?.commit;
const ciRun = RUNS.find((r) => r.ciRun)?.ciRun;
$('#head').innerHTML =
  '<h1>Test trace report <span class="chip ' + overall + '">' + (failed ? failed + ' failed' : flaky ? flaky + ' flaky' : 'all passed') + '</span></h1>' +
  '<div class="meta"><span>' + esc(new Date(t0).toLocaleString()) + '</span>' +
  '<span>' + esc(RUNS[0].baseUrl) + '</span>' +
  (RUNS[0].branch ? '<span>branch ' + esc(RUNS[0].branch) + '</span>' : '') +
  (commit ? '<span>commit <code>' + esc(commit.slice(0, 7)) + '</code></span>' : '') +
  (RUNS.length > 1 ? '<span>' + RUNS.length + ' shards merged</span>' : '') +
  (ciRun ? '<a href="' + esc(ciRun) + '">CI run</a>' : '') + '</div>';
const kpi = (cls, label, value) => '<div class="kpi ' + cls + '"><b>' + value + '</b><span>' + label + '</span></div>';
const lanes = [...new Set(tests.flatMap((t) => t.results.map((r) => r.laneKey)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
$('#kpis').innerHTML = kpi('', 'Tests', tests.length) + kpi('pass', 'Passed', count('passed')) + kpi('fail', 'Failed', failed) +
  kpi('flaky', 'Flaky', flaky) + kpi('skip', 'Skipped', count('skipped')) + kpi('', 'Wall time', ms(t1 - t0)) + kpi('', 'Workers', lanes.length);

// Timeline
function drawTimeline() {
  const span = t1 - t0;
  const step = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000].find((s) => span / s <= 8) ?? 600000;
  let axis = '';
  for (let v = 0; v <= span; v += step) axis += '<i style="left:' + ((v / span) * 100).toFixed(3) + '%">' + ms(v) + '</i>';
  let html = '<div class="axis">' + axis + '</div>';
  for (const lane of lanes) {
    let bars = '';
    for (const t of tests) t.results.forEach((r, i) => {
      if (r.laneKey !== lane) return;
      const cls = r.status === 'passed' && i > 0 ? 'retry' : r.status;
      bars += '<div class="bar ' + cls + '" data-id="' + esc(t.id) + '" data-a="' + i + '" style="left:' + (((r.start - t0) / span) * 100).toFixed(3) + '%;width:' + ((r.duration / span) * 100).toFixed(3) + '%" title="' +
        esc(t.title + ' (' + r.status + (r.retry ? ', retry ' + r.retry : '') + ', ' + ms(r.duration) + ')') + '"></div>';
    });
    html += '<div class="lane"><span title="' + esc(lane) + '">' + esc(lane) + '</span><div class="track">' + bars + '</div></div>';
  }
  $('#timeline').innerHTML = html;
}

// Requirements
function drawRequirements() {
  const by = new Map();
  for (const t of tests) for (const req of t.requirements.length ? t.requirements : ['(untagged)']) {
    const e = by.get(req) ?? { req, n: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, time: 0 };
    e.n++; e[t.state] = (e[t.state] ?? 0) + 1; e.time += t.total; by.set(req, e);
  }
  const rows = [...by.values()].sort((a, b) => b.failed - a.failed || b.flaky - a.flaky || a.req.localeCompare(b.req, undefined, { numeric: true }));
  $('#reqs').innerHTML = '<table><thead><tr><th>Requirement</th><th class="num">Tests</th><th class="num">Failed</th><th class="num">Flaky</th><th class="hide-sm">Result</th><th class="num">Time</th></tr></thead><tbody>' +
    rows.map((e) => '<tr data-req="' + esc(e.req) + '"><td><span class="tag">' + esc(e.req) + '</span></td><td class="num">' + e.n + '</td><td class="num">' + (e.failed || '') + '</td><td class="num">' + (e.flaky || '') +
      '</td><td class="hide-sm"><div class="reqbar">' + ['passed', 'flaky', 'failed', 'skipped'].map((s) => e[s] ? '<i style="width:' + (e[s] / e.n) * 100 + '%;background:var(--' + (s === 'passed' ? 'pass' : s === 'failed' ? 'fail' : s === 'skipped' ? 'skip' : 'flaky') + ')"></i>' : '').join('') +
      '</div></td><td class="num">' + ms(e.time) + '</td></tr>').join('') + '</tbody></table>';
}

// Test table with filters and sorting
const state = { status: 'all', req: null, q: '', sort: 'order', dir: 1, sel: null, attempt: null };
const order = (t) => t.results[0].start;
function drawTests() {
  const statuses = ['all', 'failed', 'flaky', 'passed', 'skipped'];
  $('#filters').innerHTML = statuses.map((s) => '<button data-status="' + s + '" class="' + (state.status === s ? 'on' : '') + '">' + s + (s === 'all' ? '' : ' (' + count(s) + ')') + '</button>').join('') +
    (state.req ? '<button data-clear-req class="on">' + esc(state.req) + ' ✕</button>' : '') +
    '<input id="q" type="search" placeholder="Search test, file or requirement" value="' + esc(state.q) + '">';
  const q = state.q.toLowerCase();
  let list = tests.filter((t) => (state.status === 'all' || t.state === state.status) &&
    (!state.req || (state.req === '(untagged)' ? !t.requirements.length : t.requirements.includes(state.req))) &&
    (!q || [t.title, t.path.join(' '), t.file, t.requirements.join(' '), t.project].join(' ').toLowerCase().includes(q)));
  const key = { order, title: (t) => t.path.join(' ') + t.title, duration: (t) => t.total, status: (t) => t.state, retries: (t) => t.results.length }[state.sort];
  list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * state.dir; });
  const th = (k, label, cls = '') => '<th data-sort="' + k + '" class="' + cls + '">' + label + (state.sort === k ? (state.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
  $('#tests').innerHTML = '<table><thead><tr>' + th('status', 'Status') + th('title', 'Test') + '<th class="hide-sm">Requirements</th>' + th('retries', 'Attempts', 'num hide-sm') + th('duration', 'Time', 'num') + '</tr></thead><tbody>' +
    (list.map((t) => '<tr data-id="' + esc(t.id) + '" class="' + (state.sel === t.id ? 'sel' : '') + '"><td><span class="chip ' + t.state + '">' + t.state + '</span></td><td class="title">' + esc(t.title) +
      '<small>' + esc([...t.path.slice(0, -1), t.file + ':' + t.line].filter(Boolean).join(' › ')) + (t.project && t.project !== 'chromium' ? ' · ' + esc(t.project) : '') + '</small></td><td class="hide-sm">' +
      t.requirements.map((r) => '<span class="tag" data-req="' + esc(r) + '">' + esc(r) + '</span>').join('') + '</td><td class="num hide-sm">' + t.results.length + '</td><td class="num">' + ms(t.total) + '</td></tr>').join('') ||
      '<tr><td colspan="5" class="muted">No tests match.</td></tr>') + '</tbody></table>';
}

// Detail: attempts, error, step waterfall, trace
const catName = { hook: 'hook', fixture: 'fixture', 'pw:api': 'action', expect: 'expect', 'test.step': 'step' };
const catColor = { hook: 'var(--c-hook)', fixture: 'var(--c-fixture)', 'pw:api': 'var(--c-pw)', expect: 'var(--c-expect)', 'test.step': 'var(--c-step)' };
function stepRows(steps, total, depth) {
  return steps.map((s) => '<div class="step' + (s.e ? ' err' : '') + '"><div class="name" style="padding-left:' + depth * 14 + 'px" title="' + esc(s.t + (s.e ? '\n' + s.e : '')) + '"><em>' + esc(catName[s.c] ?? s.c) + '</em>' + esc(s.t) +
    '</div><div class="w"><i style="left:' + Math.min(99.7, (s.s / total) * 100).toFixed(2) + '%;width:' + Math.max(0.3, Math.min((s.d / total) * 100, 100 - Math.min(99.7, (s.s / total) * 100))).toFixed(2) + '%;background:' + (s.e ? 'var(--fail)' : catColor[s.c] ?? 'var(--skip)') + '"></i></div><div class="t">' + ms(s.d) + '</div></div>' +
    (s.k ? stepRows(s.k, total, depth + 1) : '')).join('');
}
function drawDetail() {
  const t = tests.find((x) => x.id === state.sel);
  if (!t) return ($('#detail').innerHTML = '');
  const a = state.attempt ?? t.results.length - 1;
  const r = t.results[a];
  $('#detail').innerHTML = '<div class="panel"><h2>' + esc(t.title) + ' <span class="chip ' + t.state + '">' + t.state + '</span></h2>' +
    '<div class="meta"><span>' + esc(t.file + ':' + t.line) + '</span>' + (t.project ? '<span>project ' + esc(t.project) + '</span>' : '') + '<span>' + esc(r.laneKey) + '</span>' +
    t.requirements.map((x) => '<span class="tag" data-req="' + esc(x) + '">' + esc(x) + '</span>').join('') + '</div>' +
    (t.results.length > 1 ? '<div class="attempts">' + t.results.map((x, i) => '<button data-attempt="' + i + '" class="' + (i === a ? 'on' : '') + '"><span class="chip ' + x.status + '">' + x.status + '</span> ' + (i ? 'retry ' + x.retry : 'first run') + ' · ' + ms(x.duration) + '</button>').join('') + '</div>' : '<div style="height:8px"></div>') +
    (r.error ? '<pre class="err">' + esc(r.error.message) + (r.error.at ? '\n\nat ' + esc(r.error.at) : '') + '</pre>' + (r.error.snippet ? '<pre>' + esc(r.error.snippet) + '</pre>' : '') : '') +
    (r.trace ? '<p class="muted">Playwright trace: <code>' + esc(r.trace) + '</code>. Open it with <code>npx playwright show-trace ' + esc(r.trace) + '</code> from this report\'s folder, or drop the file on trace.playwright.dev.</p>' : '') +
    '<h2 style="margin-top:14px">Steps <span class="muted" style="font-weight:400">' + ms(r.duration) + '</span></h2><div class="steps">' + (r.steps.length ? stepRows(r.steps, Math.max(r.duration, 1), 0) : '<p class="muted">No steps recorded.</p>') + '</div>' +
    '<div class="legend">' + Object.keys(catName).map((c) => '<span><i style="background:' + catColor[c] + '"></i>' + catName[c] + '</span>').join('') + '<span><i style="background:var(--fail)"></i>error</span></div></div>';
}

function select(id, attempt = null) {
  state.sel = id; state.attempt = attempt;
  drawTests(); drawDetail();
  document.querySelectorAll('.bar.sel').forEach((b) => b.classList.remove('sel'));
  document.querySelectorAll('.bar[data-id="' + CSS.escape(id) + '"]').forEach((b) => b.classList.add('sel'));
  $('#detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-req],[data-status],[data-clear-req],[data-sort],[data-attempt],.bar,tbody tr[data-id]');
  if (!el) return;
  if (el.dataset.req) { state.req = el.dataset.req; state.status = 'all'; drawTests(); $('#tests-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (el.dataset.status) { state.status = el.dataset.status; return drawTests(); }
  if ('clearReq' in el.dataset) { state.req = null; return drawTests(); }
  if (el.dataset.sort) { state.dir = state.sort === el.dataset.sort ? -state.dir : el.dataset.sort === 'duration' ? -1 : 1; state.sort = el.dataset.sort; return drawTests(); }
  if (el.dataset.attempt) { state.attempt = Number(el.dataset.attempt); return drawDetail(); }
  if (el.classList.contains('bar')) return select(el.dataset.id, Number(el.dataset.a));
  if (el.dataset.id) return select(el.dataset.id);
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  state.q = e.target.value;
  const pos = e.target.selectionStart;
  drawTests();
  const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos);
});

drawTimeline(); drawRequirements(); drawTests();
const firstBad = tests.find((t) => t.state === 'failed') ?? tests.find((t) => t.state === 'flaky');
if (firstBad) { state.sel = firstBad.id; drawTests(); drawDetail(); }
`;

export function renderTraceReport(runs) {
  const data = JSON.stringify(runs).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test trace report</title>
<style>${css}</style>
</head>
<body>
<main>
<header id="head"></header>
<section class="kpis" id="kpis"></section>
<section class="panel"><h2>Timeline</h2><div class="scroll"><div class="timeline" id="timeline"></div></div>
<div class="legend"><span><i style="background:var(--pass)"></i>passed</span><span><i style="background:var(--fail)"></i>failed</span><span><i style="background:var(--flaky)"></i>passed on retry</span><span><i style="background:var(--skip)"></i>skipped</span><span>Click a bar for its steps.</span></div></section>
<section class="panel"><h2>By requirement</h2><div class="scroll" id="reqs"></div></section>
<section class="panel" id="tests-panel"><h2>Tests</h2><div class="filters" id="filters"></div><div class="scroll" id="tests"></div></section>
<section id="detail"></section>
</main>
<script type="application/json" id="data">${data}</script>
<script>${js}</script>
</body>
</html>
`;
}
