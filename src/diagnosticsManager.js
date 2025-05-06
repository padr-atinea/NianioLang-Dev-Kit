const vscode = require('vscode');
const path = require('path');
const diagnostics = vscode.languages.createDiagnosticCollection("nianiolang");
const moduleManager = require('./moduleManager');

function getParameters(text, startIndex, openChars, closeChars, separationChar) {
	let index = startIndex;
	if (!openChars.includes(text[index])) return [];
	index++;
	let depth = 1;
	let parts = [];
	let lastPartStart = index;
	let isString = false;
	let isCommant = false;
	while (index < text.length) {
		const char = text[index];
		if (char == '\n') {
			isString = false;
			isCommant = false;
			index++;
			continue;
		}
		if (isCommant) {
			index++;
			continue;
		}
		if (char == "'") isString = !isString;
		if (isString) { }
		else if (char == '#') isCommant = true;
		else if (openChars.includes(char)) depth++;
		else if (closeChars.includes(char)) {
			depth--;
			if (depth === 0) {
				const content = text.slice(lastPartStart, index);
				if (/[a-zA-Z0-9_{}\]\[\(\)\']/.test(content)) {
					parts.push({ content: content, pos: lastPartStart });
				}
				return parts;
			}
		} else if (char === separationChar && depth === 1) {
			parts.push({ content: text.slice(lastPartStart, index), pos: lastPartStart });
			lastPartStart = index + 1;
		}
		index++;
	}
	return [];
}

function updateAllOpenTabs(document) {
	vscode.window.tabGroups.all.forEach(group => {
		group.tabs.forEach(tab => {
			if (!tab.input || !tab.input.uri) return;
			const fsPath = tab.input.uri.fsPath;
			if (fsPath === document?.uri.fsPath) return;
			const doc = vscode.workspace.textDocuments.find(d => d.fileName === fsPath);
			if (doc) updateDiagnostics(doc);
			else {
				vscode.workspace.openTextDocument(tab.input.uri).then(updateDiagnostics);
			}
		});
	});
}

function updateDiagnostics(document) {
	if (document.languageId !== 'nianiolang' || document.uri.scheme !== 'file') return;
	try {
		const text = document.getText();
		const fileName = document.fileName;
		const thisModuleName = path.basename(fileName, path.extname(fileName));
		const thisModule = moduleManager.getModule(thisModuleName);
		const referencesBack = moduleManager.getReferencesBack(fileName);
		const diagnosticsList = [...thisModule.staticDiagnostics];

		for (const [methodName, method] of [...Object.entries(thisModule.privateMethods), ...Object.entries(thisModule.publicMethods)]) {
			const references = moduleManager.getReferences(method.isPrivate ? methodName : `${thisModuleName}::${methodName}`, fileName);
			if (Object.values(references).flat().length > 0) continue;
			const diag = new vscode.Diagnostic(
				new vscode.Range(document.positionAt(method.startDefPos), document.positionAt(method.endPos)),
				'Unused method',
				method.isPrivate 
					? vscode.DiagnosticSeverity.Warning
					: vscode.DiagnosticSeverity.Hint
			);
			diag.tags = [vscode.DiagnosticTag.Unnecessary];
			diagnosticsList.push(diag);
		}

		for (const [pos, val] of Object.entries(thisModule.positions)) {
			if (val.type != 'fieldDef' || val.usage.length != 0) continue;
			const startPos = document.positionAt(pos);
			const diag = new vscode.Diagnostic(
				new vscode.Range(startPos, startPos.translate(0, val.name.length)),
				'Unused field',
				vscode.DiagnosticSeverity.Hint
			);
			diag.tags = [vscode.DiagnosticTag.Unnecessary];
			diagnosticsList.push(diag);
		}


		for (const [name, positions] of Object.entries(referencesBack)) {
			for (const pos of positions) {
				if (pos > 0 && text[pos - 1] == '@') {
					const [moduleName, methodName] = name.split('::');
					const startPos = document.positionAt(pos + moduleName.length + 2);
					const module = moduleManager.getModule(moduleName);
					if (!module) continue;
					if (methodName in module.publicMethods) { }
					else if (methodName in module.privateMethods) {
						const diag = new vscode.Diagnostic(
							new vscode.Range(startPos, startPos.translate(0, methodName.length)),
							`The '${methodName}' method in module '${moduleName}' is private.`,
							vscode.DiagnosticSeverity.Error
						);
						diag.code = 'privateMethod';
						diagnosticsList.push(diag);
					} else {
						const diag = new vscode.Diagnostic(
							new vscode.Range(startPos, startPos.translate(0, methodName.length)),
							`The '${methodName}' method doesn't exist in '${moduleName}'.`,
							vscode.DiagnosticSeverity.Error
						);
						diag.code = 'nonExistentMethod';
						diagnosticsList.push(diag);
					}
				} else {
					const isPrivate = name.split('::').length == 1;
					const [moduleName, methodName] = isPrivate ? [thisModuleName, name] : name.split('::');
					const module = moduleManager.getModule(moduleName);
					if (!module) continue;
					const startPos = document.positionAt(pos + (isPrivate ? 0 : moduleName.length + 2));
					const parameters = getParameters(text, pos + name.length, ['(', '{', '['], [')', '}', ']'], ',');

					if (methodName in module.publicMethods && !isPrivate) {
						const expectedParams = module.publicMethods[methodName].parameters;
						chechParams(expectedParams, parameters, startPos, methodName, diagnosticsList);
					} else if (methodName in module.privateMethods) {
						if (isPrivate) {
							const expectedParams = module.privateMethods[methodName].parameters;
							chechParams(expectedParams, parameters, startPos, methodName, diagnosticsList);
						} else {
							const diag = new vscode.Diagnostic(
								new vscode.Range(startPos, startPos.translate(0, methodName.length)),
								`The '${methodName}' method in module '${moduleName}' is private.`,
								vscode.DiagnosticSeverity.Error
							);
							diag.code = 'privateMethod';
							diagnosticsList.push(diag);
						}
					} else {
						const diag = new vscode.Diagnostic(
							new vscode.Range(startPos, startPos.translate(0, methodName.length)),
							`The '${methodName}' method doesn't exist in '${moduleName}'.`,
							vscode.DiagnosticSeverity.Error
						);
						diag.code = 'nonExistentMethod';
						diagnosticsList.push(diag);
					}

					function chechParams(expectedParams) {
						if (expectedParams.length !== parameters.length) {
							const diag = new vscode.Diagnostic(
								new vscode.Range(startPos, startPos.translate(0, methodName.length)),
								`Incorrect number of parameters of method ${methodName}: expected ${expectedParams.length}, given ${parameters.length}.`,
								vscode.DiagnosticSeverity.Error
							);
							diag.code = 'wrongParameterCount';
							diagnosticsList.push(diag);
						} else {
							for (const i in expectedParams) {
								const paramPos = document.positionAt(parameters[i].pos);
								const callParam = parameters[i].content;
								if (expectedParams[i].startPosOfRef != null && !isParamRef(callParam)) {
									const diag = new vscode.Diagnostic(
										new vscode.Range(paramPos, paramPos.translate(0, callParam.length)),
										`This parameter is passed as 'ref'.`,
										vscode.DiagnosticSeverity.Error
									);
									diag.code = 'missingRefInParameter';
									diagnosticsList.push(diag);
								} else if (expectedParams[i].startPosOfRef == null && isParamRef(callParam)) {
									const diag = new vscode.Diagnostic(
										new vscode.Range(paramPos, paramPos.translate(0, callParam.length)),
										`This parameter should not be passed as 'ref'.`,
										vscode.DiagnosticSeverity.Error
									);
									diag.code = 'badRefInParameter';
									diagnosticsList.push(diag);
								}
							}
						}
					}
				}
			}
		}

		diagnostics.set(document.uri, diagnosticsList);
	} catch (e) {
		console.log(e, e.stack);
	}

}

function isParamRef(param) {
	const parts = param.trim().replaceAll(/\s+/g, ' ').split(' ');
	return parts.length > 1 && parts[0] == 'ref' && parts[1] != ':';
}

function deleteDocument(document) {
	diagnostics.delete(document.uri);
}

module.exports = { updateDiagnostics, updateAllOpenTabs, deleteDocument };