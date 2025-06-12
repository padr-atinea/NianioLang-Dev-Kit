const vscode = require('vscode');
const path = require('path');
const diagnostics = vscode.languages.createDiagnosticCollection("nianiolang");
const moduleManager = require('./moduleManager');
const ov = require('./nianioLibs/base/ov');

async function updateAllOpenTabs(document) {
	const uriSet = new Set([document?.uri.fsPath, null, undefined]);
	const docs = [];
	const modules = [];
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			const fsPath = tab.input?.uri?.fsPath;
			if (uriSet.has(fsPath)) continue;
			const doc = vscode.workspace.textDocuments.find(d => d.fileName === fsPath)
				?? await vscode.workspace.openTextDocument(tab.input.uri);
			if (doc.languageId !== 'nianiolang' || doc.uri.scheme !== 'file') continue;
			docs.push(doc);
			const fileName = doc.fileName;
			const moduleName = path.basename(fileName, path.extname(fileName));
			modules.push(moduleName);
		}
	}
	moduleManager.checkTypes(modules);
	docs.forEach(d => updateDiagnostics(d, false));
}

function updateDiagnostics(document, checkTypes = true) {
	if (document.languageId !== 'nianiolang' || document.uri.scheme !== 'file') return;
	const fileName = document.fileName;
	const thisModuleName = path.basename(fileName, path.extname(fileName));
	const thisModule = moduleManager.getModule(thisModuleName);
	if (!thisModule) return;
	if (checkTypes) moduleManager.checkTypes([thisModuleName]);
	const diagnosticsList = [...thisModule.staticDiagnostics, ...thisModule.dynamicDiagnostics].map(err => new vscode.Diagnostic(
		new vscode.Range(
			Math.max(0, err.debug.begin.line - 1),
			Math.max(0, err.debug.begin.position - 1),
			Math.max(0, err.debug.end.line - 1),
			Math.max(0, err.debug.end.position - 1)
		),
		err.message,
		ov.is(err.type, 'error') ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
	));
	diagnostics.set(document.uri, diagnosticsList);
}

function deleteDocument(document) {
	// diagnostics.delete(document.uri);
}

module.exports = { updateDiagnostics, updateAllOpenTabs, deleteDocument };