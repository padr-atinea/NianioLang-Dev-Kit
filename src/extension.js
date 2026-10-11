const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const moduleManager = require('./moduleManager');
const diagnosticsManager = require('./diagnosticsManager');
const ov = require('./nianioLibs/base/ov');
const ptdPrinter = require('./ptd-printer');
const own_to_im_converter = require('./nianioLibs/type_checker/own_to_im_converter');
const patchManager = require('./patchManager');
const dfile = require('./nianioLibs/printers/dfile');
const { AnalysisScheduler } = require('./analysisScheduler');
const { AnalysisMonitor } = require('./analysisMonitor');
const positionTracker = require('./positionTracker');

const funcRegex = /(?<!((?<!:):|->)[a-zA-Z0-9_]*)[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/;
const funcAndFieldRegex = /(?<!((?<!:):)[a-zA-Z0-9_]*)[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/;

/** @type {AnalysisScheduler} */
let scheduler = null;
// makes sure the module of the document is parsed from its current text (parsing is debounced while typing)
const ensureParsed = (document) => scheduler?.ensureParsed(document);
/** @type {AnalysisMonitor} */
let analysisMonitor = null;

const isDebugMode = () => !!vscode.workspace.getConfiguration('nianiolang').get('debugMode');

// the analysis monitor records only in debug mode
function syncAnalysisMonitor() {
	if (isDebugMode() && !analysisMonitor) {
		analysisMonitor = new AnalysisMonitor(scheduler);
		scheduler.monitor = analysisMonitor;
	} else if (!isDebugMode() && analysisMonitor) {
		scheduler.monitor = null;
		analysisMonitor.dispose();
		analysisMonitor = null;
	}
	scheduler.updateStatusBar();
}

async function showAnalysisMonitor() {
	if (!analysisMonitor) {
		const enable = 'Enable debug mode';
		if (await vscode.window.showInformationMessage('NianioLang Dev Kit: the analysis monitor is available in debug mode (nianiolang.debugMode).', enable) !== enable) return;
		await vscode.workspace.getConfiguration('nianiolang').update('debugMode', true, vscode.ConfigurationTarget.Global);
		syncAnalysisMonitor();
	}
	analysisMonitor?.show();
}

let hoverDepth = 0;
let hoverShowOriginalTypeName = false;

const isNotNl = (document, languageId = 'nianiolang', ext = '.nl') => !document || document.uri.scheme !== 'file' || document.languageId !== languageId || path.extname(document.fileName) !== ext;

const getCurrentDateTime = () => {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}]`;
};

function getMethod(fullName, filePath) {
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const isPublic = fullName.includes("::");
	const [moduleName, methodName] = isPublic ? fullName.split("::") : [thisModuleName, fullName];
	const module = moduleManager.getModule(moduleName);
	if (!module) return;
	const method = module.methods[fullName];
	if (!method) return;
	return { module, method, moduleName, methodName, isPublic };
}

function getMethodAtPosition(document, position) {
	const range = document.getWordRangeAtPosition(position, funcRegex);
	if (!range) return;
	const fullName = document.getText(range);
	const isDef = document.getText(new vscode.Range(new vscode.Position(range.start.line, 0), range.start)).trim() === 'def';
	const obj = getMethod(fullName, document.fileName);
	if (!obj) return;
	return { fullName, range, isDef, ...obj };
}

function tryGetPosToken(document, pos) {
	const filePath = document.fileName;
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const thisModule = moduleManager.getModule(thisModuleName);
	const token = thisModule?.varPositions[pos];
	if (!token) return null;
	if (ov.is(token, 'ref')) {
		const defPos = positionToIndex(token.ref.line, token.ref.position);
		const def = thisModule.varPositions[defPos];
		if (!def || !ov.is(def, 'def')) return null;
		return ov.mk('ref', ov.as(def, 'def'));
	}
	return token;
}

const positionToIndex = (line, col) => `${line}|${col}`;
const indexToPosition = (index) => index.split('|').map(part => parseInt(part));

function tryGetPosTokenAtPosition(document, position) {
	const range = document.getWordRangeAtPosition(position, funcAndFieldRegex);
	if (!range) return { token: null, range: null };
	const token = tryGetPosToken(document, positionToIndex(range.start.line + 1, range.start.character + 1));
	return { token, range };
}

async function provideDefinition(document, position) {
	ensureParsed(document);
	const { token, range } = tryGetPosTokenAtPosition(document, position);
	if (token) {
		if (ov.is(token, 'ref')) {
			const defPlace = ov.as(token, 'ref').defPlace;
			return new vscode.Location(document.uri, new vscode.Position(defPlace.line - 1, defPlace.position - 1));
		} else if (ov.is(token, 'def')) {
			const def = ov.as(token, 'def');
			return Object.keys(def.refs ?? {}).map(ref => {
				const refPos = indexToPosition(ref);
				return new vscode.Location(document.uri, new vscode.Range(refPos[0] - 1, refPos[1] - 1, refPos[0] - 1, refPos[1] - 1 + def.name.length));
			});
		} else if (ov.is(token, 'use')) {
			const module = moduleManager.getModule(token.use);
			if (!module) return;
			const doc = await vscode.workspace.openTextDocument(module.filePath);
			return new vscode.Location(doc.uri, new vscode.Position(0, 0));
		} else {
			return;
		}
	}
	
	const obj = getMethodAtPosition(document, position);
	if (!obj) return;
	const { method, module, isDef } = obj;
	if (isDef) return await getLocationFromReferences(document, range);
	const targetDoc = await vscode.workspace.openTextDocument(module.filePath);
	return new vscode.Location(targetDoc.uri, new vscode.Position(method.line - 1, 0));
}

const printParamNoType = (param) => `${ov.is(param.mod, 'ref') ? 'ref ' : ''}${param.name}`;
const printParamsNoType = (params) => `${params.map(printParamNoType).join(', ')}`;
const printMethodNoType = (methodName, method) => `${methodName}(${printParamsNoType(method.args)})`;

async function provideCompletionItems(document, position) {
	ensureParsed(document);
	const line = document.lineAt(position);
	const text = line.text.substring(0, position.character);
	const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
	const thisModule = moduleManager.getModule(thisModuleName);
	
	const useMatch = text.match(/^use ([a-zA-Z0-9_]+)/);
	if (useMatch) {
		return Object.keys(moduleManager.moduleCache).map((mod) => {
			const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
			item.insertText = new vscode.SnippetString(`${mod};`);
			return item;
		});
	}

	const fieldMatch = text.match(/(?<!((?<!:):)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+((\[[a-zA-Z0-9_]+\])|(\{[a-zA-Z0-9_]+\}))*)->([a-zA-Z0-9_]*)$/);
	if (fieldMatch) {
		const { token, range } = tryGetPosTokenAtPosition(document, new vscode.Position(position.line, fieldMatch.index));
		if (!token || !(ov.is(token, 'field') || ov.is(token, 'ref'))) return;
		let type = ov.get_value(token).type;
		while (ov.is(type, 'tct_arr') || ov.is(type, 'tct_hash') || ov.is(type, 'tct_ref')) {
			if (ov.is(type, 'tct_arr')) type = ov.get_value(type);
			if (ov.is(type, 'tct_hash')) type = ov.get_value(type);
			if (ov.is(type, 'tct_ref')) type = moduleManager.knownTypes[ov.get_value(type)];
		}
		if (!ov.is(type, 'tct_rec')) return;
		return Object.entries(ov.as(type, 'tct_rec')).map(([fieldName, fieldType]) => {
			const item = new vscode.CompletionItem(fieldName, vscode.CompletionItemKind.Field);
			item.detail = own_to_im_converter.get_type_constructor(fieldType, true, 0, moduleManager.knownTypes, false, hoverShowOriginalTypeName);
			item.insertText = new vscode.SnippetString(fieldName);
			const md = new vscode.MarkdownString();
			md.appendCodeblock(own_to_im_converter.get_type_constructor(fieldType, true, hoverDepth, moduleManager.knownTypes, true, hoverShowOriginalTypeName), 'nianiolang');
			item.documentation = md;
			return item;
		});
	}


	const publicMatch = text.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+)::([a-zA-Z0-9_]*)$/);

	if (!publicMatch) {
		const privateMatch = text.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+)$/);
		if (!privateMatch) return [];

		const methods = Object.entries(thisModule.methods).filter(([methodName, _]) => !methodName.includes('::')).map(([methodName, method]) => {
			const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Function);
			const shortDef = printMethodNoType(methodName, method);
			item.detail = shortDef;
			item.insertText = new vscode.SnippetString(method.args.length > 0 ? `${methodName}($0)` : `${methodName}()`);
			const md = new vscode.MarkdownString();
			md.appendCodeblock(method.rawMethod, 'nianiolang');
			item.documentation = md;
			return item;
		});
		// const thisPos = document.offsetAt(position);
		const fields = Object.values(thisModule.varPositions)
			.filter((token) => ov.is(token, 'def')
				&& ((token.def.defPlace.line - 1 === position.line && token.def.defPlace.line - 1 < position.character) || token.def.defPlace.line - 1 < position.line )
				&& ((position.line == token.def.endPlace.line - 1 && position.character < token.def.endPlace.position - 1) || position.line < token.def.endPlace.line - 1)
			)
			.map((token) => {
				const item = new vscode.CompletionItem(token.def.name, vscode.CompletionItemKind.Field);
				item.detail = `type: ${own_to_im_converter.get_type_constructor(token.def.type, true, 0, moduleManager.knownTypes, true, hoverShowOriginalTypeName)}`;
				item.insertText = new vscode.SnippetString(token.def.name);
				// if (pos.nlType === null) return item;
				// const body = parseNlType(pos.nlType);
				// if (body) return item;
				// const md = new vscode.MarkdownString();
				// md.appendCodeblock(body, 'nianiolang');
				// item.documentation = md;
				return item;
			});

		const modules = Object.keys(thisModule.parsedModule.importsMap)
			.map((imp) => {
				const mod = `${imp}::`;
				const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
				item.insertText = new vscode.SnippetString(mod);
				item.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions' };
				return item;
			});

		return [...methods, ...fields, ...modules];
	}

	const moduleName = publicMatch[2];
	const isType = /(?<!((?<!:):|->)[a-zA-Z0-9_]*)@([a-zA-Z0-9_]+)::([a-zA-Z0-9_]*)$/.test(text);
	const module = moduleManager.getModule(moduleName);
	if (!module) return;
	return Object.entries(module.methods).filter(([methodName, _]) => methodName.includes('::')).map(([methodName, method]) => {
		methodName = methodName.split('::')[1];
		const item = new vscode.CompletionItem(methodName, isType ? vscode.CompletionItemKind.TypeParameter : vscode.CompletionItemKind.Function);
		const shortDef = printMethodNoType(methodName, method);
		item.detail = shortDef;
		item.insertText = new vscode.SnippetString(method.args.length > 0 && !isType ? `${methodName}($0)` : `${methodName}${isType ? '' : '()'}`);
		item.command = { command: 'nianiolang.addImportAndTriggerSignatureHelp', title: 'Add Import and Show Signature Help', arguments: [moduleName, document.uri] };
		const md = new vscode.MarkdownString();
		md.appendCodeblock(method.rawMethod, 'nianiolang');
		item.documentation = md;
		return item;
	});
}

function provideSignatureHelp(document, position) {
	ensureParsed(document);
	const text = document.getText();
	const offset = document.offsetAt(position);
	let openParenIndex;
	let pos = offset - 1;
	let paramIndex = 0, depth = 0;

	while (depth <= 0 && pos >= 0) {
		const line = [];
		while (pos >= 0 && text[pos] != '\n') {
			if (["'", "#", '(', ')', ','].includes(text[pos])) {
				line.push(pos);
			}
			pos--;
		}
		pos--;
		let isString = false;
		const chars = [];
		while (line.length > 0) {
			const char = line.pop();
			if (text[char] === "'") isString = !isString;
			if (isString) continue;
			if (text[char] === "#") break;

			if (text[char] === '(') chars.push(char);
			else if (text[char] === ')') chars.push(char);
			else if (text[char] === ',') chars.push(char);
		}
		while (chars.length > 0) {
			const char = chars.pop();
			if (text[char] == '(') {
				depth++;
				if (depth == 1) {
					openParenIndex = char;
					break;
				}
			}
			if (text[char] == ')') {
				depth--;
			}
			if (text[char] == ',' && depth == 0) paramIndex++;
		}
	}

	const prefix = text.slice(0, openParenIndex);
	const fullName = prefix.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?)\s*$/);
	if (!fullName) return null;
	const method = getMethod(fullName[2], document.fileName)?.method;
	if (!method) return;

	const sigHelp = new vscode.SignatureHelp();
	const sigInfo = new vscode.SignatureInformation(printMethodNoType(fullName[2], method));
	sigInfo.parameters = method.args.map(p => new vscode.ParameterInformation(printParamNoType(p)));
	sigHelp.signatures = [sigInfo];
	sigHelp.activeSignature = 0;
	sigHelp.activeParameter = paramIndex < method.args.length ? paramIndex : method.args.length - 1;
	return sigHelp;
}

async function addImportAndTriggerSignatureHelp(moduleName, uri) {
	await addImports([moduleName], uri);
	await vscode.commands.executeCommand('editor.action.triggerParameterHints');
}

class NianioLangCodeActionProvider {
	provideCodeActions(doc, range, context, token) {
		const document = doc ?? vscode.window.activeTextEditor?.document;
		if (isNotNl(document)) return;

		const moduleAction = new vscode.CodeAction('Pretty Print Module', vscode.CodeActionKind.Refactor);
		moduleAction.command = { command: 'extension.prettyPrintModule', title: 'Pretty Print Module', arguments: [document] };

		const methodAction = new vscode.CodeAction('Pretty Print Method', vscode.CodeActionKind.Refactor);
		methodAction.command = { command: 'extension.prettyPrintMethod', title: 'Pretty Print Method', arguments: [document, range.start] };

		return [methodAction, moduleAction];
	}
}
class NianioLangGRCodeActionProvider {
	provideCodeActions(doc, range, context, token) {
		const document = doc ?? vscode.window.activeTextEditor?.document;
		if (isNotNl(document, 'nianiolangGr', '.gr')) return;

		const GRFileAction = new vscode.CodeAction('Pretty Print GR File', vscode.CodeActionKind.Refactor);
		GRFileAction.command = { command: 'extension.prettyPrintGr', title: 'Pretty Print GR File', arguments: [document, range.start] };

		return [GRFileAction];
	}
}

async function addImports(moduleNames, uri) {
	const document = await vscode.workspace.openTextDocument(uri);
	ensureParsed(document);
	const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
	const edit = new vscode.WorkspaceEdit();
	const thisModule = moduleManager.getModule(thisModuleName);
	if (!thisModule) return;
	const usings = moduleNames
		.filter(mod => mod !== thisModuleName && !(mod in thisModule.parsedModule.importsMap))
		.map(mod => `use ${mod};`)
		.join('\n');
	if (moduleNames.length == 0 || !usings) return;
	if (thisModule.parsedModule.imports.length == 0) {
		edit.insert(document.uri, new vscode.Position(0, 0), usings);
	} else {
		const pos = new vscode.Position(Math.max(thisModule.parsedModule.imports.at(-1).endLine - 1, 0), Math.max(thisModule.parsedModule.imports.at(-1).endColumn, 0));
		edit.insert(document.uri, pos, `\n${usings}`);
	}
	await vscode.workspace.applyEdit(edit);
}

function provideHover(document, position) {
	ensureParsed(document);
	const { token, range } = tryGetPosTokenAtPosition(document, position);
	if (token) {
		const md = new vscode.MarkdownString();
		if (ov.is(token, 'def') || ov.is(token, 'ref') || ov.is(token, 'field')) {
			if (ov.is(token, 'def') && vscode.workspace.getConfiguration('nianiolang').get('onFieldHover.showReferenceCount')) {
				const referencesLength = Object.keys(token.def.refs ?? {}).length;
				md.appendMarkdown(`${referencesLength} reference${referencesLength === 1 ? '' : 's'}\n\n`);
			}
			md.isTrusted = { enabledCommands: ['nianiolang.hover.dec', 'nianiolang.hover.inc', 'nianiolang.hover.showOriginalTypeName'] };
			const encodedArgs = encodeURIComponent(JSON.stringify({
				uri: document.uri.toString(),
				position: { line: position.line, character: position.character }
			}));
			const type = own_to_im_converter.get_type_constructor(ov.get_value(token).type, true, hoverDepth, moduleManager.knownTypes, true, hoverShowOriginalTypeName);
			const minus = hoverDepth > 0 ? `[ (-) ](command:nianiolang.hover.dec?${encodedArgs})` : ' (-) ';
			const plus = /(?<!\()@[a-zA-Z0-9_]+::[a-zA-Z0-9_]+(?![a-zA-Z0-9_]*\) )/.test(type) ? `[ (+) ](command:nianiolang.hover.inc?${encodedArgs})` : ' (+) ';
			const showName = `[${hoverShowOriginalTypeName ? 'Hide' : 'Show'} original type names](command:nianiolang.hover.showOriginalTypeName?${encodedArgs})`;
			md.appendMarkdown(`${minus} ${plus} Depth: ${hoverDepth} \t|\t ${showName}\n`);
			md.appendCodeblock(`type: ${type}`, 'nianiolang');
		}
		// if (vscode.workspace.getConfiguration('nianiolang').get('debugMode')) md.appendCodeblock(ptdPrinter.prettyPrinter(token), 'json');
		return new vscode.Hover(md, range);
	}
	
	const obj = getMethodAtPosition(document, position); if (!obj) return;
	const { module, method, fullName, isDef } = obj;

	const md = new vscode.MarkdownString();
	const conf = vscode.workspace.getConfiguration('nianiolang.onMethodHover');
	if (!isDef) {
		if (conf.get('showReferenceCount')) {
			const references = moduleManager.getReferences(fullName, module.filePath);
			const referencesLength = Object.values(references).flat().length;
			md.appendMarkdown(`${referencesLength} reference${referencesLength === 1 ? '' : 's'}`);
		}
		md.appendCodeblock(method.rawMethod, 'nianiolang');
	}
	if (conf.get('showDependencies')) {
		const result = { ...method.dependencies };
		const allDeps = {};
		const roots = {};

		function search(node, module, localDeps) {
			for (const d of Object.keys(node)) {
				if (d.includes("::")) {
					if (Object.hasOwn(allDeps, d)) {
						node[d] = 'cycle';
						continue;
					}
					allDeps[d] = 1;
					const newModule = moduleManager.getModule(d.split("::")[0]);
					if (!newModule) {
						roots[d.split("::")[0]] = 1;
						node[d] = 'root';
						continue;
					}
					const method = newModule.methods[d];
					if (!method) {
						node[d] = 'method not found';
						continue;
					}
					node[d] = { ...method.dependencies };
					search(node[d], newModule, {});
				} else {
					if (Object.hasOwn(localDeps, d)) {
						node[d] = 'cycle';
						continue;
					}
					localDeps[d] = 1;
					const method = module.methods[d];
					if (!method) {
						node[d] = 'method not found';
						continue;
					}
					node[d] = { ...method.dependencies };
					search(node[d], module, localDeps);
				}
			}
		}

		search(result, module, {});
		
		const rootsString = Object.keys(roots).join(', ');
		md.appendText(rootsString.length === 0
			? `Method doesn't rely on any external dependencies`
			: `Method rely on external dependencies: ${rootsString}`);
	}
	return new vscode.Hover(md, range);
}

async function refreshHover(args) {
	const targetUri = vscode.Uri.parse(args.uri);
	const targetPos = new vscode.Position(args.position.line, args.position.character);
	const active = vscode.window.activeTextEditor;
	if (!active || active.document.uri.toString() !== targetUri.toString()) {
		const doc = await vscode.workspace.openTextDocument(targetUri);
		await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: true });
	}
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;
	editor.selection = new vscode.Selection(targetPos, targetPos);
	await vscode.commands.executeCommand('editor.action.hideHover');
	await vscode.commands.executeCommand('editor.action.showHover');
}

async function prepareRename(document, position) {
	ensureParsed(document);
	const { token, range } = tryGetPosTokenAtPosition(document, position);
	if (ov.is(token, 'ref') || ov.is(token, 'def')) {
		return {
			range: range,
			placeholder: ov.get_value(token).name,
		}
	}

	const obj = getMethodAtPosition(document, position);
	if (!obj) throw new Error();
	// const { fullName, method, methodName, module } = obj;
	// const doc = await vscode.workspace.openTextDocument(module.filePath);
	// return {
	// 	range: new vscode.Range(doc.positionAt(method.startPos), doc.positionAt(method.startPos + fullName.length)),
	// 	placeholder: methodName,
	// }
}

async function provideRenameEdits(document, position, newName) {
	if (!/[a-zA-Z0-9_]/.test(newName)) return;
	scheduler?.flushAllParses();
	let { token, range } = tryGetPosTokenAtPosition(document, position);
	const edit = new vscode.WorkspaceEdit();
	if (token && (ov.is(token, 'ref') || ov.is(token, 'def'))) {
		const def = ov.get_value(token);
		for (const defPos of Object.keys(def.refs ?? {})) {
			const pos = indexToPosition(defPos);
			edit.replace(document.uri, new vscode.Range(pos[0] - 1, pos[1] - 1, pos[0] - 1, pos[1] - 1 + def.name.length), newName);
		}
		edit.replace(document.uri, new vscode.Range(def.defPlace.line - 1, def.defPlace.position - 1, def.defPlace.line - 1, def.defPlace.position - 1 + def.name.length), newName);
	} else {
		const obj = getMethodAtPosition(document, position); if (!obj) return;
		const { fullName, method, module, moduleName } = obj;
		const references = moduleManager.getReferences(fullName, document.uri.fsPath);
		if (fullName.includes("::")) newName = `${moduleName}::${newName}`;

		for (const [file, positions] of Object.entries(references)) {
			const doc = await vscode.workspace.openTextDocument(file);
			for (const pos of positions) {
				edit.replace(doc.uri, new vscode.Range(pos.line - 1, pos.position - 1, pos.line - 1, pos.position - 1 + fullName.length), newName);
			}
		}
		const doc = await vscode.workspace.openTextDocument(module.filePath);
		edit.replace(doc.uri, new vscode.Range(doc.positionAt(method.startPos), doc.positionAt(method.startPos + fullName.length)), newName);
	}

	
	return edit;
}

async function provideReferences(document, position) {
	const range = document.getWordRangeAtPosition(position, funcRegex);
	if (!range) return;
	return await getLocationFromReferences(document, range);
}

async function getLocationFromReferences(document, range) {
	scheduler?.flushAllParses();
	const symbol = document.getText(range);
	const references = moduleManager.getReferences(symbol, document.uri.fsPath);
	const locations = [];
	for (const [file, positions] of Object.entries(references)) {
		const doc = await vscode.workspace.openTextDocument(file);
		for (const pos of positions) {
			locations.push(new vscode.Location(doc.uri, new vscode.Range(pos.line - 1, pos.position - 1, pos.line - 1, pos.position - 1 + symbol.length)));
		}
	}
	return locations;
}

class ReferenceCounterCodeLensProvider {
	constructor() {
		this._onDidChangeCodeLenses = new vscode.EventEmitter();
		this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
	}

	async provideCodeLenses(document) {
		if (isNotNl(document)) return [];
		ensureParsed(document);
		const filePath = document.uri.fsPath;
		const moduleName = path.basename(filePath, path.extname(filePath));
		const mod = moduleManager.getModule(moduleName);
		if (!mod) return [];
		const lenses = [];
		if (isDebugMode()) {
			const topPos = new vscode.Position(0, 0);
			lenses.push(new vscode.CodeLens(new vscode.Range(topPos, topPos), {
				title: 'This Module Object',
				command: 'extension.showModuleObject',
				arguments: [document],
			}));
			lenses.push(new vscode.CodeLens(new vscode.Range(topPos, topPos), {
				title: 'Analysis Monitor',
				command: 'nianiolang.showAnalysisMonitor',
			}));
		}
		lenses.push(...Object.entries(mod.methods).flatMap(([methodName, method]) => {
			const references = moduleManager.getReferences(methodName, filePath);
			const length = Object.values(references).flat().length;
			const pos = new vscode.Position(method.line - 1, 4);
			const range = new vscode.Range(pos, pos);
			return [new vscode.CodeLens(range, {
				title: `${length} reference${length === 1 ? '' : 's'}`,
				command: 'extension.showReferences',
				arguments: [document, pos],
				// arguments: [document, pos, references],
			})];
		}));
		return lenses;
	}
}

async function loadPublicFunctionsFromFile(fileUri) {
	if (!fileUri) return {};
	try {
		const document = await vscode.workspace.openTextDocument(fileUri);
		return dfile.sload(document.getText());
	} catch (e) {
		return {};
	}
}

class PublicFunctionsIndex {
	constructor() {
		this._set = {};
		this._fileUri = null;

		this._onDidChange = new vscode.EventEmitter();
		this.onDidChange = this._onDidChange.event;
	}

	get set() { return this._set; }

	async init() {
		const found = await vscode.workspace.findFiles('public_functions.df', '**/node_modules/**', 1);
		this._fileUri = found && found[0] ? found[0] : null;
		await this.reload();
		const watcher = vscode.workspace.createFileSystemWatcher('**/public_functions.df');
		watcher.onDidChange(() => this.reload());
		watcher.onDidCreate(() => this.reload());
		watcher.onDidDelete(() => this.reload());
		return watcher;
	}

	async reload() {
		const next = await loadPublicFunctionsFromFile(this._fileUri);
		this._set = next;
		this._onDidChange.fire();
	}

	dispose() {
		this._watcher?.dispose();
		this._onDidChange.dispose();
	}
}

// Inlay hints with the types of declarations without a type, which the type checker determines unambiguously
// (nianiolang.inlayHints.inferredTypes). Click on the hint adds the type to the declaration.
class InferredTypesInlayHintsProvider {
	constructor() {
		this._onDidChangeInlayHints = new vscode.EventEmitter();
		this.onDidChangeInlayHints = this._onDidChangeInlayHints.event;
	}

	refresh() {
		this._onDidChangeInlayHints.fire();
	}

	dispose() {
		this._onDidChangeInlayHints.dispose();
	}

	provideInlayHints(document, range, token) {
		if (isNotNl(document) || !moduleManager.isInferredTypesEnabled()) return [];
		const mod = moduleManager.getModule(path.basename(document.fileName, path.extname(document.fileName)));
		if (!mod) return [];
		const hints = [];
		for (const inferred of mod.inferredTypes) {
			if (token?.isCancellationRequested) break;
			if (inferred.line - 1 < range.start.line || inferred.line - 1 > range.end.line) continue;
			// the declaration must still be there and without a type
			const at = getInferredTypePosition(document, inferred);
			if (!at) continue;
			const { position, expected } = at;
			const label = new vscode.InlayHintLabelPart(`: ${inferred.text.length > 60 ? inferred.text.slice(0, 59) + '…' : inferred.text}`);
			label.tooltip = getInferredTypeTooltip(inferred);
			label.command = {
				title: 'Add the type to the declaration',
				command: 'nianiolang.addInferredType',
				arguments: [document.uri, position.line, position.character, expected, inferred.text, inferred.imports],
			};
			const hint = new vscode.InlayHint(position, [label], vscode.InlayHintKind.Type);
			hint.paddingLeft = true;
			if (inferred.imports.length === 0) hint.textEdits = [vscode.TextEdit.insert(position, ` : ${inferred.text}`)];
			hints.push(hint);
		}
		return hints;
	}
}

// Where the type is inserted: after the name of the variable / parameter, or after ')' of the function header for
// the return type (the header may span several lines). null when the declaration has changed or already has a type.
// expected: the text which must be right before the position.
function getInferredTypePosition(document, inferred) {
	const line = inferred.line - 1;
	if (line >= document.lineCount) return null;
	const lineText = document.lineAt(line).text;
	if (inferred.kind !== 'return') {
		const nameEnd = inferred.position - 1 + inferred.name.length;
		if (lineText.slice(inferred.position - 1, nameEnd) !== inferred.name || /^\s*:/.test(lineText.slice(nameEnd))) return null;
		return { position: new vscode.Position(line, nameEnd), expected: inferred.name };
	}
	// (the parser reports columns in the first line of the file one less)
	const brace = lineText[inferred.position - 1] === '{' ? inferred.position - 1 : line === 0 && lineText[inferred.position] === '{' ? inferred.position : -1;
	if (brace < 0) return null;
	// back from '{' of the body over whitespace to ')' of the header
	let l = line;
	let text = lineText.slice(0, brace);
	while (/^\s*$/.test(text) && l > 0) text = document.lineAt(--l).text;
	text = text.replace(/\s+$/, '');
	if (!text.endsWith(')')) return null;
	return { position: new vscode.Position(l, text.length), expected: ')' };
}

function getInferredTypeTooltip(inferred) {
	const md = new vscode.MarkdownString();
	// md.appendMarkdown(`**Inferred type** of ${inferred.kind === 'param' ? 'parameter' : 'variable'} \`${inferred.name}\` - click to add it to the declaration\n`);
	// md.appendCodeblock(`${inferred.kind === 'param' ? '' : 'var '}${inferred.name} : ${inferred.text}`, 'nianiolang');
	// const usesTypes = inferred.text.includes('@');
	// if (usesTypes) {
	// 	md.appendMarkdown('Type contents:\n');
	// 	md.appendCodeblock(own_to_im_converter.get_type_constructor(inferred.type, true, 1, moduleManager.knownTypes, true, true), 'nianiolang');
	// }
	md.appendCodeblock(own_to_im_converter.get_type_constructor(inferred.type, true, 1, moduleManager.knownTypes, true, true), 'nianiolang');
	// if (inferred.imports.length > 0) md.appendMarkdown(`Adds also: ${inferred.imports.map(mod => `\`use ${mod};\``).join(', ')}\n\n`);
	if (inferred.kind !== 'var' && inferred.public_fun) md.appendMarkdown(`⚠ Public function - the ${inferred.kind === 'return' ? 'return type' : 'type of the parameter'} changes its interface; calls from other modules are not verified.\n`);
	return md;
}

// adds the inferred type (and the imports it needs) to the declaration
// expected: the text right before the position (the name of the variable or ')' of the function header)
async function addInferredType(uri, line, character, expected, text, imports = []) {
	const document = await vscode.workspace.openTextDocument(uri);
	const lineText = line < document.lineCount ? document.lineAt(line).text : '';
	if (lineText.slice(character - expected.length, character) !== expected || /^\s*:/.test(lineText.slice(character))) {
		vscode.window.showWarningMessage('NianioLang Dev Kit: the declaration has changed - the type was not added.');
		return;
	}
	const edit = new vscode.WorkspaceEdit();
	edit.insert(document.uri, new vscode.Position(line, character), ` : ${text}`);
	await vscode.workspace.applyEdit(edit);
	if (imports.length > 0) await addImports(imports, document.uri);
}

class PublicFunctionsInlayHintsProvider {
	constructor(publicIndex) {
		this.publicIndex = publicIndex;

		this._onDidChangeInlayHints = new vscode.EventEmitter();
		this.onDidChangeInlayHints = this._onDidChangeInlayHints.event;

		this._sub = this.publicIndex.onDidChange(() => {
			this._onDidChangeInlayHints.fire();
		});
	}

	dispose() {
		this._sub?.dispose();
		this._onDidChangeInlayHints.dispose();
	}

	async provideInlayHints(document, range, token) {
		if (isNotNl(document)) return [];
		ensureParsed(document);

		const filePath = document.uri.fsPath;
		const moduleName = path.basename(filePath, path.extname(filePath));
		const mod = moduleManager.getModule(moduleName);
		if (!mod) return [];

		const out = [];
		const pub = this.publicIndex.set;

		for (const [methodName, method] of Object.entries(mod.methods)) {
			if (token?.isCancellationRequested) break;
			if (!pub[methodName]) continue;

			const lineIndex = Math.max(0, (method.line | 0) - 1);
			if (lineIndex < range.start.line || lineIndex > range.end.line) continue;
			const pos = new vscode.Position(lineIndex, 0);
			const hint = new vscode.InlayHint(pos, 'public', vscode.InlayHintKind.Type);
			hint.paddingLeft = false;
			hint.paddingRight = true;
			hint.tooltip = 'This function is marked as public in \'public_functions.df\'';

			out.push(hint);
		}

		return out;
	}
}

function addFileWathers(context, codeLensProvider) {
	const ignoreFileWatcher = vscode.workspace.createFileSystemWatcher('{.gitignore,.vscodeignore}');
	ignoreFileWatcher.onDidCreate(moduleManager.updateIgnore);
	ignoreFileWatcher.onDidChange(moduleManager.updateIgnore);
	ignoreFileWatcher.onDidDelete(moduleManager.updateIgnore);
	context.subscriptions.push(ignoreFileWatcher);

	const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.nl');
	fileWatcher.onDidCreate(uri => scheduler.onFileCreated(uri));
	fileWatcher.onDidChange(uri => scheduler.onFileChanged(uri));
	fileWatcher.onDidDelete(uri => scheduler.onFileDeleted(uri));
	context.subscriptions.push(fileWatcher);
}

// Replaces the text in the range and saves the document. Does nothing (returns false) when the text is the same.
// Only the part which really differs is replaced - the cursor and the undo history are not disturbed.
async function replaceRange(doc, range, newText) {
	if (!(range instanceof vscode.Range)) range = new vscode.Range(range[0].line, range[0].character, range[1].line, range[1].character);
	range = doc.validateRange(range);
	const oldText = doc.getText(range);
	if (oldText === newText) return false;
	const edit = new vscode.WorkspaceEdit();
	if (doc.eol === vscode.EndOfLine.LF) {
		let prefix = 0;
		const maxLen = Math.min(oldText.length, newText.length);
		while (prefix < maxLen && oldText[prefix] === newText[prefix]) prefix++;
		let suffix = 0;
		while (suffix < maxLen - prefix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++;
		const startOffset = doc.offsetAt(range.start);
		const changed = new vscode.Range(doc.positionAt(startOffset + prefix), doc.positionAt(startOffset + oldText.length - suffix));
		edit.replace(doc.uri, changed, newText.slice(prefix, newText.length - suffix));
	} else {
		if (oldText.replace(/\r\n/g, '\n') === newText) return false;
		edit.replace(doc.uri, range, newText);
	}
	await vscode.workspace.applyEdit(edit);
	doc.save();
	return true;
}

async function loadAllModules() {
	const start = Date.now();
	let total = 0;
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `NianioLang Dev Kit: loading modules`,
		cancellable: false
	}, async (progress) => {
		progress.report({ increment: 0 });
		const files = await moduleManager.findFiles();
		total = files.length;
		if (total === 0) return;
		let reported = 0;
		await moduleManager.loadModulesFromDisk(files, (done, moduleName) => {
			const percent = Math.round((10000 * done) / total) / 100;
			progress.report({ increment: 100 * (done - reported) / total, message: `${done} / ${total} (${percent}%)\n${moduleName}` });
			reported = done;
		});
	});
	console.log(getCurrentDateTime(), `loadAllModules completed: ${total} modules in ${Date.now() - start} ms`);
}

async function activate(context) {
	console.log(getCurrentDateTime(), 'NianioLang Dev Kit starting');

	const publicFunctionsIndex = new PublicFunctionsIndex();
	const publicFunctionsFileWatcher = await publicFunctionsIndex.init();
	const publicFunctionsInlayHintsProvider = new PublicFunctionsInlayHintsProvider(publicFunctionsIndex);
	const codeLensProvider = new ReferenceCounterCodeLensProvider();
	const statusMessage = vscode.window.setStatusBarMessage(`$(sync~spin) NianioLang Dev Kit: starting`);
	await loadAllModules();
	scheduler = new AnalysisScheduler();
	scheduler.onModuleParsed = () => codeLensProvider._onDidChangeCodeLenses.fire();
	const inferredTypesInlayHintsProvider = new InferredTypesInlayHintsProvider();
	scheduler.onTypesChecked = () => inferredTypesInlayHintsProvider.refresh();
	// modules were loaded from disk - documents open in the editor may differ (e.g. restored unsaved changes)
	vscode.workspace.textDocuments.forEach(document => scheduler.ensureParsed(document));
	syncAnalysisMonitor();
	addFileWathers(context, codeLensProvider);

	const selector = { scheme: 'file', language: 'nianiolang' };
	const selectorGr = { scheme: 'file', language: 'nianiolangGr' };
	context.subscriptions.push(
		scheduler,
		{ dispose: () => analysisMonitor?.dispose() },
		publicFunctionsFileWatcher,
		publicFunctionsIndex,
		publicFunctionsInlayHintsProvider,
		vscode.languages.registerInlayHintsProvider(selector, publicFunctionsInlayHintsProvider),
		inferredTypesInlayHintsProvider,
		vscode.languages.registerInlayHintsProvider(selector, inferredTypesInlayHintsProvider),
		vscode.languages.registerDefinitionProvider(selector, { provideDefinition }),
		vscode.languages.registerCompletionItemProvider(selector, { provideCompletionItems }, ':'),
		vscode.languages.registerSignatureHelpProvider(selector, { provideSignatureHelp }, '(', ','),
		vscode.languages.registerCodeActionsProvider(selector, new NianioLangCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
		vscode.languages.registerCodeActionsProvider(selectorGr, new NianioLangGRCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
		vscode.languages.registerHoverProvider(selector, { provideHover }),
		vscode.languages.registerRenameProvider(selector, { provideRenameEdits, prepareRename }),
		vscode.languages.registerReferenceProvider(selector, { provideReferences }),
		vscode.languages.registerCodeLensProvider(selector, codeLensProvider),

		vscode.commands.registerCommand('nianiolang.hover.dec', async args => { hoverDepth--; await refreshHover(args); }),
		vscode.commands.registerCommand('nianiolang.hover.inc', async args => { hoverDepth++; await refreshHover(args); }),
		vscode.commands.registerCommand('nianiolang.hover.showOriginalTypeName', async args => { hoverShowOriginalTypeName = !hoverShowOriginalTypeName; await refreshHover(args); }),
		// vscode.commands.registerCommand('nianiolang.moduleNameNotEqualFileName', moduleNameNotEqualFileName),
		// vscode.commands.registerCommand('activate.addImport', addImport),
		// vscode.commands.registerCommand('nianiolang.makeMethodPublic', makeMethodPublic),
		vscode.commands.registerCommand('nianiolang.addImportAndTriggerSignatureHelp', addImportAndTriggerSignatureHelp),
		// vscode.commands.registerCommand('extension.removeAllUsingsInFile', removeAllUsingsInFile),
		// vscode.commands.registerCommand('extension.fixAllIncorretNames', fixAllIncorretNames),
		vscode.commands.registerCommand('extension.updateAllDiagnostics', updateAllDiagnostics),
		vscode.commands.registerCommand('extension.prettyPrintModule', prettyPrintModule),
		vscode.commands.registerCommand('extension.prettyPrintAllModules', prettyPrintAllModules),
		vscode.commands.registerCommand('extension.prettyPrintMethod', prettyPrintMethod),
		vscode.commands.registerCommand('extension.prettyPrintGr', prettyPrintGr),
		vscode.commands.registerCommand('extension.refactorToJS', refactorToJS),
		vscode.commands.registerCommand('extension.showModuleObject', showModuleObject),
		vscode.commands.registerCommand('nianiolang.addInferredType', addInferredType),
		vscode.commands.registerCommand('nianiolang.showAnalysisMonitor', showAnalysisMonitor),
		vscode.commands.registerCommand('extension.showReferences', async (document, position) => {
			vscode.commands.executeCommand('editor.action.showReferences', document.uri, position, await provideReferences(document, position));
		}),

		// vscode.workspace.onDidRenameFiles(event => event.files.forEach(fixAllIncorretNamesWhenRename)),
		vscode.workspace.onDidChangeTextDocument(event => {
			if (isNotNl(event.document)) return;
			// keeps the positions of the type checking results in sync with the text
			positionTracker.recordChange(event);
			if (event.contentChanges.length > 0) scheduler.onDocumentChanged(event.document);
		}),
		vscode.workspace.onDidCloseTextDocument(document => positionTracker.forgetDocument(document.uri)),
		// .nl files are saved with LF line endings (applied to the saved document as part of the save)
		vscode.workspace.onWillSaveTextDocument(event => {
			if (!isNotNl(event.document) && event.document.eol !== vscode.EndOfLine.LF) event.waitUntil(Promise.resolve([vscode.TextEdit.setEndOfLine(vscode.EndOfLine.LF)]));
		}),
		vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
		vscode.window.onDidChangeVisibleTextEditors(editors => {
			editors.forEach(editor => diagnosticsManager.updateDiagnostics(editor.document));
			scheduler.checkVisibleModules();
		}),
		// priorities of the type checks depend on the active editor
		vscode.window.onDidChangeActiveTextEditor(() => {
			scheduler.startJobs();
			scheduler.resumeRunningJob();
		}),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('nianiolang.debugMode')) {
				syncAnalysisMonitor();
				codeLensProvider._onDidChangeCodeLenses.fire();
			}
			if (event.affectsConfiguration('nianiolang.checkTypes') || event.affectsConfiguration('nianiolang.checkTypesScope')) scheduler.checkOpenModules();
			if (event.affectsConfiguration('nianiolang.inlayHints.inferredTypes')) {
				// the inferred types are computed during the type checking
				if (moduleManager.isInferredTypesEnabled()) {
					moduleManager.invalidateTypes(Object.keys(moduleManager.moduleCache));
					scheduler.checkOpenModules('inferred types enabled');
				}
				inferredTypesInlayHintsProvider.refresh();
			}
		}),

		vscode.commands.registerCommand('nianiolang.generatePatchFromCommit', patchManager.generatePatchFromCommit),
		vscode.commands.registerCommand('nianiolang.applyPatch', patchManager.applyPatch),
	);
	scheduler.getEditorState().open.forEach(diagnosticsManager.publishModuleDiagnostics);
	scheduler.checkOpenModules();
	console.log(getCurrentDateTime(), 'NianioLang Dev Kit activated');
	statusMessage.dispose();
	vscode.window.showInformationMessage('NianioLang Dev Kit: Ready to use');
}

async function updateAllDiagnostics() {
	for (const document of vscode.workspace.textDocuments) ensureParsed(document);
	Object.keys(moduleManager.moduleCache).forEach(diagnosticsManager.publishModuleDiagnostics);
	console.log(getCurrentDateTime(), 'Diagnostics updated for all .nl files');
	vscode.window.showInformationMessage('Diagnostics updated for all .nl files');
}

async function onDidSaveTextDocument(document) {
	if (!isNotNl(document)) {
		// parses the saved text (if not parsed yet) and requests the type checks
		scheduler.onDocumentSaved(document);
		const hasErrors = vscode.languages.getDiagnostics(document.uri).some(diag => diag.severity === vscode.DiagnosticSeverity.Error);
		const cfg = vscode.workspace.getConfiguration('nianiolang');
		let didChange = false;
		if (cfg.get('onSave.removeUnusedModules') && !hasErrors) didChange ||= await removeUnusedModules(document);
		if (cfg.get('onSave.addMissingModules')) didChange ||= await addMissingModules(document);
		if (cfg.get('onSave.fixModuleNames')) didChange ||= await fixModuleNames(document);
		const onSavePrettyPrint = cfg.get('onSave.prettyPrint');
		if (onSavePrettyPrint === 'Current module') didChange ||= await prettyPrintModule(document);
		else if (onSavePrettyPrint === 'Current method') didChange ||= await prettyPrintMethod(document);
		// if (didChange) await document.save();
	} else if (!isNotNl(document, 'nianiolangGr', '.gr')) {
		const cfg = vscode.workspace.getConfiguration('nianiolang');
		if (cfg.get('onSave.prettyPrintGr')) await prettyPrintGr(document);
	}
}

async function prettyPrintModule(doc) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (isNotNl(document)) return false;
	ensureParsed(document);
	const lastLine = document.lineCount - 1;
	const lastChar = document.lineAt(lastLine).text.length;
	const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLine, lastChar));
	const filePath = document.fileName;
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const out = moduleManager.prettyPrintModule(thisModuleName);
	if (!out) return false;
	return await replaceRange(document, fullRange, out);
}

let outputChannel = null;
const getOutputChannel = () => outputChannel ??= vscode.window.createOutputChannel('NianioLang Dev Kit');

// Pretty prints all modules of the project (with the current formatting settings). Modules with errors are skipped.
// Documents open in the editor are edited and saved, other files are written directly (much faster than opening them).
async function prettyPrintAllModules() {
	const names = Object.keys(moduleManager.moduleCache).sort();
	if (names.length === 0) return;
	const style = vscode.workspace.getConfiguration('nianiolang').get('prettyPrint.modernPrint') ? 'modern' : 'classic';
	const confirm = 'Pretty print';
	const answer = await vscode.window.showWarningMessage(
		`NianioLang Dev Kit: pretty print all ${names.length} modules of the project (${style} formatting)?`,
		{ modal: true, detail: 'The files will be modified and saved. Modules with errors are skipped.' }, confirm);
	if (answer !== confirm) return;
	scheduler.flushAllParses();
	const changed = [], skipped = [], failed = [];
	let unchanged = 0, done = 0;
	const start = Date.now();
	const cancelled = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: 'NianioLang Dev Kit: pretty print',
		cancellable: true,
	}, async (progress, token) => {
		let sliceStart = Date.now();
		let reported = 0;
		for (const name of names) {
			if (token.isCancellationRequested) return true;
			const mod = moduleManager.getModule(name);
			if (!mod) continue;
			const uri = vscode.Uri.file(mod.filePath);
			try {
				const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
				if (document) ensureParsed(document);
				const out = moduleManager.prettyPrintModule(name);
				if (!out) {
					skipped.push(name);
				} else if (document) {
					const lastLine = document.lineCount - 1;
					const fullRange = new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
					if (await replaceRange(document, fullRange, out)) changed.push(name);
					else unchanged++;
				} else {
					const current = await fs.promises.readFile(mod.filePath, 'utf8');
					const bom = current.charCodeAt(0) === 0xFEFF ? '﻿' : '';
					if (current === bom + out) {
						unchanged++;
					} else {
						await vscode.workspace.fs.writeFile(uri, Buffer.from(bom + out, 'utf8'));
						changed.push(name);
					}
				}
			} catch (e) {
				failed.push(`${name}: ${e.message}`);
			}
			done++;
			// printing is synchronous - let the editor breathe and report the progress from time to time
			if (Date.now() - sliceStart > 50) {
				progress.report({ increment: 100 * (done - reported) / names.length, message: `${done} / ${names.length}\n${name}` });
				reported = done;
				await new Promise(resolve => setImmediate(resolve));
				sliceStart = Date.now();
			}
		}
		return false;
	});
	const channel = getOutputChannel();
	channel.appendLine(`${getCurrentDateTime()} Pretty print of all modules (${style} formatting)${cancelled ? ' - CANCELLED' : ''}: ${done} / ${names.length} processed in ${Date.now() - start} ms`);
	channel.appendLine(`  changed: ${changed.length}${changed.length ? ' - ' + changed.join(', ') : ''}`);
	channel.appendLine(`  already formatted: ${unchanged}`);
	channel.appendLine(`  skipped (modules with errors): ${skipped.length}${skipped.length ? ' - ' + skipped.join(', ') : ''}`);
	if (failed.length) channel.appendLine(`  failed: ${failed.length}\n    ${failed.join('\n    ')}`);
	const summary = `NianioLang Dev Kit: pretty print${cancelled ? ' cancelled' : ''} - changed ${changed.length}, already formatted ${unchanged}, skipped (errors) ${skipped.length}${failed.length ? `, failed ${failed.length}` : ''}`;
	const show = 'Show details';
	const choice = failed.length ? await vscode.window.showWarningMessage(summary, show) : await vscode.window.showInformationMessage(summary, show);
	if (choice === show) channel.show();
}

async function prettyPrintMethod(doc, pos = null) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (isNotNl(document)) return false;
	ensureParsed(document);
	if (pos === null) {
		const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString());
		if (!editor) return false;
		pos = editor.selection.active;
	}
	const filePath = document.fileName;
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const obj = moduleManager.prettyPrintMethod(thisModuleName, pos);
	if (!obj) return;
	const { range, out } = obj;
	return await replaceRange(document, range, out);
}

async function prettyPrintGr(doc) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (isNotNl(document, 'nianiolangGr', '.gr')) return false;
	const lastLine = document.lineCount - 1;
	const lastChar = document.lineAt(lastLine).text.length;
	const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLine, lastChar));
	const result = dfile.try_sload(document.getText());
	if (ov.is(result, 'err')) {
		return false;
	} 
	const out = dfile.ssave(ov.as(result, 'ok'));
	if (!out) return;
	await replaceRange(document, fullRange, out + '\n');
	return true;
} 

async function removeUnusedModules(document) {
	// const document = await vscode.workspace.openTextDocument(uri);
	const diagnostics = vscode.languages.getDiagnostics(document.uri);
	const edit = new vscode.WorkspaceEdit();
	for (const diagnostic of diagnostics) {
		if (!diagnostic.message.startsWith('multiple use module:') && !diagnostic.message.startsWith('unused module:')) continue;
		const range = new vscode.Range(diagnostic.range.start, new vscode.Position(diagnostic.range.end.line+1, 0));
		edit.delete(document.uri, range);
	}
	await vscode.workspace.applyEdit(edit);
	return edit.size > 0;
}

async function addMissingModules(document) {
	const diagnostics = vscode.languages.getDiagnostics(document.uri);
	const modules = {};
	for (const diagnostic of diagnostics) {
		if (!/module '[a-z0-9A-Z_]+' not imported/.test(diagnostic.message)) continue;
		const mod = diagnostic.message.split('\'')[1];
		if (mod in modules) continue;
		modules[mod] = 1;
	}
	await addImports(Object.keys(modules), document.uri);
	return Object.keys(modules).length > 0;
	// await vscode.workspace.applyEdit(edit);
}

async function fixModuleNames(document) {
	const diagnostics = vscode.languages.getDiagnostics(document.uri);
	const edit = new vscode.WorkspaceEdit();
	const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
	for (const diagnostic of diagnostics) {
		if (!diagnostic.message.startsWith('incorrect module name:')) continue;
		edit.replace(document.uri, diagnostic.range, thisModuleName);
	}
	await vscode.workspace.applyEdit(edit);
	return edit.size > 0;
}

async function refactorToJS(doc) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (isNotNl(document)) return;
	ensureParsed(document);
	const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
	const content = moduleManager.refactorToJS(thisModuleName);
	if (!content) return;
	const newWoc = await vscode.workspace.openTextDocument({content, language: 'javascript'});
	await vscode.window.showTextDocument(newWoc);
}

async function showModuleObject(doc) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (isNotNl(document)) return;
	ensureParsed(document);
	const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
	const mod = moduleManager.getModule(thisModuleName);
	if (!mod) return;
	const content = ptdPrinter.prettyPrinter(mod);
	const newDoc = await vscode.workspace.openTextDocument({ content, language: 'json' });
	await vscode.window.showTextDocument(newDoc, { viewColumn: vscode.ViewColumn.Beside });
}

function deactivate() { }

module.exports = { activate, deactivate };
