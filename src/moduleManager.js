const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

const ov = require('./nianioLibs/base/ov');
const nparser = require('./nianioLibs/parsers/nparser');
const module_checker = require('./nianioLibs/parsers/module_checker');
const pretty_printer = require('./nianioLibs/printers/pretty_printer');
const js_printer = require('./nianioLibs/printers/js_printer');
const type_checker = require('./nianioLibs/type_checker/type_checker');

const knownTypes = {};
const knownTypesInModule = {};

const libModules = {};
const moduleCache = {};
const referenceCache = {};
const referenceBackCache = {};
const usingsBackCashe = {};
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

function checkFileIgnore(filePath) {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return true;
	const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
	updateIgnore();
	return ig.ignores(path.relative(workspaceFolderPath, filePath));
}

const showDebugInfo = false;
const showDebugHoverInfo = false;

const isNotNl = (document, ext = '.nl') => !document || document.uri.scheme !== 'file' || document.languageId !== 'nianiolang' || path.extname(document.fileName) !== ext;

function updateModule(document) {
	if (isNotNl(document)) return;
	const filePath = document.uri.fsPath;
	if (checkFileIgnore(filePath)) return;
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const text = document.getText();
	const methods = {};

	clearReferenceCache(filePath);

	(knownTypesInModule[thisModuleName] ?? []).forEach(name => delete knownTypes[name]);
	knownTypesInModule[thisModuleName] = [];

	const addMethod = (fun) => {
		fun.endLine = fun.cmd.debug.end.line;
		fun.rawRange = new vscode.Range(fun.line - 1, 0, fun.endLine - 1, 1);
		fun.rawMethod = [...fun.comment, document.getText(fun.rawRange)].join('\n');
		const name = `${ov.is(fun.access, 'pub') ? `${thisModuleName}::` : ``}${fun.name}`;
		methods[name] = fun;
		if (ov.is(fun.defines_type, 'yes') && ov.is(fun.access, 'pub')) {
			knownTypes[name] = ov.as(fun.defines_type, 'yes');
			knownTypesInModule[thisModuleName].push(name);
		}
	};

	const addReference = (methodName, startPos) => {
		referenceCache[methodName] ??= {};
		referenceCache[methodName][filePath] ??= [];
		referenceCache[methodName][filePath].push(startPos);
		referenceBackCache[filePath][methodName] ??= [];
		referenceBackCache[filePath][methodName].push(startPos);
	};

	libModules[thisModuleName] = nparser.sparse(text, thisModuleName, addReference, addMethod);

	updateUsingsBackCache(thisModuleName);

	const errors = module_checker.check_module(libModules[thisModuleName], true, {});

	const staticDiagnostics = [libModules[thisModuleName].errors, libModules[thisModuleName].warnings, errors.errors, errors.warnings].flat();
	const dynamicDiagnostics = moduleCache[thisModuleName]?.dynamicDiagnostics ?? [];
	const varPositions = moduleCache[thisModuleName]?.varPositions ?? {};

	moduleCache[thisModuleName] = { typesChecked: false, filePath, methods, dynamicDiagnostics, varPositions, staticDiagnostics, parsedModule: libModules[thisModuleName] };

	updateTypesCheckedByUsingsBackCache(thisModuleName);
}

function updateTypesCheckedByUsingsBackCache(moduleName, visited = {}) {
	visited[moduleName] = 1;
	if (!(moduleName in usingsBackCashe)) return;
	for (const mod of Object.keys(usingsBackCashe[moduleName])) {
		if (mod in moduleCache) moduleCache[mod].typesChecked = false;
		if (!Object.hasOwn(visited, mod)) updateTypesCheckedByUsingsBackCache(mod, visited);
	}
}

function clearReferenceCache(filePath) {
	if (Object.keys(referenceBackCache).includes(filePath)) {
		for (const method of Object.keys(referenceBackCache[filePath])) {
			if (Object.keys(referenceCache).includes(method) && Object.keys(referenceCache[method]).includes(filePath)) {
				delete referenceCache[method][filePath];
			}
		}
	}
	referenceBackCache[filePath] = {};
}

function updateUsingsBackCache(thisModuleName) {
	for (const usingName of Object.keys(usingsBackCashe)) {
		if (usingsBackCashe[usingName][thisModuleName]) delete usingsBackCashe[usingName][thisModuleName];
	}
	for (const [usingName, _] of Object.entries(libModules[thisModuleName].importsMap).filter((([_, val]) => val.usageCount > 0))) {
		usingsBackCashe[usingName] ??= {};
		usingsBackCashe[usingName][thisModuleName] = 1;
	}
}

function removeModule(filePath) {
	if (checkFileIgnore(filePath)) return;
	const segments = filePath.split('/');
	const fileName = segments[segments.length - 1];
	const moduleName = fileName.split('.')[0];
	delete moduleCache[moduleName];

	if (Object.keys(referenceBackCache).includes(filePath)) {
		for (const method of Object.keys(referenceBackCache[filePath])) {
			if (Object.keys(referenceCache).includes(method) && Object.keys(referenceCache[method]).includes(filePath)) {
				delete referenceCache[method][filePath];
			}
		}
	}
	delete referenceBackCache[filePath];
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

function prettyPrintModule(moduleName) {
	const module = getModule(moduleName);
	if (!module || module.parsedModule.errors.length > 0) return null;
	return pretty_printer.print_module_to_str(module.parsedModule, getRemoveMod(), getPrintNewStamp());
}

function prettyPrintMethod(moduleName, pos) {
	const module = getModule(moduleName);
	if (!module || module.parsedModule.errors.length > 0) return null;
	const fun = getFunctionFromPos(module.parsedModule, pos);
	if (!fun) return null;
	fun.comment = [];
	const out = pretty_printer.print_function(fun, moduleName, getRemoveMod());
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

function checkTypes(modules) {
	const mods = {};
	modules.forEach(mod => {
		if (mod in moduleCache && !moduleCache[mod].typesChecked) {
			mods[mod] = moduleCache[mod].parsedModule;
			moduleCache[mod].typesChecked = true;
		}
	})
	
	const type_errors = type_checker.check_modules(mods, libModules, knownTypes);

	Object.keys(type_errors.errors).forEach(mod => {
		if (!(mod in moduleCache)) return;
		moduleCache[mod].varPositions = type_errors.varPositions[mod] ?? {};
		moduleCache[mod].dynamicDiagnostics = [...type_errors.errors[mod], ...type_errors.warnings[mod]];
	});
}

module.exports = {
	updateModule,
	removeModule,
	getModule,
	moduleCache,
	findFiles,
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
	checkTypes
};
