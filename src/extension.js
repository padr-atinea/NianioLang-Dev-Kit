const vscode = require('vscode');
const path = require('path');
const moduleManager = require('./moduleManager');
const diagnosticsManager = require('./diagnosticsManager');

const funcRegex = /(?<!((?<!:):|->)[a-zA-Z0-9_]*)[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/;

function getMethod(fullName, filePath) {
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const isPublic = fullName.includes("::");
	const [moduleName, methodName] = isPublic ? fullName.split("::") : [thisModuleName, fullName];
	const module = moduleManager.getModule(moduleName);
	if (!module) return;
	const method = isPublic
		? module.publicMethods[methodName] ?? module.privateMethods[methodName]
		: module.privateMethods[methodName] ?? module.publicMethods[methodName];
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
	return thisModule.positions[pos];
}

function tryGetPosTokenAtPosition(document, position) {
	const range = document.getWordRangeAtPosition(position, funcRegex);
	const token = tryGetPosToken(document, document.offsetAt(range.start));
	if (token) token.range = range;
	return token;
}

async function provideDefinition(document, position) {
	const token = tryGetPosTokenAtPosition(document, position);
	if (token) {
		if (token.type == 'fieldRef') {
			return new vscode.Location(document.uri, document.positionAt(token.def.startPos));
		} else if (token.type == 'fieldDef') {
			return token.usage.map(usage => new vscode.Location(document.uri, new vscode.Range(document.positionAt(usage), document.positionAt(usage + token.name.length))));
		} else if (token.type == 'methodDef') {
			const references = moduleManager.getReferences(token.name, document.fileName);
			if (Object.values(references).flat().length > 0) {
				const locations = [];
				for (const [file, positions] of Object.entries(references)) {
					const doc = await vscode.workspace.openTextDocument(file);
					for (const pos of positions) {
						locations.push(new vscode.Location(doc.uri, new vscode.Range(doc.positionAt(pos), doc.positionAt(pos + token.name.length))));
					}
				}
				return locations;
			}
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
	return new vscode.Location(targetDoc.uri, targetDoc.positionAt(method.startPos));
}

const printParam = (param) => `${param.startPosOfRef === null ? '' : 'ref '}${param.fieldName}${param.type === null ? '' : ` : ${param.type}`}`;

const printMethod = (moduleName, methodName, method, isPublic = true) => `${isPublic ? `${moduleName}::` : ''}${methodName}(${method.parameters.map(printParam).join(', ')})${method.returnType.length > 0 ? ` : ${method.returnType}` : ''}`

const parseBody = (body) => body.slice(1, -1).trim().split('\n').map(line => line.replace(/^\t/, '')).join('\n');

async function provideCompletionItems(document, position) {
	const line = document.lineAt(position);
	const text = line.text.substring(0, position.character);
	const publicMatch = text.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+)::([a-zA-Z0-9_]*)$/);

	if (publicMatch == null) {
		const privateMatch = text.match(/(?<!((?<!:):|->)[a-zA-Z0-9_]*)([a-zA-Z0-9_]+)$/);
		if (!privateMatch) return [];

		const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));
		const thisModule = moduleManager.getModule(thisModuleName);

		const methods = Object.entries(thisModule.privateMethods).map(([methodName, method]) => {
			const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Function);
			const shortDef = printMethod(thisModuleName, methodName, method, false);
			item.detail = shortDef;
			item.insertText = new vscode.SnippetString(method.parameters.length > 0 ? `${methodName}($0)` : `${methodName}()`);
			const md = new vscode.MarkdownString();
			md.appendCodeblock(`def ${shortDef} ${method.body}`, 'nianiolang');
			item.documentation = md;
			return item;
		});
		const thisPos = document.offsetAt(position);
		const fields = Object.values(thisModule.positions)
			.filter((pos) => pos.type == 'fieldDef' && thisPos > pos.startPos + pos.name.length + 1 && thisPos < pos.endOfScope)
			.map((pos) => {
				const item = new vscode.CompletionItem(pos.name, vscode.CompletionItemKind.Field);
				item.detail = `type: ${pos.nlType ?? 'unknown'}`;
				item.insertText = new vscode.SnippetString(pos.name);
				if (pos.nlType === null) return item;
				const nlType = pos.nlType[0] == '@' ? pos.nlType.slice(1) : pos.nlType.split('(')[0];
				const parts = nlType.split('::');
				if (parts.length !== 2) return item;
				const typeModule = moduleManager.getModule(parts[0]);
				if (!typeModule || !(parts[1] in typeModule.publicMethods)) return item;
				const md = new vscode.MarkdownString();
				md.appendCodeblock(parseBody(typeModule.publicMethods[parts[1]].body), 'nianiolang');
				item.documentation = md;
				return item;
			});

		return [...methods, ...fields];
	}

	const moduleName = publicMatch[2];
	const module = moduleManager.getModule(publicMatch[2]);
	if (!module) return;
	return Object.entries(module.publicMethods).map(([methodName, method]) => {
		const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Function);
		const shortDef = printMethod(moduleName, methodName, method);
		item.detail = shortDef;
		item.insertText = new vscode.SnippetString(method.parameters.length > 0 ? `${methodName}($0)` : `${methodName}()`);
		item.command = { command: 'nianiolang.addImportAndTriggerSignatureHelp', title: 'Add Import and Show Signature Help', arguments: [moduleName, document.uri] };
		const md = new vscode.MarkdownString();
		md.appendCodeblock(`def 	${shortDef} ${method.body}`, 'nianiolang');
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
	const parameters = getMethod(fullName[2], document.fileName)?.method.parameters;
	if (!parameters) return;

	const label = `${fullName[2]}(${parameters.map(printParam).join(', ')})`;
	const sigHelp = new vscode.SignatureHelp();
	const sigInfo = new vscode.SignatureInformation(label);
	sigInfo.parameters = parameters.map(p => new vscode.ParameterInformation(printParam(p)));
	sigHelp.signatures = [sigInfo];
	sigHelp.activeSignature = 0;
	sigHelp.activeParameter = paramIndex < parameters.length ? paramIndex : parameters.length - 1;
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
			if (!(curr in prev)) prev[curr] = 0;
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
		if (!thisModule || moduleName in thisModule.usedModules) return;
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
	if (moduleManager.showDebugHoverInfo) {
		const token = tryGetPosTokenAtPosition(document, position);
		if (token && /^(fieldRef|fieldDef)$/.test(token.type)) {
			const md = new vscode.MarkdownString();
			const range = token.range; delete token.range;
			md.appendCodeblock(JSON.stringify(token), 'json');
			return new vscode.Hover(md, range);
		}
	}
	const obj = getMethodAtPosition(document, position); if (!obj) return;
	const { module, method, methodName, moduleName, range, isPublic } = obj;
	if (module.filePath == document.fileName && method.startPos == document.offsetAt(range.start)) return;

	const md = new vscode.MarkdownString();
	// const references = moduleManager.getReferences(fullName, module.filePath);
	// const referencesLength = Object.values(references).flat().length;
	// md.appendMarkdown(`${referencesLength} reference${referencesLength === 1 ? '' : 's'}`);
	const def = `def ${printMethod(moduleName, methodName, method, isPublic)} ${method.body}`;
	md.appendCodeblock(def, 'nianiolang');

	return new vscode.Hover(md, range);
}

async function prepareRename(document, position) {
	const token = tryGetPosTokenAtPosition(document, position);
	if (token && /^(fieldRef|fieldDef)$/.test(token.type)) {
		return;
		// const pos = document.positionAt(token.startPos);
		// return {
		// 	range: new vscode.Range(pos, pos.translate(0, token.name.length)),
		// 	placeholder: token.name,
		// }
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
	let token = tryGetPosTokenAtPosition(document, position);
	const edit = new vscode.WorkspaceEdit();
	if (token && /^(fieldRef|fieldDef)$/.test(token.type)) {
		if (token.type == 'fieldRef') token = token.def;
		for (const defPos of token.usage) {
			const pos = document.positionAt(defPos);
			edit.replace(document.uri, new vscode.Range(pos, pos.translate(0, token.name.length)), newName);
		}
		const pos = document.positionAt(token.startPos);
		edit.replace(document.uri, new vscode.Range(pos, pos.translate(0, token.name.length)), newName);
	} else {
		const obj = getMethodAtPosition(document, position); if (!obj) return;
		const { fullName, method, module, moduleName } = obj;
		const references = moduleManager.getReferences(fullName, document.uri.fsPath);
		if (fullName.includes("::")) newName = `${moduleName}::${newName}`;

		for (const [file, positions] of Object.entries(references)) {
			const doc = await vscode.workspace.openTextDocument(file);
			for (const pos of positions) {
				edit.replace(doc.uri, new vscode.Range(doc.positionAt(pos), doc.positionAt(pos + fullName.length)), newName);
			}
		}
		const doc = await vscode.workspace.openTextDocument(module.filePath);

		edit.replace(doc.uri, new vscode.Range(doc.positionAt(method.startPos), doc.positionAt(method.startPos + fullName.length)), newName);
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
			locations.push(new vscode.Location(doc.uri, new vscode.Range(doc.positionAt(pos), doc.positionAt(pos + symbol.length))));
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
		const module = moduleManager.getModule(moduleName);
		if (!module) return [];
		const lenses = [];
		const newLocal = [...Object.entries(module.privateMethods), ...Object.entries(module.publicMethods)];
		for (const [methodName, method] of newLocal) {
			const references = moduleManager.getReferences(method.isPrivate ? methodName : `${moduleName}::${methodName}`, filePath);
			const length = Object.values(references).flat().length;
			const pos = document.positionAt(method.startPos);
			const range = new vscode.Range(pos, pos);
			lenses.push(new vscode.CodeLens(range, {
				title: `${length} reference${length === 1 ? '' : 's'}`,
				command: 'extension.showReferences',
				arguments: [document, pos, references]
			}));
		}
		return lenses;
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

async function activate(context) {
	const codeLensProvider = new ReferenceCounterCodeLensProvider();

	const statusMessage = vscode.window.setStatusBarMessage(`$(sync~spin) NianioLang Dev Kit: starting`);
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `NianioLang Dev Kit: loading modules`,
		cancellable: false
	}, async (progress, token) => {
		progress.report({ increment: 0 });

		const files = await moduleManager.findFiles();
		for (const i in files) {
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

	addFileWathers(context, codeLensProvider);

	// await loadAllModules(context);

	const selector = { scheme: 'file', language: 'nianiolang' };
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, { provideDefinition }));
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, { provideCompletionItems }, ':'));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(selector, { provideSignatureHelp }, '(', ','));
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, new NianioLangCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
	context.subscriptions.push(vscode.languages.registerHoverProvider(selector, { provideHover }));
	context.subscriptions.push(vscode.languages.registerRenameProvider(selector, { provideRenameEdits, prepareRename }));
	context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, { provideReferences }));
	context.subscriptions.push(vscode.commands.registerCommand('activate.addImport', addImport));
	context.subscriptions.push(vscode.commands.registerCommand('nianiolang.makeMethodPublic', makeMethodPublic));
	context.subscriptions.push(vscode.commands.registerCommand('nianiolang.addImportAndTriggerSignatureHelp', addImportAndTriggerSignatureHelp));
	// context.subscriptions.push(vscode.commands.registerCommand('nianiolang.moduleNameNotEqualFileName', moduleNameNotEqualFileName));
	context.subscriptions.push(vscode.commands.registerCommand('extension.removeAllUsingsInFile', removeAllUsingsInFile));
	context.subscriptions.push(vscode.commands.registerCommand('extension.fixAllIncorretNames', fixAllIncorretNames));
	context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => 
		event.files.forEach(fixAllIncorretNamesWhenRename)
	));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		moduleManager.updateModule(event.document, true);
		codeLensProvider._onDidChangeCodeLenses.fire();
		diagnosticsManager.updateDiagnostics(event.document);
	}));
	// context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(diagnosticsManager.updateDiagnostics));
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(diagnosticsManager.deleteDocument));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(diagnosticsManager.updateAllOpenTabs));
	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
		editors.forEach(editor => diagnosticsManager.updateDiagnostics(editor.document));
	}));

	context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, codeLensProvider));
	context.subscriptions.push(vscode.commands.registerCommand('extension.showReferences', async (document, position) => {
		const locations = await provideReferences(document, position);
		vscode.commands.executeCommand('editor.action.showReferences', document.uri, position, locations);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('extension.updateAllDiagnostics', async () => {
		const files = await moduleManager.findFiles();
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `NianioLang Dev Kit: Update Diagnostics`,
			cancellable: false
		}, async (progress, token) => {
			progress.report({ increment: 0 });
			for (const i in files) {
				const document = await vscode.workspace.openTextDocument(files[i]);
				diagnosticsManager.updateDiagnostics(document);
				progress.report({ increment: i / files.length * 0.6, message: `${i} / ${files.length} (${Math.round(10000 * i / files.length) / 100}%)` });
			}
		});
		console.log('Diagnostics updated for all .nl files');
		vscode.window.showInformationMessage('Diagnostics updated for all .nl files');
	}));

	if (vscode.window.activeTextEditor) diagnosticsManager.updateAllOpenTabs();

	console.log('NianioLang Dev Kit activated');
	statusMessage.dispose();
	vscode.window.showInformationMessage('NianioLang Dev Kit: Ready to use');
}

function deactivate() { }

module.exports = { activate, deactivate };
