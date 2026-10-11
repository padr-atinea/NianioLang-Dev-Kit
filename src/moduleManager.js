const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

const ov = require('./nianioLibs/base/ov');
const nparser = require('./nianioLibs/parsers/nparser');
const module_checker = require('./nianioLibs/parsers/module_checker');
const ptd_parser = require('./nianioLibs/parsers/ptd_parser');
const pretty_printer = require('./nianioLibs/printers/pretty_printer');
const modern_pretty_printer = require('./nianioLibs/printers/modern_pretty_printer');
const js_printer = require('./nianioLibs/printers/js_printer');
const type_checker = require('./nianioLibs/type_checker/type_checker');
const positionTracker = require('./positionTracker');
const inferred_types = require('./nianioLibs/type_checker/inferred_types');

const knownTypes = {};
const knownTypesInModule = {};

const libModules = {};
const moduleCache = {};
const referenceCache = {};
const referenceBackCache = {};
const usingsBackCashe = {};
// per module: { text, uri, version, interfaceKey } - kept outside moduleCache so it is not shown in 'This Module Object'
const moduleSources = {};
// per module: type_checker def_fun of the module (depends only on its own AST, so it is computed once per parse)
const defFunCache = {};
let ig = ignore();

function updateIgnore() {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return;
	const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
	ig = ignore();
	const gitignorePath = path.join(workspaceFolderPath, '.gitignore');
	const vscodeignorePath = path.join(workspaceFolderPath, '.vscodeignore');
	if (fs.existsSync(gitignorePath)) ig.add(fs.readFileSync(gitignorePath, 'utf8'));
	if (fs.existsSync(vscodeignorePath)) ig.add(fs.readFileSync(vscodeignorePath, 'utf8'));
}

// the ignore rules are refreshed by findFiles and by the .gitignore/.vscodeignore file watcher,
// so they are not re-read from disk on every parse
function checkFileIgnore(filePath) {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return true;
	const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
	return ig.ignores(path.relative(workspaceFolderPath, filePath));
}

const getModuleName = (filePath) => path.basename(filePath, path.extname(filePath));

const showDebugInfo = false;
const showDebugHoverInfo = false;

const isNotNl = (document, ext = '.nl') => !document || document.uri.scheme !== 'file' || document.languageId !== 'nianiolang' || path.extname(document.fileName) !== ext;

// Is the parsed state of the module up to date with the document? (cheap - no text comparison)
function isParsed(document) {
	const source = moduleSources[getModuleName(document.uri.fsPath)];
	return !!source && source.uri === document.uri.toString() && source.version === document.version;
}

// Parses the document and updates all caches.
// Returns null when the document is not a (not ignored) module, otherwise
// { moduleName, changed, interfaceChanged, invalidated: [names of modules whose types became outdated] }.
// Nothing is done (changed: false) when the text is the same as the last parsed one.
function updateModule(document, init = false) {
	if (isNotNl(document)) return null;
	const filePath = document.uri.fsPath;
	if (checkFileIgnore(filePath)) return null;
	const thisModuleName = getModuleName(filePath);
	const uri = document.uri.toString();
	const text = document.getText();
	const source = moduleSources[thisModuleName];
	if (source && source.text === text && moduleCache[thisModuleName]?.filePath === filePath) {
		// the same text: type checking results computed for the previous version are valid for this one too
		// (e.g. a module loaded from disk and then opened in the editor)
		const typeResults = moduleCache[thisModuleName].typeResults;
		if (typeResults?.base && typeResults.base.uri === source.uri && typeResults.base.version === source.version && source.version !== document.version) {
			typeResults.base = { uri, version: document.version };
			typeResults.view = null;
			positionTracker.setBase(typeResults.base);
		}
		source.uri = uri;
		source.version = document.version;
		return { moduleName: thisModuleName, changed: false, interfaceChanged: false, invalidated: [] };
	}
	const methods = {};
	if (!init && showDebugInfo) console.time(`updateModule ${thisModuleName}`);
	let result = null;
	try {
		clearReferenceCache(filePath);

		(knownTypesInModule[thisModuleName] ?? []).forEach(name => delete knownTypes[name]);
		knownTypesInModule[thisModuleName] = [];

		let methodDependencies = {};

		const addMethod = (fun) => {
			fun.endLine = fun.cmd.debug.end.line;
			fun.rawRange = new vscode.Range(fun.line - 1, 0, fun.endLine - 1, 1);
			fun.rawMethod = [...fun.comment, document.getText(fun.rawRange)].join('\n');
			fun.dependencies = { ...methodDependencies };
			methodDependencies = {};
			const name = `${ov.is(fun.access, 'pub') ? `${thisModuleName}::` : ``}${fun.name}`;
			methods[name] = fun;
			if (ov.is(fun.defines_type, 'yes') && ov.is(fun.access, 'pub')) {
				knownTypes[name] = ov.as(fun.defines_type, 'yes');
				knownTypesInModule[thisModuleName].push(name);
			}
		};

		const addReference = (methodName, startPos) => {
			methodDependencies[methodName] = startPos;
			referenceCache[methodName] ??= {};
			referenceCache[methodName][filePath] ??= [];
			referenceCache[methodName][filePath].push(startPos);
			referenceBackCache[filePath][methodName] ??= [];
			referenceBackCache[filePath][methodName].push(startPos);
		};

		libModules[thisModuleName] = nparser.sparse(text, thisModuleName, addReference, addMethod);

		updateUsingsBackCache(thisModuleName);

		const errors = module_checker.check_module(libModules[thisModuleName], true, {});

		try {
			defFunCache[thisModuleName] = type_checker.prepare_module_def_fun(thisModuleName, libModules[thisModuleName]);
		} catch (e) {
			console.log(e);
			defFunCache[thisModuleName] = {};
		}
		const interfaceKey = getInterfaceKey(libModules[thisModuleName], defFunCache[thisModuleName]);
		const interfaceChanged = !source || source.interfaceKey !== interfaceKey;
		moduleSources[thisModuleName] = { text, uri, version: document.version, interfaceKey };

		const staticDiagnostics = [libModules[thisModuleName].errors, libModules[thisModuleName].warnings, errors.errors, errors.warnings].flat();
		const old = moduleCache[thisModuleName];
		// results of the last type check (kept until the next one) - see positionTracker
		const typeResults = old?.typeResults ?? { base: null, varPositions: {}, dynamicDiagnostics: [] };
		// stamp: version of the type checking input of the module (its AST and interfaces of its dependencies)
		const stamp = (old?.stamp ?? 0) + 1;
		const checkedStamp = old?.checkedStamp ?? 0;

		moduleCache[thisModuleName] = {
			get typesChecked() { return this.checkedStamp === this.stamp; },
			// type checking results mapped to the current text of the document
			get varPositions() { return positionTracker.getView(this.typeResults).varPositions; },
			get dynamicDiagnostics() { return positionTracker.getView(this.typeResults).dynamicDiagnostics; },
			get inferredTypes() { return positionTracker.getView(this.typeResults).inferredTypes ?? []; },
			stamp, checkedStamp, filePath, methods, staticDiagnostics, typeResults, parsedModule: libModules[thisModuleName]
		};

		// the types of dependent modules depend only on the interface of this module
		const invalidated = [thisModuleName];
		if (!init && interfaceChanged) invalidated.push(...invalidateModules(getDependentModules(thisModuleName)));
		result = { moduleName: thisModuleName, changed: true, interfaceChanged, invalidated };
	} catch (e) {
		console.log(e);
	}

	if (!init && showDebugInfo) console.timeEnd(`updateModule ${thisModuleName}`);
	return result;
}

// Everything the type checking of other modules can depend on: signatures of the public functions and public types
// (for a function which is not a type - the error reported when it is used as a type).
function getInterfaceKey(parsedModule, defFun) {
	const signatures = parsedModule.fun_def
		.filter(fun => ov.is(fun.access, 'pub'))
		.map(fun => {
			const def = defFun?.[fun.name];
			return [
				fun.name,
				def ? def.args.map(arg => [arg.name, ov.get_element(arg.mod), arg.type]) : null,
				def ? def.ret_type : null,
				ov.is(fun.defines_type, 'yes') ? fun.defines_type : tryGetTypeError(fun.cmd),
			];
		})
		.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
	return JSON.stringify(signatures);
}

function tryGetTypeError(cmd) {
	try {
		return ptd_parser.fun_def_to_ptd(cmd);
	} catch (e) {
		return e.message;
	}
}

// modules which (transitively) use the module
function getDependentModules(moduleName) {
	const visited = new Set([moduleName]);
	const queue = [moduleName];
	while (queue.length > 0) {
		const mod = queue.shift();
		for (const user of Object.keys(usingsBackCashe[mod] ?? {})) {
			if (visited.has(user)) continue;
			visited.add(user);
			queue.push(user);
		}
	}
	visited.delete(moduleName);
	return [...visited];
}

// marks the types of the modules as outdated; returns the modules which exist
function invalidateModules(moduleNames) {
	return moduleNames.filter(mod => {
		if (!(mod in moduleCache)) return false;
		moduleCache[mod].stamp++;
		return true;
	});
}

function clearReferenceCache(filePath) {
	if (filePath in referenceBackCache) {
		for (const method of Object.keys(referenceBackCache[filePath])) {
			if (method in referenceCache && filePath in referenceCache[method]) {
				delete referenceCache[method][filePath];
			}
		}
	}
	referenceBackCache[filePath] = {};
}

function removeUsingsOf(thisModuleName) {
	for (const usingName of Object.keys(usingsBackCashe)) {
		if (usingsBackCashe[usingName][thisModuleName]) delete usingsBackCashe[usingName][thisModuleName];
	}
}

function updateUsingsBackCache(thisModuleName) {
	removeUsingsOf(thisModuleName);
	for (const [usingName, _] of Object.entries(libModules[thisModuleName].importsMap).filter((([_, val]) => val.usageCount > 0))) {
		usingsBackCashe[usingName] ??= {};
		usingsBackCashe[usingName][thisModuleName] = 1;
	}
}

// Returns null when nothing was removed, otherwise { moduleName, invalidated: [dependent modules] }.
function removeModule(filePath) {
	if (checkFileIgnore(filePath)) return null;
	const moduleName = getModuleName(filePath);
	if (moduleCache[moduleName]?.filePath !== filePath) return null;
	delete moduleCache[moduleName];
	delete libModules[moduleName];
	delete moduleSources[moduleName];
	delete defFunCache[moduleName];
	(knownTypesInModule[moduleName] ?? []).forEach(name => delete knownTypes[name]);
	delete knownTypesInModule[moduleName];
	removeUsingsOf(moduleName);

	clearReferenceCache(filePath);
	delete referenceBackCache[filePath];
	return { moduleName, invalidated: invalidateModules(getDependentModules(moduleName)) };
}

// version of a module read directly from disk (not opened as a vscode document)
const DISK_VERSION = -1;

// Minimal TextDocument-like object for a file read from disk - opening every module as a vscode document is slow.
// getText(range) clamps the range like vscode does.
function createDiskDocument(uri, text) {
	let lineStarts = null;
	const offsetAt = (position) => {
		if (!lineStarts) {
			lineStarts = [0];
			for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
		}
		const line = Math.max(0, Math.min(position.line, lineStarts.length - 1));
		let lineEnd = line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : text.length;
		if (lineEnd > lineStarts[line] && text[lineEnd - 1] === '\r') lineEnd--;
		return Math.min(lineStarts[line] + Math.max(0, position.character), lineEnd);
	};
	return {
		uri,
		fileName: uri.fsPath,
		languageId: 'nianiolang',
		version: DISK_VERSION,
		getText: (range) => range ? text.slice(offsetAt(range.start), offsetAt(range.end)) : text,
	};
}

const stripBom = (text) => text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

// The document of a module file: the one open in the editor, otherwise the file read from disk
// (opening a vscode document is much slower). null when the file can't be read.
async function readDocument(uri) {
	const open = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
	if (open) return open;
	try {
		return createDiskDocument(uri, stripBom(await fs.promises.readFile(uri.fsPath, 'utf8')));
	} catch (e) {
		return null;
	}
}

// Loads (parses) all the modules. Files are read from disk in chunks (the next chunk is read while the current one
// is parsed) and the event loop gets control every few milliseconds, so the editor stays responsive.
async function loadModulesFromDisk(uris, onProgress = (done, moduleName) => { }) {
	const CHUNK = 32;
	const SLICE_MS = 30;
	const read = (start) => Promise.all(uris.slice(start, start + CHUNK).map(uri => fs.promises.readFile(uri.fsPath, 'utf8')
		.then(stripBom, () => null)));
	let done = 0;
	let sliceStart = performance.now();
	let next = read(0);
	for (let start = 0; start < uris.length; start += CHUNK) {
		const texts = await next;
		if (start + CHUNK < uris.length) next = read(start + CHUNK);
		for (let i = 0; i < texts.length; i++) {
			const uri = uris[start + i];
			try {
				// a file which can't be read directly is opened as a vscode document
				const document = texts[i] !== null ? createDiskDocument(uri, texts[i]) : await vscode.workspace.openTextDocument(uri);
				updateModule(document, true);
			} catch (e) {
				console.error(uri.fsPath, e);
			}
			done++;
			if (performance.now() - sliceStart >= SLICE_MS) {
				onProgress(done, getModuleName(uri.fsPath));
				await new Promise(resolve => setImmediate(resolve));
				sliceStart = performance.now();
			}
		}
	}
	onProgress(done, '');
}

async function findFiles(filePath = '**/*.nl') {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return [];
	const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
	updateIgnore();
	return (await vscode.workspace.findFiles(filePath, '**/node_modules/**')).filter(uri => !ig.ignores(path.relative(workspaceFolderPath, uri.fsPath)));
}

const getModule = (moduleName) => !moduleName ? null : moduleCache[moduleName] ?? null;

const getReferences = (functionName, filePath) => functionName.includes("::") 
	? referenceCache[functionName] ?? {} : { [filePath]: (referenceCache[functionName] ?? {})[filePath] ?? [] };

const getReferencesBack = (filePath) => referenceBackCache[filePath] ?? {}

const getRemoveMod = () => vscode.workspace.getConfiguration('nianiolang').get('onPrettyPrintModule.removeMod');
const getPrintNewStamp = () => vscode.workspace.getConfiguration('nianiolang').get('onPrettyPrintModule.printNewStamp');
const getPrettyPrinter = () => vscode.workspace.getConfiguration('nianiolang').get('prettyPrint.modernPrint') ? modern_pretty_printer : pretty_printer;

function prettyPrintModule(moduleName) {
	const module = getModule(moduleName);
	if (!module || module.parsedModule.errors.length > 0) return null;
	return getPrettyPrinter().print_module_to_str(module.parsedModule, getRemoveMod(), getPrintNewStamp());
}

function prettyPrintMethod(moduleName, pos) {
	const module = getModule(moduleName);
	if (!module || module.parsedModule.errors.length > 0) return null;
	const fun = getFunctionFromPos(module.parsedModule, pos);
	if (!fun) return null;
	fun.comment = [];
	const out = getPrettyPrinter().print_function(fun, moduleName, getRemoveMod());
	return { out, range: fun.rawRange };
}

function getFunctionFromPos(parsedModule, pos) {
	for (const fun of parsedModule.fun_def) {
		if (pos.line >= fun.line && pos.line < fun.endLine) return fun;
	}
	return null;
}

function refactorToJS(moduleName) {
	const module = getModule(moduleName);
	if (!module || module.parsedModule.errors.length > 0) return null;
	return js_printer.print_module_to_str(module.parsedModule, module.varPositions);
}

// Runs the checker steps cooperatively: between the checked functions calls job.shouldPause() / job.pause()
// (lets other work run) and stops as soon as job.token.isCancelled is set. Returns the result or null when cancelled.
async function runCheckSteps(steps, job) {
	let step = null;
	try {
		while (!(step = steps.next()).done) {
			if (job.token.isCancelled) return null;
			if (job.shouldPause()) await job.pause();
			if (job.token.isCancelled) return null;
		}
		return step.value;
	} finally {
		if (!step?.done) steps.return();
	}
}

const isInferredTypesEnabled = () => !!vscode.workspace.getConfiguration('nianiolang').get('inlayHints.inferredTypes');

// Checks the types of one module (cancellable - see runCheckSteps). Returns true when the results were stored.
async function checkModuleTypes(moduleName, job) {
	const mod = moduleCache[moduleName];
	if (!mod) return false;
	const stamp = mod.stamp;
	job.stamp = stamp;
	// the version of the document the results will be computed for
	const source = moduleSources[moduleName];
	const base = source ? { uri: source.uri, version: source.version } : null;
	const inferTypes = isInferredTypesEnabled();
	if (showDebugInfo) console.time(`checkTypes ${moduleName}`);
	const result = await runCheckSteps(type_checker.check_modules_steps({ [moduleName]: mod.parsedModule },
		type_checker.def_fun_from_cache(defFunCache), knownTypes, type_checker.new_errors(inferTypes)), job);
	if (showDebugInfo) console.timeEnd(`checkTypes ${moduleName}`);
	if (!result) return false;
	// types of declarations without a type (shown as inlay hints) - needs another check of the module
	let inferredTypes = [];
	if (inferTypes) {
		inferredTypes = await inferred_types.find_inferred_types({
			module_name: moduleName,
			module: mod.parsedModule,
			result,
			def_fun_cache: defFunCache,
			dependencies: (funKey) => mod.methods[funKey]?.dependencies,
			check: (modules, defFun) => runCheckSteps(type_checker.check_modules_steps(modules, defFun, knownTypes), job),
		});
		if (!inferredTypes) return false;
	}
	const current = moduleCache[moduleName];
	if (!current) return false;
	current.typeResults = {
		base,
		varPositions: result.varPositions[moduleName] ?? {},
		dynamicDiagnostics: [...(result.errors[moduleName] ?? []), ...(result.warnings[moduleName] ?? [])],
		inferredTypes,
	};
	if (base) positionTracker.setBase(base);
	// the input could have changed during the check - then the results are stored, but the module stays outdated
	if (current.stamp === stamp) current.checkedStamp = stamp;
	return true;
}

// marks the types of the modules as outdated (e.g. when the settings of the type checking changed)
function invalidateTypes(moduleNames) {
	return invalidateModules(moduleNames);
}

const isTypesCheckOutdated = (moduleName) => moduleName in moduleCache && !moduleCache[moduleName].typesChecked;

module.exports = {
	updateModule,
	isParsed,
	removeModule,
	getModule,
	getModuleName,
	moduleCache,
	findFiles,
	loadModulesFromDisk,
	readDocument,
	getReferences,
	updateIgnore,
	getReferencesBack,
	showDebugInfo,
	showDebugHoverInfo,
	prettyPrintModule,
	prettyPrintMethod,
	refactorToJS,
	libModules,
	knownTypes,
	getDependentModules,
	checkModuleTypes,
	invalidateTypes,
	isInferredTypesEnabled,
	isTypesCheckOutdated,
};
