const vscode = require('vscode');
const path = require('path');
const moduleManager = require('./moduleManager');
const diagnosticsManager = require('./diagnosticsManager');

// Global management of parsing and type checking.
//
// Parsing (fast, synchronous) is debounced per document while typing and done immediately when the result
// is needed (save, language features - see ensureParsed). Every parse which changes a module marks the module
// as outdated and - only when its interface (public signatures and types) changed - also all modules which
// (transitively) depend on it.
//
// Type checking (slow) runs as cooperative jobs, one module per job:
//  - a job is cancelled only when its own input changes, i.e. when the checked module or one of the modules it
//    depends on is changed again and a new check is requested - checks of independent modules keep running,
//  - between checked functions a job yields to the event loop (so typing and saving stay responsive) and is
//    paused when a job with a higher priority (active editor > visible editors > open tabs > others) is waiting.
//
// In debug mode `monitor` (AnalysisMonitor) records what happens - see analysisMonitor.js.

const PARSE_DEBOUNCE_MS = 200;
const TIME_SLICE_MS = 15;
const MAX_STARTED_JOBS = 4; // running + paused

const Priority = { ACTIVE: 0, VISIBLE: 1, OPEN: 2, BACKGROUND: 3 };
const PriorityNames = ['active', 'visible', 'open', 'background'];

const isNl = (document) => !!document && document.uri.scheme === 'file' && document.languageId === 'nianiolang' && path.extname(document.fileName) === '.nl';
const nextTick = () => new Promise(resolve => setImmediate(resolve));
const getConfig = () => vscode.workspace.getConfiguration('nianiolang');

class CancellationToken {
	constructor() {
		this.isCancelled = false;
		this._listeners = [];
	}
	cancel() {
		if (this.isCancelled) return;
		this.isCancelled = true;
		this._listeners.splice(0).forEach(listener => listener());
	}
	onCancelled(listener) {
		if (this.isCancelled) listener();
		else this._listeners.push(listener);
	}
}

class TypeCheckJob {
	constructor(scheduler, moduleName, seq) {
		this.scheduler = scheduler;
		this.moduleName = moduleName;
		this.seq = seq;
		this.token = new CancellationToken();
		this.stamp = null; // input version of the module when the check started
		this.cancelReason = null;
		this.startedAt = Date.now();
		this.paused = true;
		this._wake = null;
		this.token.onCancelled(() => this._resume());
	}
	shouldPause() {
		return performance.now() - this.scheduler.sliceStart >= TIME_SLICE_MS;
	}
	// lets the event loop process pending events, then waits until this job is the most important started job
	async pause() {
		this.paused = true;
		this.scheduler.monitor?.onSliceEnd(this);
		await nextTick();
		this.scheduler.startJobs();
		while (!this.token.isCancelled && this.scheduler.getRunningJob() !== this) {
			this.scheduler.resumeRunningJob();
			await new Promise(resolve => this._wake = resolve);
		}
		this.scheduler.sliceStart = performance.now();
		if (this.token.isCancelled) return;
		this.paused = false;
		this.scheduler.monitor?.onSliceStart(this);
		this.scheduler.updateStatusBar();
	}
	_resume() {
		const wake = this._wake;
		this._wake = null;
		wake?.();
	}
}

class AnalysisScheduler {
	constructor() {
		this.pendingParses = new Map(); // uri -> { timer, document, checkTypes, dueAt }
		this.queue = new Map(); // module name -> seq (type checks waiting to start)
		this.queuedAt = new Map(); // module name -> time (debug info)
		this.started = new Map(); // module name -> TypeCheckJob
		this.seq = 0;
		this.sliceStart = 0;
		this.onModuleParsed = () => { };
		this.onTypesChecked = (moduleName) => { };
		/** @type {import('./analysisMonitor').AnalysisMonitor | null} */
		this.monitor = null;
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
		this.statusBarItem.name = 'NianioLang Dev Kit: analysis';
	}

	dispose() {
		this.pendingParses.forEach(pending => clearTimeout(pending.timer));
		this.pendingParses.clear();
		this.queue.clear();
		this.started.forEach(job => job.token.cancel());
		this.statusBarItem.dispose();
	}

	checkTypesMode() {
		return getConfig().get('checkTypes') ?? 'none';
	}

	// ---------------------------------------------------------------- parsing

	onDocumentChanged(document) {
		if (!isNl(document)) return;
		const key = document.uri.toString();
		const pending = this.pendingParses.get(key);
		if (pending) clearTimeout(pending.timer);
		const checkTypes = this.checkTypesMode() === 'On change and save';
		const timer = setTimeout(() => this.flushParse(document, 'typing'), PARSE_DEBOUNCE_MS);
		this.pendingParses.set(key, { timer, document, checkTypes: checkTypes || !!pending?.checkTypes, dueAt: Date.now() + PARSE_DEBOUNCE_MS });
	}

	// runs the pending (debounced) parse of the document immediately
	flushParse(document, reason = 'typing, needed now') {
		const key = document.uri.toString();
		const pending = this.pendingParses.get(key);
		if (!pending) return;
		clearTimeout(pending.timer);
		this.pendingParses.delete(key);
		this.parse(pending.document, pending.checkTypes, reason);
	}

	// e.g. before features using references between modules
	flushAllParses() {
		[...this.pendingParses.values()].forEach(pending => this.flushParse(pending.document));
	}

	// Makes sure the module of the document reflects its current text (used by language features).
	ensureParsed(document) {
		if (!isNl(document)) return;
		this.flushParse(document);
		if (!moduleManager.isParsed(document)) this.parse(document, false, 'needed now');
	}

	parse(document, checkTypes, reason) {
		const start = Date.now();
		const result = moduleManager.updateModule(document);
		this.monitor?.onParse(document, reason, start, Date.now(), result);
		if (!result) return null;
		if (result.changed) {
			diagnosticsManager.publishModuleDiagnostics(result.moduleName);
			this.onModuleParsed(result);
		}
		if (checkTypes) this.requestTypeCheck(this.getModulesToCheck(result.moduleName), reason);
		return result;
	}

	onDocumentSaved(document) {
		if (!isNl(document)) return;
		this.flushParse(document, 'typing, saved');
		this.parse(document, this.checkTypesMode() !== 'none', 'save');
	}

	// file changed outside of the editor (or saved - then the text is the same and nothing happens)
	async onFileChanged(uri, reason = 'file changed') {
		const document = await moduleManager.readDocument(uri);
		if (!document) return;
		const result = this.parse(document, false, reason);
		if (result?.changed && this.checkTypesMode() !== 'none') this.requestTypeCheck(this.getModulesToCheck(result.moduleName, false), reason);
	}

	onFileCreated(uri) {
		return this.onFileChanged(uri, 'file created');
	}

	onFileDeleted(uri) {
		const key = uri.toString();
		const pending = this.pendingParses.get(key);
		if (pending) {
			clearTimeout(pending.timer);
			this.pendingParses.delete(key);
		}
		const result = moduleManager.removeModule(uri.fsPath);
		if (!result) return;
		this.monitor?.log(`module ${result.moduleName} removed, outdated: ${result.invalidated.join(', ') || '-'}`, result.moduleName);
		this.cancelJob(result.moduleName, 'module deleted');
		diagnosticsManager.deleteDiagnostics(uri);
		this.onModuleParsed(result);
		if (this.checkTypesMode() !== 'none') this.requestTypeCheck(result.invalidated.filter(this.getScopeFilter()), 'module deleted');
	}

	// ---------------------------------------------------------------- type checking

	// the module (edited one is always checked) and the modules depending on it, which have outdated types
	getModulesToCheck(moduleName, alwaysCheckModule = true) {
		const inScope = this.getScopeFilter();
		return [moduleName, ...moduleManager.getDependentModules(moduleName)]
			.filter(mod => (alwaysCheckModule && mod === moduleName) || inScope(mod))
			.filter(moduleManager.isTypesCheckOutdated);
	}

	// which modules are checked when they are not edited: open ones (default) or all
	getScopeFilter() {
		if (getConfig().get('checkTypesScope') === 'All files') return () => true;
		const open = this.getEditorState().open;
		return (moduleName) => open.has(moduleName);
	}

	// type checks of visible modules with outdated types (e.g. after a change in a module they depend on)
	checkVisibleModules() {
		this.checkModulesWithOutdatedTypes(this.getEditorState().visible, 'became visible');
	}

	checkOpenModules(reason = 'open tabs') {
		this.checkModulesWithOutdatedTypes(this.getEditorState().open, reason);
	}

	checkModulesWithOutdatedTypes(moduleNames, reason) {
		const mode = this.checkTypesMode();
		if (mode === 'none') return;
		// in 'On save' mode unsaved changes are not checked
		const unsaved = new Set(mode !== 'On save' ? [] : vscode.workspace.textDocuments
			.filter(document => document.isDirty && isNl(document))
			.map(document => moduleManager.getModuleName(document.fileName)));
		this.requestTypeCheck([...moduleNames].filter(mod => !unsaved.has(mod) && moduleManager.isTypesCheckOutdated(mod)), reason);
	}

	requestTypeCheck(moduleNames, reason = '') {
		const queued = [];
		for (const moduleName of moduleNames) {
			const job = this.started.get(moduleName);
			if (job) {
				// the check in progress works on up to date input - nothing to do
				if (job.stamp === moduleManager.getModule(moduleName)?.stamp) continue;
				// the input of the check changed - its result would be outdated
				this.cancelJob(moduleName, `input changed (${reason})`);
			}
			if (!this.queue.has(moduleName)) {
				this.queue.set(moduleName, this.seq++);
				this.queuedAt.set(moduleName, Date.now());
				queued.push(moduleName);
			}
		}
		if (queued.length > 0) this.monitor?.onQueued(queued, reason);
		this.startJobs();
	}

	cancelJob(moduleName, reason) {
		this.queue.delete(moduleName);
		const job = this.started.get(moduleName);
		if (!job) return;
		this.started.delete(moduleName);
		job.cancelReason = reason;
		job.token.cancel();
		this.monitor?.onJobEnd(job, 'cancelled', reason);
		this.resumeRunningJob();
		this.updateStatusBar();
	}

	getEditorState() {
		const toModule = (uri) => uri && uri.scheme === 'file' && path.extname(uri.fsPath) === '.nl' ? moduleManager.getModuleName(uri.fsPath) : null;
		const active = toModule(vscode.window.activeTextEditor?.document.uri);
		const visible = new Set(vscode.window.visibleTextEditors.map(editor => toModule(editor.document.uri)).filter(Boolean));
		const open = new Set(visible);
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const mod = toModule(tab.input?.uri);
				if (mod) open.add(mod);
			}
		}
		return { active, visible, open };
	}

	getPriority(moduleName, state) {
		if (moduleName === state.active) return Priority.ACTIVE;
		if (state.visible.has(moduleName)) return Priority.VISIBLE;
		if (state.open.has(moduleName)) return Priority.OPEN;
		return Priority.BACKGROUND;
	}

	// the most important of the given [moduleName, seq] entries
	pickBest(entries, state) {
		let best = null;
		let bestKey = null;
		for (const [moduleName, seq] of entries) {
			const key = [this.getPriority(moduleName, state), seq];
			if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
				best = moduleName;
				bestKey = key;
			}
		}
		return best === null ? null : { moduleName: best, priority: bestKey[0] };
	}

	// the started job which should be running now (the others are paused)
	getRunningJob(state = this.getEditorState()) {
		const best = this.pickBest([...this.started.values()].map(job => [job.moduleName, job.seq]), state);
		return best ? this.started.get(best.moduleName) : null;
	}

	resumeRunningJob() {
		this.getRunningJob()?._resume();
	}

	// starts queued jobs: when nothing runs, or when a queued job is more important than every started one
	startJobs() {
		const state = this.getEditorState();
		while (this.queue.size > 0 && this.started.size < MAX_STARTED_JOBS) {
			const next = this.pickBest(this.queue.entries(), state);
			const running = this.getRunningJob(state);
			if (running && this.getPriority(running.moduleName, state) <= next.priority) break;
			this.startJob(next.moduleName);
		}
		this.updateStatusBar();
	}

	startJob(moduleName) {
		const seq = this.queue.get(moduleName);
		this.queue.delete(moduleName);
		const job = new TypeCheckJob(this, moduleName, seq);
		job.stamp = moduleManager.getModule(moduleName)?.stamp ?? null;
		job.queuedAt = this.queuedAt.get(moduleName) ?? job.startedAt;
		this.started.set(moduleName, job);
		this.monitor?.onJobStart(job);
		// started asynchronously - it may be called from a paused job
		Promise.resolve().then(() => this.runJob(job));
	}

	async runJob(job) {
		let stored = false;
		let outcome = 'done';
		try {
			// wait for the turn (a more important job may be running)
			if (this.getRunningJob() !== job) await job.pause();
			else {
				job.paused = false;
				this.monitor?.onSliceStart(job);
			}
			this.sliceStart = performance.now();
			if (!job.token.isCancelled) stored = await moduleManager.checkModuleTypes(job.moduleName, job);
			if (!stored) outcome = job.token.isCancelled ? 'cancelled' : 'skipped';
			else if (moduleManager.isTypesCheckOutdated(job.moduleName)) outcome = 'outdated';
		} catch (e) {
			console.error(e);
			outcome = 'error';
		} finally {
			if (!job.paused) this.monitor?.onSliceEnd(job);
			// a cancelled job is reported by cancelJob
			if (!job.token.isCancelled) this.monitor?.onJobEnd(job, outcome, outcome === 'outdated' ? 'input changed during the check' : '');
			if (this.started.get(job.moduleName) === job) this.started.delete(job.moduleName);
			if (stored && !job.token.isCancelled) {
				diagnosticsManager.publishModuleDiagnostics(job.moduleName);
				this.onTypesChecked(job.moduleName);
			}
			this.startJobs();
			this.resumeRunningJob();
		}
	}

	updateStatusBar() {
		const running = this.getRunningJob();
		if (!running) {
			this.statusBarItem.hide();
			return;
		}
		const waiting = this.started.size - 1 + this.queue.size;
		this.statusBarItem.text = `$(sync~spin) NL: checking types ${running.moduleName}${waiting > 0 ? ` (+${waiting})` : ''}`;
		this.statusBarItem.tooltip = `NianioLang Dev Kit: checking types\nrunning: ${running.moduleName}\nwaiting: ${[...this.started.keys(), ...this.queue.keys()].filter(mod => mod !== running.moduleName).join(', ') || '-'}`;
		this.statusBarItem.command = this.monitor ? 'nianiolang.showAnalysisMonitor' : undefined;
		this.statusBarItem.show();
	}

	// current state for the monitor
	getDebugState() {
		const state = this.getEditorState();
		const running = this.getRunningJob(state);
		const now = Date.now();
		const jobs = [
			...[...this.started.values()].map(job => ({
				module: job.moduleName,
				state: job === running && !job.paused ? 'running' : job === running ? 'resuming' : 'paused',
				priority: PriorityNames[this.getPriority(job.moduleName, state)],
				since: job.startedAt,
				waited: job.startedAt - job.queuedAt,
			})),
			...[...this.queue.entries()].sort((a, b) => a[1] - b[1]).map(([moduleName]) => ({
				module: moduleName,
				state: 'queued',
				priority: PriorityNames[this.getPriority(moduleName, state)],
				since: this.queuedAt.get(moduleName) ?? now,
			})),
		];
		const pendingParses = [...this.pendingParses.values()].map(pending => ({
			module: moduleManager.getModuleName(pending.document.fileName),
			dueIn: Math.max(0, pending.dueAt - now),
			checkTypes: pending.checkTypes,
		}));
		const modules = Object.values(moduleManager.moduleCache);
		const openModules = [...state.open].sort().map(name => {
			const mod = moduleManager.getModule(name);
			const job = this.started.get(name);
			return {
				module: name,
				priority: PriorityNames[this.getPriority(name, state)],
				types: !mod ? 'not loaded' : job ? (job.paused ? 'check paused' : 'checking') : this.queue.has(name) ? 'queued' : mod.typesChecked ? 'up to date' : 'outdated',
				stamp: mod?.stamp ?? '-',
				checkedStamp: mod?.checkedStamp ?? '-',
				errors: mod ? mod.staticDiagnostics.length + mod.dynamicDiagnostics.length : 0,
			};
		});
		return {
			now,
			mode: this.checkTypesMode(),
			scope: getConfig().get('checkTypesScope') ?? 'Open files',
			jobs,
			pendingParses,
			openModules,
			moduleCount: modules.length,
			outdatedCount: modules.filter(mod => !mod.typesChecked).length,
		};
	}
}

module.exports = { AnalysisScheduler, CancellationToken };
