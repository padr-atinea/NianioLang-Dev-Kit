const vscode = require('vscode');
const path = require('path');
const os = require('os');
const moduleManager = require('./moduleManager');
const diagnosticsManager = require('./diagnosticsManager');
const ov = require('./nianioLibs/base/ov');
const ptdPrinter = require('./ptd-printer');
const own_to_im_converter = require('./nianioLibs/type_checker/own_to_im_converter');
const patchGenerator = require('./patchGenerator');

const funcRegex = /(?<!((?<!:):|->)[a-zA-Z0-9_]*)[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/;
const funcAndFieldRegex = /(?<!((?<!:):)[a-zA-Z0-9_]*)[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/;

let hoverDepth = 0;
let hoverShowOriginalTypeName = false;

let isDebug = false;

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
	const token = thisModule.varPositions[pos];
	if (!token) return null;
	if (ov.is(token, 'ref')) {
		const defPos = positionToIndex(token.ref.line, token.ref.position);
		const def = thisModule.varPositions[defPos];
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
	const { token, range } = tryGetPosTokenAtPosition(document, position);
	if (token) {
		if (ov.is(token, 'ref')) {
			const defPlace = ov.as(token, 'ref').defPlace;
			return new vscode.Location(document.uri, new vscode.Position(defPlace.line - 1, defPlace.position - 1));
		} else if (ov.is(token, 'def')) {
			const def = ov.as(token, 'def');
			return Object.keys(def.refs).map(ref => {
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

	const publicMatch = text.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+)::([a-zA-Z0-9_]*)$/);

	if (publicMatch == null) {
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
	const module = moduleManager.getModule(publicMatch[2]);
	if (!module) return;
	return Object.entries(module.methods).filter(([methodName, _]) => methodName.includes('::')).map(([methodName, method]) => {
		methodName = methodName.split('::')[1];
		const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Function);
		const shortDef = printMethodNoType(methodName, method);
		item.detail = shortDef;
		item.insertText = new vscode.SnippetString(method.args.length > 0 ? `${methodName}($0)` : `${methodName}()`);
		item.command = { command: 'nianiolang.addImportAndTriggerSignatureHelp', title: 'Add Import and Show Signature Help', arguments: [moduleName, document.uri] };
		const md = new vscode.MarkdownString();
		md.appendCodeblock(method.rawMethod, 'nianiolang');
		item.documentation = md;
		return item;
	});
}

function provideSignatureHelp(document, position) {
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
	provideCodeActions(document, range, context, token) {
		const moduleAction = new vscode.CodeAction('Pretty Print Module', vscode.CodeActionKind.Refactor);
		moduleAction.command = { command: 'extension.prettyPrintModule', title: 'Pretty Print Module', arguments: [document] };

		const methodAction = new vscode.CodeAction( 'Pretty Print Method', vscode.CodeActionKind.Refactor);
		methodAction.command = { command: 'extension.prettyPrintMethod', title: 'Pretty Print Method', arguments: [document, range.start] };

		return [moduleAction, methodAction];
	}
}

async function addImports(moduleNames, uri) {
	const document = await vscode.workspace.openTextDocument(uri);
	const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
	const edit = new vscode.WorkspaceEdit();
	const thisModule = moduleManager.getModule(thisModuleName);
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
			const minus = hoverDepth > 0 ? `[ (-) ](command:nianiolang.hover.dec?${encodedArgs})` : ' (-) ';
			const plus = `[ (+) ](command:nianiolang.hover.inc?${encodedArgs})`;
			const showName = `[${hoverShowOriginalTypeName ? 'Hide' : 'Show'} original type names](command:nianiolang.hover.showOriginalTypeName?${encodedArgs})`;
			md.appendMarkdown(`${minus} ${plus} Depth: ${hoverDepth} \t|\t ${showName}\n`);
			const type = own_to_im_converter.get_type_constructor(ov.get_value(token).type, true, hoverDepth, moduleManager.knownTypes, true, hoverShowOriginalTypeName);
			md.appendCodeblock(`type: ${type}`, 'nianiolang');
		}
		if (isDebug) md.appendCodeblock(ptdPrinter.prettyPrinter(token), 'json');
		return new vscode.Hover(md, range);
	}
	
	const obj = getMethodAtPosition(document, position); if (!obj) return;
	const { module, method, range: range1, fullName } = obj;
	if (module.filePath == document.fileName && method.startPos == document.offsetAt(range1.start)) return;

	const md = new vscode.MarkdownString();
	if (vscode.workspace.getConfiguration('nianiolang').get('onMethodHover.showReferenceCount')) {
		const references = moduleManager.getReferences(fullName, module.filePath);
		const referencesLength = Object.values(references).flat().length;
		md.appendMarkdown(`${referencesLength} reference${referencesLength === 1 ? '' : 's'}`);
	}
	md.appendCodeblock(method.rawMethod, 'nianiolang');
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
	let { token, range } = tryGetPosTokenAtPosition(document, position);
	const edit = new vscode.WorkspaceEdit();
	if (token && (ov.is(token, 'ref') || ov.is(token, 'def'))) {
		const def = ov.get_value(token);
		for (const defPos of Object.keys(def.refs)) {
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
		if (document.languageId !== 'nianiolang' || document.uri.scheme !== 'file') return [];
		const filePath = document.uri.fsPath;
		const moduleName = path.basename(filePath, path.extname(filePath));
		const mod = moduleManager.getModule(moduleName);
		if (!mod) return [];
		return Object.entries(mod.methods).map(([methodName, method]) => {
			const references = moduleManager.getReferences(methodName, filePath);
			const length = Object.values(references).flat().length;
			const pos = new vscode.Position(method.line - 1, 4);
			const range = new vscode.Range(pos, pos);
			return new vscode.CodeLens(range, {
				title: `${length} reference${length === 1 ? '' : 's'}`,
				command: 'extension.showReferences',
				arguments: [document, pos],
				// arguments: [document, pos, references],
			});
		});
	}
}

function addFileWathers(context, codeLensProvider) {
	const ignoreFileWatcher = vscode.workspace.createFileSystemWatcher('{.gitignore,.vscodeignore}');
	ignoreFileWatcher.onDidCreate(moduleManager.updateIgnore);
	ignoreFileWatcher.onDidChange(moduleManager.updateIgnore);
	ignoreFileWatcher.onDidDelete(moduleManager.updateIgnore);
	context.subscriptions.push(ignoreFileWatcher);

	const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.nl');
	fileWatcher.onDidCreate(uri => vscode.workspace.openTextDocument(uri).then(document => {
		moduleManager.updateModule(document, true);
		codeLensProvider._onDidChangeCodeLenses.fire();
	}));
	fileWatcher.onDidChange(uri => vscode.workspace.openTextDocument(uri).then(document => {
		moduleManager.updateModule(document, true);
		codeLensProvider._onDidChangeCodeLenses.fire();
	}));
	fileWatcher.onDidDelete(uri => {
		moduleManager.removeModule(uri.fsPath, true);
		codeLensProvider._onDidChangeCodeLenses.fire();
	});
	context.subscriptions.push(fileWatcher);
}

async function replaceRange(doc, range, newText) {
	const edit = new vscode.WorkspaceEdit();
	edit.replace(doc.uri, range, newText);
	await vscode.workspace.applyEdit(edit);
}

async function loadAllModules() {
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `NianioLang Dev Kit: loading modules`,
		cancellable: false
	}, async (progress, token) => {
		progress.report({ increment: 0 });
		const files = await moduleManager.findFiles();
		const total = files.length;
		if (total === 0) return;
		const concurrency = Math.min(8, Math.max(1, Math.floor(os.cpus().length / 2)));
		const increment = 100 / total;
		let completed = 0;
		const queue = files.slice();
		queue.reverse();

		async function worker() {
			while (queue.length && (!token || !token.isCancellationRequested)) {
				const uri = queue.shift();
				let thisModuleName = "";
				try {
					const document = await vscode.workspace.openTextDocument(uri);
					moduleManager.updateModule(document);
					thisModuleName = path.basename(uri.fsPath, path.extname(uri.fsPath));
				} catch (e) {
					if (!(e && e.message && e.message.startsWith("Canceled"))) console.error(e, e.stack);
				} finally {
					completed++;
					const percent = Math.round((10000 * completed) / total) / 100;
					progress.report({ increment, message: `${completed} / ${total} (${percent}%)\n${thisModuleName}` });
				}
			}
		}

		const workers = [];
		for (let i = 0; i < concurrency; i++) workers.push(worker());
		await Promise.all(workers);
	});

	console.log(getCurrentDateTime(), 'loadAllModules complited');
}

async function activate(context) {
	isDebug = context.extensionMode === vscode.ExtensionMode.Development;
	console.log(getCurrentDateTime(), 'NianioLang Dev Kit starting');

	const codeLensProvider = new ReferenceCounterCodeLensProvider();
	const statusMessage = vscode.window.setStatusBarMessage(`$(sync~spin) NianioLang Dev Kit: starting`);
	await loadAllModules();
	addFileWathers(context, codeLensProvider);
	const selector = { scheme: 'file', language: 'nianiolang' };

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(selector, { provideDefinition }),
		vscode.languages.registerCompletionItemProvider(selector, { provideCompletionItems }, ':'),
		vscode.languages.registerSignatureHelpProvider(selector, { provideSignatureHelp }, '(', ','),
		vscode.languages.registerCodeActionsProvider(selector, new NianioLangCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
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
		vscode.commands.registerCommand('extension.prettyPrintMethod', prettyPrintMethod),
		vscode.commands.registerCommand('extension.refactorToJS', refactorToJS), 
		vscode.commands.registerCommand('extension.showReferences', async (document, position) => {
			vscode.commands.executeCommand('editor.action.showReferences', document.uri, position, await provideReferences(document, position));
		}),

		// vscode.workspace.onDidOpenTextDocument(diagnosticsManager.updateDiagnostics),
		// vscode.workspace.onDidRenameFiles(event => event.files.forEach(fixAllIncorretNamesWhenRename)),
		vscode.workspace.onDidCloseTextDocument(diagnosticsManager.deleteDocument),
		vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument(codeLensProvider)),
		vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
		vscode.window.onDidChangeVisibleTextEditors(editors => editors.forEach(editor => diagnosticsManager.updateDiagnostics(editor.document))),

		vscode.commands.registerCommand('nianiolang.generatePatchFromCommit', patchGenerator.generate), 
	);

	if (vscode.window.activeTextEditor) await diagnosticsManager.updateAllOpenTabs();
	console.log(getCurrentDateTime(), 'NianioLang Dev Kit activated');
	statusMessage.dispose();
	vscode.window.showInformationMessage('NianioLang Dev Kit: Ready to use');
}

async function updateAllDiagnostics() {
	const files = await moduleManager.findFiles();
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `NianioLang Dev Kit: Update Diagnostics`,
		cancellable: false
	}, async (progress, _) => {
		progress.report({ increment: 0 });
		for (let i = 0; i < files.length; i++) {
			const document = await vscode.workspace.openTextDocument(files[i]);
			diagnosticsManager.updateDiagnostics(document);
			progress.report({ increment: i / files.length * 0.6, message: `${i} / ${files.length} (${Math.round(10000 * i / files.length) / 100}%)` });
		}
	});
	console.log(getCurrentDateTime(), 'Diagnostics updated for all .nl files');
	vscode.window.showInformationMessage('Diagnostics updated for all .nl files');
}

function onDidChangeTextDocument(codeLensProvider) {
	return event => {
		moduleManager.updateModule(event.document, true);
		codeLensProvider._onDidChangeCodeLenses.fire();
		diagnosticsManager.updateDiagnostics(event.document);
	};
}

async function onDidSaveTextDocument(document) {
	if (document.eol !== vscode.EndOfLine.LF) await vscode.window.activeTextEditor?.edit((editBuilder) => editBuilder.setEndOfLine(vscode.EndOfLine.LF));
	const cfg = vscode.workspace.getConfiguration('nianiolang');
	if (cfg.get('onSave.removeUnusedModules')) await removeUnusedModules(document);
	if (cfg.get('onSave.addMissingModules')) await addMissingModules(document);
	if (cfg.get('onSave.fixModuleNames')) await fixModuleNames(document);
	const onSavePrettyPrint = cfg.get('onSave.prettyPrint');
	if (onSavePrettyPrint === 'Current module') await prettyPrintModule(document);
	else if (onSavePrettyPrint === 'Current method') await prettyPrintMethod(document);
	await diagnosticsManager.updateAllOpenTabs(document);
	document.save();
}

async function prettyPrintModule(doc) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (!document || document.languageId !== 'nianiolang') return;
	const lastLine = document.lineCount - 1;
	const lastChar = document.lineAt(lastLine).text.length;
	const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLine, lastChar));
	const filePath = document.fileName;
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const out = moduleManager.prettyPrintModule(thisModuleName);
	if (!out) return;
	await replaceRange(document, fullRange, out);
}

async function prettyPrintMethod(doc, pos = null) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (!document || document.languageId !== 'nianiolang') return;
	if (pos === null) {
		const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString());
		if (!editor) return null;
		pos = editor.selection.active;
	}
	const filePath = document.fileName;
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const obj = moduleManager.prettyPrintMethod(thisModuleName, pos);
	if (!obj) return;
	const { range, out } = obj;
	await replaceRange(document, range, out);
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
}

async function refactorToJS(doc) {
	const document = doc ?? vscode.window.activeTextEditor?.document;
	if (!document || document.languageId !== 'nianiolang') return;
	const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
	const content = moduleManager.refactorToJS(thisModuleName);
	if (!content) return;
	const newWoc = await vscode.workspace.openTextDocument({content, language: 'javascript'});
	await vscode.window.showTextDocument(newWoc);
}


function deactivate() { }

module.exports = { activate, deactivate };
