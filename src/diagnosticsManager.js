const vscode = require('vscode');
const path = require('path');
const diagnostics = vscode.languages.createDiagnosticCollection("nianiolang");
const moduleManager = require('./moduleManager');
const ov = require('./nianioLibs/ov');

// function getParameters(text, startIndex, openChars, closeChars, separationChar) {
// 	let index = startIndex;
// 	if (!openChars.includes(text[index])) return [];
// 	index++;
// 	let depth = 1;
// 	let parts = [];
// 	let lastPartStart = index;
// 	let isString = false;
// 	let isCommant = false;
// 	while (index < text.length) {
// 		const char = text[index];
// 		if (char == '\n') {
// 			isString = false;
// 			isCommant = false;
// 			index++;
// 			continue;
// 		}
// 		if (isCommant) {
// 			index++;
// 			continue;
// 		}
// 		if (char == "'") isString = !isString;
// 		if (isString) { }
// 		else if (char == '#') isCommant = true;
// 		else if (openChars.includes(char)) depth++;
// 		else if (closeChars.includes(char)) {
// 			depth--;
// 			if (depth === 0) {
// 				const content = text.slice(lastPartStart, index);
// 				if (/[a-zA-Z0-9_{}\]\[\(\)\']/.test(content) || (parts.length > 0 && /^\s*$/.test(content))) {
// 					parts.push({ content: content, pos: lastPartStart });
// 				}
// 				return parts;
// 			}
// 		} else if (char === separationChar && depth === 1) {
// 			parts.push({ content: text.slice(lastPartStart, index), pos: lastPartStart });
// 			lastPartStart = index + 1;
// 		}
// 		index++;
// 	}
// 	return [];
// }

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

const positionToIndex = (line, col) => `${line}|${col}`;

function updateDiagnostics(document) {
	if (document.languageId !== 'nianiolang' || document.uri.scheme !== 'file') return;
	try {
		// const text = document.getText();
		const fileName = document.fileName;
		const thisModuleName = path.basename(fileName, path.extname(fileName));
		const thisModule = moduleManager.getModule(thisModuleName);
		if (!thisModule) return;
		const referencesBack = moduleManager.getReferencesBack(fileName);
		if (!referencesBack) return;
		const diagnosticsList = [...thisModule.staticDiagnostics];

		// Object.entries(thisModule.varPositions).forEach(([p, val]) => {
		// 	if (ov.is(val, 'ref')) {
		// 		const pos = p.split('|').map(part => parseInt(part));
		// 		const ref = ov.as(val, 'ref');
		// 		const defPos = positionToIndex(ref.line, ref.position);
		// 		const def = ov.as(thisModule.varPositions[defPos], 'def');
		// 		const ragne = new vscode.Range(pos[0] - 1, pos[1] - 1, pos[0] - 1, pos[1] - 1 + def.name.length);
		// 		diagnosticsList.push(new vscode.Diagnostic(ragne, `ref ${def.name}`, vscode.DiagnosticSeverity.Information));
		// 	} else if (ov.is(val, 'def')) {
		// 		const def = ov.as(val, 'def');
		// 		const ragne = new vscode.Range(def.defPlace.line - 1, def.defPlace.position - 1, def.defPlace.line - 1, def.defPlace.position - 1 + def.name.length);
		// 		diagnosticsList.push(new vscode.Diagnostic(ragne, `def ${def.name}`, vscode.DiagnosticSeverity.Warning));
		// 	} else {
		// 		console.log('error', val);
		// 	}
		// });

		// for (const [methodName, method] of Object.entries(thisModule.methods)) {
		// 	const references = moduleManager.getReferences(methodName, fileName);
		// 	if (Object.values(references).flat().length > 0) continue;
		// 	const diag = new vscode.Diagnostic(method.rawRange, 'Unused method',
		// 		ov.is(method.acces, 'priv')
		// 			? vscode.DiagnosticSeverity.Warning
		// 			: vscode.DiagnosticSeverity.Hint
		// 	);
		// 	diag.tags = [vscode.DiagnosticTag.Unnecessary];
		// 	diagnosticsList.push(diag);
		// }

		// for (const [pos, val] of Object.entries(thisModule.positions)) {
		// 	if (val.type != 'fieldDef' || val.usage.length != 0) continue;
		// 	const startPos = document.positionAt(pos);
		// 	const diag = new vscode.Diagnostic(
		// 		new vscode.Range(startPos, startPos.translate(0, val.name.length)),
		// 		'Unused field',
		// 		vscode.DiagnosticSeverity.Hint
		// 	);
		// 	diag.tags = [vscode.DiagnosticTag.Unnecessary];
		// 	diagnosticsList.push(diag);
		// }


		// for (const [name, positions] of Object.entries(referencesBack)) {
		// 	for (const pos of positions) {
		// 		if (pos > 0 && text[pos - 1] == '@') {
		// 			const [moduleName, methodName] = name.split('::');
		// 			const startPos = document.positionAt(pos + moduleName.length + 2);
		// 			const module = moduleManager.getModule(moduleName);
		// 			if (!module) continue;
		// 			if (Object.keys(module.publicMethods).includes(methodName)) { }
		// 			else if (Object.keys(module.privateMethods).includes(methodName)) {
		// 				const diag = new vscode.Diagnostic(
		// 					new vscode.Range(startPos, startPos.translate(0, methodName.length)),
		// 					`The '${methodName}' method in module '${moduleName}' is private.`,
		// 					vscode.DiagnosticSeverity.Error
		// 				);
		// 				diag.code = 'privateMethod';
		// 				diagnosticsList.push(diag);
		// 			} else {
		// 				const diag = new vscode.Diagnostic(
		// 					new vscode.Range(startPos, startPos.translate(0, methodName.length)),
		// 					`The '${methodName}' method doesn't exist in '${moduleName}'.`,
		// 					vscode.DiagnosticSeverity.Error
		// 				);
		// 				diag.code = 'nonExistentMethod';
		// 				diagnosticsList.push(diag);
		// 			}
		// 		} else {
		// 			const isPrivate = name.split('::').length == 1;
		// 			const [moduleName, methodName] = isPrivate ? [thisModuleName, name] : name.split('::');
		// 			const module = moduleManager.getModule(moduleName);
		// 			if (!module) continue;
		// 			const startPos = document.positionAt(pos + (isPrivate ? 0 : moduleName.length + 2));
		// 			const parameters = getParameters(text, pos + name.length, ['(', '{', '['], [')', '}', ']'], ',');

		// 			if (Object.keys(module.publicMethods).includes(methodName) && !isPrivate) {
		// 				const expectedParams = module.publicMethods[methodName].parameters;
		// 				chechParams(expectedParams, parameters, startPos, methodName, diagnosticsList);
		// 			} else if (Object.keys(module.privateMethods).includes(methodName)) {
		// 				if (isPrivate) {
		// 					const expectedParams = module.privateMethods[methodName].parameters;
		// 					chechParams(expectedParams, parameters, startPos, methodName, diagnosticsList);
		// 				} else {
		// 					const diag = new vscode.Diagnostic(
		// 						new vscode.Range(startPos, startPos.translate(0, methodName.length)),
		// 						`The '${methodName}' method in module '${moduleName}' is private.`,
		// 						vscode.DiagnosticSeverity.Error
		// 					);
		// 					diag.code = 'privateMethod';
		// 					diagnosticsList.push(diag);
		// 				}
		// 			} else {
		// 				const diag = new vscode.Diagnostic(
		// 					new vscode.Range(startPos, startPos.translate(0, methodName.length)),
		// 					`The '${methodName}' method doesn't exist in '${moduleName}'.`,
		// 					vscode.DiagnosticSeverity.Error
		// 				);
		// 				diag.code = 'nonExistentMethod';
		// 				diagnosticsList.push(diag);
		// 			}

		// 			function chechParams(expectedParams) {
		// 				if (expectedParams.length !== parameters.length || 
		// 					(expectedParams.length > 0 && /^\s*$/.test(parameters.at(-1)) && expectedParams.length !== parameters.length - 1)) {
		// 					const diag = new vscode.Diagnostic(
		// 						new vscode.Range(startPos, startPos.translate(0, methodName.length)),
		// 						`Incorrect number of parameters of method ${methodName}: expected ${expectedParams.length}, given ${parameters.length}.`,
		// 						vscode.DiagnosticSeverity.Error
		// 					);
		// 					diag.code = 'wrongParameterCount';
		// 					diagnosticsList.push(diag);
		// 				} else {
		// 					for (let i = 0; i < expectedParams.length; i++) {
		// 						const paramPos = document.positionAt(parameters[i].pos);
		// 						const callParam = parameters[i].content;
		// 						if (/^\s*$/.test(callParam)) {
		// 							const diag = new vscode.Diagnostic(
		// 								new vscode.Range(paramPos, paramPos),
		// 								`Parameter should not be empty`,
		// 								vscode.DiagnosticSeverity.Error
		// 							);
		// 							diag.code = 'emptyParameter';
		// 							diagnosticsList.push(diag);
		// 						} else if (expectedParams[i].startPosOfRef != null && !isParamRef(callParam)) {
		// 							const diag = new vscode.Diagnostic(
		// 								new vscode.Range(paramPos, paramPos.translate(0, callParam.length)),
		// 								`This parameter is passed as 'ref'.`,
		// 								vscode.DiagnosticSeverity.Error
		// 							);
		// 							// diag.code = 'missingRefInParameter';
		// 							diagnosticsList.push(diag);
		// 						} else if (expectedParams[i].startPosOfRef == null && isParamRef(callParam)) {
		// 							const diag = new vscode.Diagnostic(
		// 								new vscode.Range(paramPos, paramPos.translate(0, callParam.length)),
		// 								`This parameter should not be passed as 'ref'.`,
		// 								vscode.DiagnosticSeverity.Error
		// 							);
		// 							// diag.code = 'badRefInParameter';
		// 							diagnosticsList.push(diag);
		// 						}
		// 					}
		// 				}
		// 			}
		// 		}
		// 	}
		// }

		diagnostics.set(document.uri, diagnosticsList);
	} catch (e) {
		console.log(e, e.stack);
	}
}

// function isParamRef(param) {
// 	const parts = param.trim().replaceAll(/\s+/g, ' ').split(' ');
// 	return parts.length > 1 && parts[0] == 'ref' && parts[1] != ':';
// }

function deleteDocument(document) {
	diagnostics.delete(document.uri);
}

module.exports = { updateDiagnostics, updateAllOpenTabs, deleteDocument };