const vscode = require('vscode');
const crypto = require('crypto');
const moduleManager = require('./moduleManager');

// Debug mode only: records what the AnalysisScheduler does and shows it live in a webview
// (timeline of parses / type checks / pauses / cancellations / main thread blocking, jobs, queue, log).

const HISTORY_MS = 180 * 1000;
const MAX_LOG = 400;
const LAG_INTERVAL_MS = 50;
const LAG_THRESHOLD_MS = 40; // main thread blocked longer than this is shown
const MERGE_SLICES_MS = 5; // slices of a job separated only by a yield are shown as one bar
const MAIN_THREAD_LANE = '⚠ main thread';

class AnalysisMonitor {
	constructor(scheduler) {
		this.scheduler = scheduler;
		this.segments = []; // { lane, kind: 'parse' | 'check' | 'job' | 'lag', start, end, ... }
		this.logs = []; // { t, module, text, level }
		this.jobs = new Map(); // TypeCheckJob -> { segment, slice }
		this.panel = null;
		this.updateTimer = null;

		this.lastTick = Date.now();
		this.lagTimer = setInterval(() => {
			const now = Date.now();
			const lag = now - this.lastTick - LAG_INTERVAL_MS;
			if (lag > LAG_THRESHOLD_MS) this.segments.push({ lane: MAIN_THREAD_LANE, kind: 'lag', start: now - lag, end: now, label: `main thread blocked ${lag} ms` });
			this.lastTick = now;
		}, LAG_INTERVAL_MS);

		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1);
		this.statusBarItem.name = 'NianioLang Dev Kit: analysis monitor';
		this.statusBarItem.text = '$(pulse) NL monitor';
		this.statusBarItem.tooltip = 'NianioLang Dev Kit (debug mode): show the analysis monitor';
		this.statusBarItem.command = 'nianiolang.showAnalysisMonitor';
		this.statusBarItem.show();
		this.log('monitor started (debug mode)');
	}

	dispose() {
		clearInterval(this.lagTimer);
		clearInterval(this.updateTimer);
		this.statusBarItem.dispose();
		this.panel?.dispose();
	}

	// ---------------------------------------------------------------- recording (called by the scheduler)

	log(text, module = '', level = 'info') {
		this.logs.push({ t: Date.now(), module, text, level });
		if (this.logs.length > MAX_LOG) this.logs.splice(0, this.logs.length - MAX_LOG);
	}

	onParse(document, reason, start, end, result) {
		const module = moduleManager.getModuleName(document.fileName);
		if (!result) return;
		if (!result.changed) {
			this.log(`parse skipped - text unchanged (${reason})`, module, 'dim');
			return;
		}
		const invalidated = result.invalidated.filter(mod => mod !== module);
		const interfaceInfo = result.interfaceChanged ? `interface changed, outdated dependents: ${invalidated.length}` : 'interface unchanged';
		this.segments.push({ lane: module, kind: 'parse', start, end, label: `parse ${end - start} ms (${reason}) - ${interfaceInfo}` });
		this.log(`parsed in ${end - start} ms (${reason}) - ${interfaceInfo}${invalidated.length ? `: ${invalidated.slice(0, 15).join(', ')}${invalidated.length > 15 ? ', ...' : ''}` : ''}`, module);
	}

	onQueued(moduleNames, reason) {
		this.log(`type check requested (${reason}): ${moduleNames.join(', ')}`, moduleNames.length === 1 ? moduleNames[0] : '');
	}

	onJobStart(job) {
		const segment = { lane: job.moduleName, kind: 'job', queuedAt: job.queuedAt, start: job.startedAt, end: null, activeMs: 0, slices: 0, outcome: null, reason: '' };
		this.segments.push(segment);
		this.jobs.set(job, { segment, slice: null });
	}

	onSliceStart(job) {
		const info = this.jobs.get(job);
		if (!info || info.slice) return;
		const now = Date.now();
		const last = info.lastSlice;
		info.segment.slices++;
		if (last && now - last.end <= MERGE_SLICES_MS) {
			last.end = null;
			info.slice = last;
		} else {
			info.slice = { lane: job.moduleName, kind: 'check', start: now, end: null };
			this.segments.push(info.slice);
		}
		info.sliceStart = now;
	}

	onSliceEnd(job) {
		const info = this.jobs.get(job);
		if (!info?.slice) return;
		const now = Date.now();
		info.slice.end = now;
		info.segment.activeMs += now - info.sliceStart;
		info.lastSlice = info.slice;
		info.slice = null;
	}

	onJobEnd(job, outcome, reason) {
		const info = this.jobs.get(job);
		if (!info) return;
		this.onSliceEnd(job);
		this.jobs.delete(job);
		const segment = info.segment;
		segment.end = Date.now();
		segment.outcome = outcome;
		segment.reason = reason;
		const total = segment.end - segment.start;
		const text = `type check ${outcome}${reason ? ` - ${reason}` : ''}: working ${segment.activeMs} ms, total ${total} ms (paused ${Math.max(0, total - segment.activeMs)} ms), waited in queue ${segment.start - segment.queuedAt} ms`;
		this.log(text, job.moduleName, outcome === 'done' ? 'ok' : outcome === 'cancelled' || outcome === 'error' ? 'error' : 'warn');
	}

	prune() {
		const limit = Date.now() - HISTORY_MS;
		this.segments = this.segments.filter(seg => seg.end === null || seg.end >= limit);
	}

	getStats() {
		const since = Date.now() - 60 * 1000;
		const recent = this.segments.filter(seg => (seg.end ?? Date.now()) >= since);
		const parses = recent.filter(seg => seg.kind === 'parse');
		const jobs = recent.filter(seg => seg.kind === 'job' && seg.end !== null);
		const done = jobs.filter(seg => seg.outcome === 'done');
		const lags = recent.filter(seg => seg.kind === 'lag');
		const avg = (list, f) => list.length ? Math.round(list.reduce((sum, x) => sum + f(x), 0) / list.length) : 0;
		return {
			parses: parses.length,
			parseAvg: avg(parses, seg => seg.end - seg.start),
			parseMax: Math.max(0, ...parses.map(seg => seg.end - seg.start)),
			checksDone: done.length,
			checkAvg: avg(done, seg => seg.activeMs),
			cancelled: jobs.filter(seg => seg.outcome === 'cancelled').length,
			lagMax: Math.max(0, ...lags.map(seg => seg.end - seg.start)),
			lagCount: lags.length,
		};
	}

	// ---------------------------------------------------------------- webview

	show() {
		if (this.panel) {
			this.panel.reveal();
			return;
		}
		this.panel = vscode.window.createWebviewPanel('nianiolangAnalysisMonitor', 'NianioLang: Analysis Monitor', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
		this.panel.webview.html = getHtml(crypto.randomBytes(16).toString('hex'));
		this.panel.onDidDispose(() => {
			clearInterval(this.updateTimer);
			this.updateTimer = null;
			this.panel = null;
		});
		this.panel.webview.onDidReceiveMessage(message => {
			if (message.type === 'clear') {
				this.segments = this.segments.filter(seg => seg.end === null);
				this.logs = [];
			} else if (message.type === 'open' && message.module) {
				const mod = moduleManager.getModule(message.module);
				if (mod) vscode.window.showTextDocument(vscode.Uri.file(mod.filePath), { viewColumn: vscode.ViewColumn.One });
			}
		});
		this.updateTimer = setInterval(() => this.postUpdate(), 250);
		this.postUpdate();
	}

	postUpdate() {
		if (!this.panel?.visible) return;
		this.prune();
		this.panel.webview.postMessage({
			type: 'update',
			now: Date.now(),
			state: this.scheduler.getDebugState(),
			stats: this.getStats(),
			segments: this.segments,
			logs: this.logs.slice(-200),
		});
	}
}

function getHtml(nonce) {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Analysis Monitor</title>
<style>
	body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 8px 12px; }
	h3 { margin: 14px 0 6px; font-size: 1.05em; }
	.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
	button, select { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 3px 10px; cursor: pointer; }
	button:hover { background: var(--vscode-button-secondaryHoverBackground); }
	.stats { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
	.stat { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; border-radius: 3px; }
	.stat b { font-size: 1.15em; }
	.dim { color: var(--vscode-descriptionForeground); }
	#timelineWrap { position: relative; border: 1px solid var(--vscode-panel-border); }
	canvas { display: block; width: 100%; }
	#tooltip { position: absolute; pointer-events: none; background: var(--vscode-editorHoverWidget-background); border: 1px solid var(--vscode-editorHoverWidget-border); padding: 4px 6px; white-space: pre; display: none; z-index: 2; }
	.legend { display: flex; gap: 12px; flex-wrap: wrap; margin: 4px 0; }
	.legend span::before { content: ''; display: inline-block; width: 12px; height: 8px; margin-right: 4px; background: var(--c); vertical-align: middle; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 0 18px; }
	table { border-collapse: collapse; width: 100%; }
	th, td { text-align: left; padding: 2px 6px; border-bottom: 1px solid var(--vscode-panel-border); white-space: nowrap; }
	th { color: var(--vscode-descriptionForeground); font-weight: normal; }
	td.mod { cursor: pointer; text-decoration: underline dotted; }
	.running { color: var(--vscode-charts-green); } .paused, .resuming { color: var(--vscode-charts-yellow); } .queued { color: var(--vscode-descriptionForeground); }
	.ok { color: var(--vscode-charts-green); } .warn { color: var(--vscode-charts-orange); } .error { color: var(--vscode-charts-red); }
	#log { font-family: var(--vscode-editor-font-family); font-size: 0.92em; max-height: 320px; overflow-y: auto; }
	#log div { white-space: pre-wrap; }
</style>
</head>
<body>
<div class="toolbar">
	<b>Analysis monitor</b><span id="mode" class="dim"></span>
	<span style="flex:1"></span>
	window <select id="window"><option>10</option><option selected>30</option><option>60</option><option>180</option></select> s
	<button id="pause">Pause</button><button id="clear">Clear</button>
</div>
<div class="stats" id="stats"></div>
<div class="legend">
	<span style="--c: var(--vscode-charts-blue)">parse</span>
	<span style="--c: var(--vscode-charts-green)">type check working</span>
	<span style="--c: var(--vscode-descriptionForeground)">job started, paused (thin line)</span>
	<span style="--c: var(--vscode-charts-yellow)">waiting in queue (dotted)</span>
	<span style="--c: var(--vscode-charts-red)">cancelled ✕ / main thread blocked</span>
	<span style="--c: var(--vscode-charts-orange)">finished, but outdated</span>
</div>
<div id="timelineWrap"><canvas id="timeline"></canvas><div id="tooltip"></div></div>
<div class="grid">
	<div><h3>Type check jobs</h3><table id="jobs"></table></div>
	<div><h3>Pending parses (debounced typing)</h3><table id="parses"></table></div>
</div>
<h3>Open modules</h3><table id="open"></table>
<h3>Log <span class="dim">(newest first)</span></h3><div id="log"></div>
<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let data = null, paused = false, frozenNow = 0, clockOffset = 0, hits = [];
	const $ = (id) => document.getElementById(id);
	const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
	const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim() || '#888';
	const time = (t) => new Date(t).toLocaleTimeString() + '.' + String(t % 1000).padStart(3, '0');
	const LANE_H = 18, LABEL_W = 170, TOP = 18;

	$('pause').onclick = () => { paused = !paused; frozenNow = Date.now() + clockOffset; $('pause').textContent = paused ? 'Resume' : 'Pause'; };
	$('clear').onclick = () => vscode.postMessage({ type: 'clear' });
	document.body.addEventListener('click', e => { const m = e.target.closest('[data-module]'); if (m) vscode.postMessage({ type: 'open', module: m.dataset.module }); });

	window.addEventListener('message', e => {
		if (e.data.type !== 'update') return;
		clockOffset = e.data.now - Date.now();
		if (paused) return;
		data = e.data;
		renderTables();
	});

	function renderTables() {
		const s = data.state, st = data.stats;
		$('mode').textContent = ' checkTypes: ' + s.mode + ' | scope: ' + s.scope;
		$('stats').innerHTML = [
			['modules', s.moduleCount], ['types outdated', s.outdatedCount],
			['parses / min', st.parses], ['parse avg / max', st.parseAvg + ' / ' + st.parseMax + ' ms'],
			['checks done / min', st.checksDone], ['check avg (working)', st.checkAvg + ' ms'],
			['cancelled / min', st.cancelled], ['main thread blocked / min', st.lagCount + 'x, max ' + st.lagMax + ' ms'],
		].map(([k, v]) => '<div class="stat"><span class="dim">' + k + '</span> <b>' + v + '</b></div>').join('');
		const now = data.now;
		$('jobs').innerHTML = '<tr><th>module</th><th>state</th><th>priority</th><th>for</th></tr>' + (s.jobs.length ? s.jobs.map(j =>
			'<tr><td class="mod" data-module="' + esc(j.module) + '">' + esc(j.module) + '</td><td class="' + j.state + '">' + j.state + '</td><td>' + j.priority + '</td><td>' + (now - j.since) + ' ms' + (j.waited !== undefined ? ' <span class="dim">(queued ' + j.waited + ' ms)</span>' : '') + '</td></tr>').join('')
			: '<tr><td colspan="4" class="dim">idle</td></tr>');
		$('parses').innerHTML = '<tr><th>module</th><th>parse in</th><th>then check types</th></tr>' + (s.pendingParses.length ? s.pendingParses.map(p =>
			'<tr><td class="mod" data-module="' + esc(p.module) + '">' + esc(p.module) + '</td><td>' + p.dueIn + ' ms</td><td>' + (p.checkTypes ? 'yes' : 'no') + '</td></tr>').join('')
			: '<tr><td colspan="3" class="dim">none</td></tr>');
		const typesClass = (t) => t === 'up to date' ? 'ok' : t === 'outdated' ? 'warn' : t.startsWith('check') ? 'running' : 'queued';
		$('open').innerHTML = '<tr><th>module</th><th>priority</th><th>types</th><th>input stamp / checked</th><th>diagnostics</th></tr>' + s.openModules.map(m =>
			'<tr><td class="mod" data-module="' + esc(m.module) + '">' + esc(m.module) + '</td><td>' + m.priority + '</td><td class="' + typesClass(m.types) + '">' + m.types + '</td><td>' + m.stamp + ' / ' + m.checkedStamp + '</td><td>' + m.errors + '</td></tr>').join('');
		const logEl = $('log');
		logEl.innerHTML = data.logs.slice().reverse().map(l =>
			'<div class="' + (l.level === 'dim' ? 'dim' : l.level) + '"><span class="dim">' + time(l.t) + '</span> ' + (l.module ? '<b>' + esc(l.module) + '</b> ' : '') + esc(l.text) + '</div>').join('');
	}

	function draw() {
		requestAnimationFrame(draw);
		if (!data) return;
		const canvas = $('timeline');
		const now = paused ? frozenNow : Date.now() + clockOffset;
		const windowMs = Number($('window').value) * 1000;
		const from = now - windowMs;
		const visible = data.segments.filter(seg => (seg.end ?? now) >= from && (seg.queuedAt ?? seg.start) <= now);
		// lanes: main thread first, then modules by the latest activity
		const last = new Map();
		for (const seg of visible) last.set(seg.lane, Math.max(last.get(seg.lane) ?? 0, seg.end ?? now));
		const lanes = ['⚠ main thread', ...[...last.keys()].filter(l => l !== '⚠ main thread').sort((a, b) => last.get(b) - last.get(a)).slice(0, 40)];
		const dpr = window.devicePixelRatio || 1;
		const width = canvas.clientWidth, height = TOP + lanes.length * LANE_H + 4;
		if (canvas.width !== width * dpr || canvas.height !== height * dpr) { canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.height = height + 'px'; }
		const ctx = canvas.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		ctx.font = '11px ' + css('--vscode-font-family');
		const plotW = width - LABEL_W - 8;
		const x = (t) => LABEL_W + Math.max(0, Math.min(1, (t - from) / windowMs)) * plotW;
		const fg = css('--vscode-foreground'), dim = css('--vscode-descriptionForeground'), border = css('--vscode-panel-border');
		// grid
		const step = windowMs <= 10000 ? 1000 : windowMs <= 60000 ? 5000 : 20000;
		ctx.fillStyle = dim; ctx.strokeStyle = border; ctx.lineWidth = 1;
		for (let t = Math.ceil(from / step) * step; t <= now; t += step) {
			const px = Math.round(x(t)) + 0.5;
			ctx.beginPath(); ctx.moveTo(px, TOP - 4); ctx.lineTo(px, height); ctx.stroke();
			ctx.fillText('-' + Math.round((now - t) / 1000) + 's', px + 2, 11);
		}
		const laneIndex = new Map(lanes.map((l, i) => [l, i]));
		hits = [];
		lanes.forEach((lane, i) => {
			const y = TOP + i * LANE_H;
			if (i % 2) { ctx.fillStyle = 'rgba(128,128,128,0.06)'; ctx.fillRect(0, y, width, LANE_H); }
			ctx.fillStyle = i === 0 ? css('--vscode-charts-red') : fg;
			ctx.fillText(lane.length > 26 ? lane.slice(0, 25) + '…' : lane, 4, y + 13);
		});
		const colors = { parse: css('--vscode-charts-blue'), check: css('--vscode-charts-green'), lag: css('--vscode-charts-red'), queue: css('--vscode-charts-yellow'), cancelled: css('--vscode-charts-red'), outdated: css('--vscode-charts-orange'), done: css('--vscode-charts-green'), job: dim };
		const order = { job: 0, check: 1, parse: 2, lag: 2 };
		for (const seg of visible.slice().sort((a, b) => order[a.kind] - order[b.kind])) {
			const li = laneIndex.get(seg.lane);
			if (li === undefined) continue;
			const y = TOP + li * LANE_H, mid = y + LANE_H / 2;
			const end = seg.end ?? now;
			const x1 = x(seg.start), x2 = Math.max(x(end), x1 + 2);
			if (seg.kind === 'job') {
				if (seg.queuedAt < seg.start) {
					ctx.strokeStyle = colors.queue; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x(seg.queuedAt), mid); ctx.lineTo(x1, mid); ctx.stroke(); ctx.setLineDash([]);
					hits.push({ x1: x(seg.queuedAt), x2: x1, y, text: seg.lane + '\\nwaiting in queue ' + (seg.start - seg.queuedAt) + ' ms' });
				}
				ctx.fillStyle = colors.job; ctx.fillRect(x1, mid - 1, x2 - x1, 2);
				if (seg.end !== null) {
					const c = colors[seg.outcome] ?? colors.outdated;
					ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 2;
					if (seg.outcome === 'cancelled' || seg.outcome === 'error') { ctx.beginPath(); ctx.moveTo(x2 - 4, mid - 4); ctx.lineTo(x2 + 4, mid + 4); ctx.moveTo(x2 - 4, mid + 4); ctx.lineTo(x2 + 4, mid - 4); ctx.stroke(); }
					else { ctx.beginPath(); ctx.arc(x2, mid, 3.5, 0, Math.PI * 2); ctx.fill(); }
					ctx.lineWidth = 1;
				}
				const total = end - seg.start;
				hits.push({ x1, x2: x2 + 4, y, text: seg.lane + '\\ntype check ' + (seg.outcome ?? 'in progress') + (seg.reason ? ' - ' + seg.reason : '') + '\\nworking ' + seg.activeMs + ' ms, paused ' + Math.max(0, total - seg.activeMs) + ' ms, total ' + total + ' ms\\nslices: ' + seg.slices, low: true });
			} else {
				const h = seg.kind === 'check' ? 10 : 12;
				ctx.fillStyle = colors[seg.kind];
				ctx.fillRect(x1, mid - h / 2, x2 - x1, h);
				hits.push({ x1, x2, y, text: seg.lane + '\\n' + (seg.label ?? (seg.kind + ' ' + (end - seg.start) + ' ms')) });
			}
		}
		// now line
		ctx.strokeStyle = fg; ctx.beginPath(); ctx.moveTo(x(now) - 0.5, TOP - 4); ctx.lineTo(x(now) - 0.5, height); ctx.stroke();
	}
	requestAnimationFrame(draw);

	$('timeline').addEventListener('mousemove', e => {
		const rect = e.target.getBoundingClientRect();
		const mx = e.clientX - rect.left, my = e.clientY - rect.top;
		const candidates = hits.filter(h => my >= h.y && my < h.y + LANE_H && mx >= h.x1 - 3 && mx <= h.x2 + 3);
		const hit = candidates.find(h => !h.low) ?? candidates[0];
		const tip = $('tooltip');
		if (!hit) { tip.style.display = 'none'; return; }
		tip.textContent = hit.text;
		tip.style.display = 'block';
		tip.style.left = Math.min(mx + 12, rect.width - tip.offsetWidth - 4) + 'px';
		tip.style.top = (my + 14) + 'px';
	});
	$('timeline').addEventListener('mouseleave', () => $('tooltip').style.display = 'none');
</script>
</body>
</html>`;
}

module.exports = { AnalysisMonitor };
