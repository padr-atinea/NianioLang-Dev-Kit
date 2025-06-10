const vscode = require('vscode');
const path = require('path');
const moduleManager = require('./moduleManager');
const diagnosticsManager = require('./diagnosticsManager');
const ov = require('./nianioLibs/ov');
const ptdPrinter = require('./ptd-printer');

const funcRegex = /(?<!((?<!:):|->)[a-zA-Z0-9_]*)[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/;

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
	const obj = getMethod(fullName, document.fileName);
	if (!obj) return;
	return { fullName, range, ...obj };
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

function tryGetPosTokenAtPosition(document, position) {
	const range = document.getWordRangeAtPosition(position, funcRegex);
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
				const refPos = ref.split('|').map(part => parseInt(part));
				return new vscode.Location(document.uri, new vscode.Range(refPos[0] - 1, refPos[1] - 1, refPos[0] - 1, refPos[1] - 1 + def.name.length));
			});
		} else if (token.type == 'useStatement') {
			const module = moduleManager.getModule(token.name);
			if (!module) return;
			const doc = await vscode.workspace.openTextDocument(module.filePath);
			return new vscode.Location(doc.uri, new vscode.Position(0, 0));
		}
	}
	
	const obj = getMethodAtPosition(document, position);
	if (!obj) return;
	const { method, module } = obj;
	const targetDoc = await vscode.workspace.openTextDocument(module.filePath);
	return new vscode.Location(targetDoc.uri, new vscode.Position(method.line - 1, 0));
}

const printParamNoType = (param) => `${ov.is(param.mod, 'ref') ? 'ref ' : ''}${param.name}`;
const printParamsNoType = (params) => `${params.map(printParamNoType).join(', ')}`;
const printMethodNoType = (methodName, method) => `${methodName}(${printParamsNoType(method.args)})}`;

// const printParam = (param) => `${printParamNoType(param)}${param.type === null ? '' : ` : ${param.type}`}`;
// const printParams = (params) => `${params.map(printParam).join(', ')}`;
// const printMethod = (moduleName, methodName, method, isPublic = true) => `${isPublic ? `${moduleName}::` : ''}${methodName}(${printParams(method.args)})${method.returnType.length > 0 ? ` : ${method.returnType}` : ''}`

// const parseBody = (body) => body.slice(1, -1).trim().split('\n').map(line => line.replace(/^\t/, '')).join('\n');

// const parseNlType = (nlType) => {
// 	return 'TODO';
// 	if (!nlType) return null;
// 	if (nlType[0] !== '@' && nlType.startsWith('ptd::')) return null;
// 	nlType = nlType[0] == '@' ? nlType.slice(1) : nlType.split('(')[0]
// 	const parts = nlType.split('::');
// 	if (parts.length !== 2) return null;
// 	const typeModule = moduleManager.getModule(parts[0]);
// 	if (!typeModule) return null;
// 	const body = parseBody(typeModule.publicMethods[parts[1]].body);
// 	return body.startsWith('return ') ? body.slice('return '.length) : body;
// }

async function provideCompletionItems(document, position) {
	const line = document.lineAt(position);
	const text = line.text.substring(0, position.character);
	const publicMatch = text.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+)::([a-zA-Z0-9_]*)$/);

	if (publicMatch == null) {
		const privateMatch = text.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+)$/);
		if (!privateMatch) return [];

		const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
		const thisModule = moduleManager.getModule(thisModuleName);

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
		const thisPos = document.offsetAt(position);
		const fields = Object.values(thisModule.positions ?? [])
			.filter((pos) => pos.type == 'fieldDef' && thisPos > pos.startPos + pos.name.length + 1 && thisPos < pos.endOfScope)
			.map((pos) => {
				const item = new vscode.CompletionItem(pos.name, vscode.CompletionItemKind.Field);
				item.detail = `type: ${pos.nlType ?? 'unknown'}`;
				item.insertText = new vscode.SnippetString(pos.name);
				if (pos.nlType === null) return item;
				const body = parseNlType(pos.nlType);
				if (body) return item;
				const md = new vscode.MarkdownString();
				md.appendCodeblock(body, 'nianiolang');
				item.documentation = md;
				return item;
			});

		return [...methods, ...fields];
	}

	const moduleName = publicMatch[2];
	const module = moduleManager.getModule(publicMatch[2]);
	if (!module) return;
	return Object.entries(module.methods).filter(([methodName, _]) => !methodName.includes('::')).map(([methodName, method]) => {
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

function addImportAndTriggerSignatureHelp(moduleName, uri) {
	addImport(moduleName, uri);
	vscode.commands.executeCommand('editor.action.triggerParameterHints');
}

class NianioLangCodeActionProvider {
	provideCodeActions(document, range, context, token) {
		const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
		const thisModule = moduleManager.getModule(thisModuleName);
		if (!thisModule) return;
		const actions = [];
		const diagnostics = vscode.languages.getDiagnostics(document.uri);
		const diagnosticsDuplicates = diagnostics.map(d => d.code).reduce((prev, curr) => {
			if (!(Object.keys(prev).includes(curr))) prev[curr] = 0;
			prev[curr]++;
			return prev;
		}, {});
		for (const diagnostic of context.diagnostics) {
			if (diagnostic.code === 'missingImport') {
				const moduleName = document.getText(new vscode.Range(diagnostic.range.start, diagnostic.range.end));
				const action = new vscode.CodeAction(`Add 'use ${moduleName};'`, vscode.CodeActionKind.QuickFix);
				const edit = new vscode.WorkspaceEdit();
				const insertPosition = document.positionAt(thisModule.lastUseStatementPos);
				edit.insert(document.uri, insertPosition, `\nuse ${moduleName};`);
				action.edit = edit;
				action.diagnostics = [diagnostic];
				actions.push(action);
			} else if (diagnostic.code === 'privateMethod') {
				// The '${methodName}' method in module '${moduleName}' is private
				const methodNameMatch = diagnostic.message.match(/The '([a-zA-Z0-9_]+)' method in module/);
				const moduleNameMatch = diagnostic.message.match(/in module '([a-zA-Z0-9_]+)' is private/);
				if (moduleNameMatch && methodNameMatch) {
					const moduleName = moduleNameMatch[1];
					const functionName = methodNameMatch[1];
					const action = new vscode.CodeAction(`Make '${functionName}' public`, vscode.CodeActionKind.QuickFix);
					action.command = { command: 'nianiolang.makeMethodPublic', title: 'Make method public', arguments: [moduleName, functionName] };
					action.diagnostics = [diagnostic];
					actions.push(action);
				}

			} else if (diagnostic.code === 'duplicatedImport' || diagnostic.code === 'notUsedImport') {
				const endPos = document.getText()[document.offsetAt(diagnostic.range.end)] == '\n'
					? diagnostic.range.end.translate(1, -diagnostic.range.end.character)
					: diagnostic.range.end
				const range = new vscode.Range(diagnostic.range.start, endPos);
				const moduleName = document.getText(range).trim();
				const action = new vscode.CodeAction(`Remove '${moduleName}'`, vscode.CodeActionKind.QuickFix);
				let edit = new vscode.WorkspaceEdit();
				edit.delete(document.uri, range);
				action.edit = edit;
				action.diagnostics = [diagnostic];
				actions.push(action);
				if ((diagnosticsDuplicates['duplicatedImport'] ?? 0) + (diagnosticsDuplicates['notUsedImport'] ?? 0) > 1) {
					const fileAction = new vscode.CodeAction("Remove all unnecessary usings in this file", vscode.CodeActionKind.QuickFix);
					fileAction.command = {
						command: "extension.removeAllUsingsInFile",
						title: "Remove all unnecessary usings in this file",
						arguments: [document.uri]
					};
					actions.push(fileAction);
				}
			} else if (diagnostic.code === 'moduleNameNotEqualFileName') {
				// Module name '${moduleName}' must equal file name '${thisModuleName}'
				const methodNameMatch = diagnostic.message.match(/Module name '([a-zA-Z0-9_]+)' must equal /);
				const moduleNameMatch = diagnostic.message.match(/file name '([a-zA-Z0-9_]+)'/);
				if (moduleNameMatch && methodNameMatch) {
					const range = new vscode.Range(diagnostic.range.start, diagnostic.range.end);
					const filePath = moduleNameMatch[1];
					const action = new vscode.CodeAction(`Fix module name`, vscode.CodeActionKind.QuickFix);
					const edit = new vscode.WorkspaceEdit();
					edit.replace(document.uri, range, filePath);
					action.edit = edit;
					action.diagnostics = [diagnostic];
					actions.push(action);
					if (diagnosticsDuplicates['moduleNameNotEqualFileName'] > 1) {
						const fileAction = new vscode.CodeAction("Fix all incorret names", vscode.CodeActionKind.QuickFix);
						fileAction.command = {
							command: "extension.fixAllIncorretNames",
							title: "Fix all incorret names",
							arguments: [document.uri, filePath]
						};
						actions.push(fileAction);
					}
				}
			}
		}
		return actions;
	}
}

function addImport(moduleName, uri) {
	vscode.workspace.openTextDocument(uri).then((document) => {
		const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
		if (moduleName === thisModuleName) return;
		const edit = new vscode.WorkspaceEdit();
		const thisModule = moduleManager.getModule(thisModuleName);
		if (!thisModule || Object.keys(thisModule.usedModules).includes(moduleName)) return;
		edit.insert(document.uri, document.positionAt(thisModule.lastUseStatementPos), `${thisModule.lastUseStatementPos == 0 ? '' : '\n'}use ${moduleName};`);
		vscode.workspace.applyEdit(edit);
	});
}

function makeMethodPublic(moduleName, functionName) {
	const module = moduleManager.getModule(moduleName);
	if (!module) return;

	vscode.workspace.openTextDocument(module.filePath).then((moduleDoc) => {
		const edit = new vscode.WorkspaceEdit();
		const text = moduleDoc.getText();
		const re = new RegExp(`^(\\s*def\\s+)(${functionName}\\s*\\()`, 'm');
		const match = re.exec(text);
		if (match) {
			const startPos = moduleDoc.positionAt(match.index);
			const endPos = moduleDoc.positionAt(match.index + match[0].length);
			edit.replace(moduleDoc.uri, new vscode.Range(startPos, endPos), `${match[1]}${moduleName}::${match[2]}`);
			vscode.workspace.applyEdit(edit).then(moduleDoc.save);
		}
	});
}

function provideHover(document, position) {
	const { token, range } = tryGetPosTokenAtPosition(document, position);
	if (token) {
		const md = new vscode.MarkdownString();
		md.appendCodeblock(ptdPrinter.prettyPrinter(token), 'json');
		return new vscode.Hover(md, range);
	}
	
	const obj = getMethodAtPosition(document, position); if (!obj) return;
	const { module, method, range: range1 } = obj;
	if (module.filePath == document.fileName && method.startPos == document.offsetAt(range1.start)) return;

	const md = new vscode.MarkdownString();
	// const references = moduleManager.getReferences(fullName, module.filePath);
	// const referencesLength = Object.values(references).flat().length;
	// md.appendMarkdown(`${referencesLength} reference${referencesLength === 1 ? '' : 's'}`);
	md.appendCodeblock(method.rawMethod, 'nianiolang');
	return new vscode.Hover(md, range);
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
	if (token && ov.is(token, 'ref') || ov.is(token, 'def')) {
		const def = ov.get_value(token);
		for (const defPos of Object.keys(def.refs)) {
			const pos = defPos.split('|').map(part => parseInt(part));
			edit.replace(document.uri, new vscode.Range(pos[0] - 1, pos[1] - 1, pos[0] - 1, pos[1] - 1 + def.name.length), newName);
		}
		edit.replace(document.uri, new vscode.Range(def.defPlace.line - 1, def.defPlace.position - 1, def.defPlace.line - 1, def.defPlace.position - 1 + def.name.length), newName);
	} else {
		// const obj = getMethodAtPosition(document, position); if (!obj) return;
		// const { fullName, method, module, moduleName } = obj;
		// const references = moduleManager.getReferences(fullName, document.uri.fsPath);
		// if (fullName.includes("::")) newName = `${moduleName}::${newName}`;

		// for (const [file, positions] of Object.entries(references)) {
		// 	const doc = await vscode.workspace.openTextDocument(file);
		// 	for (const pos of positions) {
		// 		edit.replace(doc.uri, new vscode.Range(pos.line - 1, pos.position - 1, pos.line - 1, pos.position - 1 + fullName.length), newName);
		// 	}
		// }
		// const doc = await vscode.workspace.openTextDocument(module.filePath);

		// edit.replace(doc.uri, new vscode.Range(doc.positionAt(method.startPos), doc.positionAt(method.startPos + fullName.length)), newName);
	}

	
	return edit;
}

async function provideReferences(document, position) {
	const locations = [];
	const range = document.getWordRangeAtPosition(position, funcRegex);
	if (!range) return;
	const symbol = document.getText(range);
	const references = moduleManager.getReferences(symbol, document.uri.fsPath);
	for (const [file, positions] of Object.entries(references)) {
		const doc = await vscode.workspace.openTextDocument(file);
		for (const pos of positions) {
			locations.push(new vscode.Location(doc.uri, new vscode.Range(pos.line - 1, pos.position - 1, pos.line - 1, pos.position - 1 + symbol.length)));
		}
	}
	return locations;
}

async function removeAllUsingsInFile(uri) {
	const document = await vscode.workspace.openTextDocument(uri);
	const diagnostics = vscode.languages.getDiagnostics(document.uri);
	const edit = new vscode.WorkspaceEdit();
	for (const diagnostic of diagnostics) {
		if (diagnostic.code !== 'duplicatedImport' && diagnostic.code !== 'notUsedImport') continue;
		const text = document.getText();
		const charAtEnd = text[document.offsetAt(diagnostic.range.end)];
		const endPos = charAtEnd === '\n'
			? diagnostic.range.end.translate(1, -diagnostic.range.end.character)
			: diagnostic.range.end;
		const range = new vscode.Range(diagnostic.range.start, endPos);
		edit.delete(document.uri, range);
	}
	await vscode.workspace.applyEdit(edit);
}

async function fixAllIncorretNames(uri, newName) {
	const document = await vscode.workspace.openTextDocument(uri);
	const diagnostics = vscode.languages.getDiagnostics(document.uri);
	const edit = new vscode.WorkspaceEdit();
	for (const diagnostic of diagnostics) {
		if (diagnostic.code !== 'moduleNameNotEqualFileName') continue;
		const range = new vscode.Range(diagnostic.range.start, diagnostic.range.end);
		edit.replace(document.uri, range, newName);
	}
	await vscode.workspace.applyEdit(edit);
}

async function fixAllIncorretNamesWhenRename(file) {
	const newUri = file.newUri;
	const filePath = path.basename(newUri.fsPath, path.extname(newUri.fsPath));
	const answer = await vscode.window.showWarningMessage(
		`Czy wykonać akcję naprawy nazw modułów w tym pliku?`,
		{ modal: true }, 'Tak', 'Nie'
	);
	if (answer == 'Tak') fixAllIncorretNames(newUri, filePath);
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
			const pos = new vscode.Position(method.line - 1, 0)
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
	}, async (progress, _) => {
		progress.report({ increment: 0 });
		const files = await moduleManager.findFiles();
		for (let i = 0; i < files.length; i++) {
			try {
				const document = await vscode.workspace.openTextDocument(files[i]);
				moduleManager.updateModule(document);
				progress.report({ increment: i / files.length * 0.6, message: `${i} / ${files.length} (${Math.round(10000 * i / files.length) / 100}%)` });
			} catch (e) {
				console.error(e, e.stack);
				e;
			}
		}
	});

	console.log('loadAllModules complited');
}

async function activate(context) {
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

		// vscode.commands.registerCommand('nianiolang.moduleNameNotEqualFileName', moduleNameNotEqualFileName),
		vscode.commands.registerCommand('activate.addImport', addImport),
		vscode.commands.registerCommand('nianiolang.makeMethodPublic', makeMethodPublic),
		vscode.commands.registerCommand('nianiolang.addImportAndTriggerSignatureHelp', addImportAndTriggerSignatureHelp),
		vscode.commands.registerCommand('extension.removeAllUsingsInFile', removeAllUsingsInFile),
		vscode.commands.registerCommand('extension.fixAllIncorretNames', fixAllIncorretNames),
		vscode.commands.registerCommand('extension.updateAllDiagnostics', updateAllDiagnostics),
		vscode.commands.registerCommand('extension.prettyPrintModule', prettyPrintModule),
		vscode.commands.registerCommand('extension.prettyPrintMethod', prettyPrintMethod),
		vscode.commands.registerCommand('extension.showReferences', async (document, position) => {
			vscode.commands.executeCommand('editor.action.showReferences', document.uri, position, await provideReferences(document, position));
		}),

		// vscode.workspace.onDidOpenTextDocument(diagnosticsManager.updateDiagnostics),
		vscode.workspace.onDidRenameFiles(event => event.files.forEach(fixAllIncorretNamesWhenRename)),
		vscode.workspace.onDidCloseTextDocument(diagnosticsManager.deleteDocument),
		vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument(codeLensProvider)),
		vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
		vscode.window.onDidChangeVisibleTextEditors(editors => editors.forEach(editor => diagnosticsManager.updateDiagnostics(editor.document))),
	);

	if (vscode.window.activeTextEditor) diagnosticsManager.updateAllOpenTabs();
	console.log('NianioLang Dev Kit activated');
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
	console.log('Diagnostics updated for all .nl files');
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
	const onSavePrettyPrint = cfg.get('onSave.prettyPrint');
	if (onSavePrettyPrint === 'Current module') await prettyPrintModule(document);
	else if (onSavePrettyPrint === 'Current method') await prettyPrintMethod(document);
	diagnosticsManager.updateAllOpenTabs(document);
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

}

function deactivate() { }

module.exports = { activate, deactivate };
