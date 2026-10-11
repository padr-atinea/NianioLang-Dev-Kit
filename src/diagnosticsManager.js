const vscode = require('vscode');
const path = require('path');
const diagnostics = vscode.languages.createDiagnosticCollection("nianiolang");
const moduleManager = require('./moduleManager');
const ov = require('./nianioLibs/base/ov');

const positionToIndex = (line, col) => `${line}|${col}`;
const indexToPosition = (index) => index.split('|').map(part => parseInt(part));
const isNotNl = (document, ext = '.nl') => !document || document.uri.scheme !== 'file' || document.languageId !== 'nianiolang' || path.extname(document.fileName) !== ext;

const toDiagnostic = (err) => new vscode.Diagnostic(
	new vscode.Range(
		Math.max(0, err.debug.begin.line - 1),
		Math.max(0, err.debug.begin.position - 1),
		Math.max(0, err.debug.end.line - 1),
		Math.max(0, err.debug.end.position - 1)
	),
	err.message,
	ov.is(err.type, 'error') ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
);

// Publishes the current (static and last computed type checking) diagnostics of the module.
// Type checking itself is managed by the AnalysisScheduler.
function publishModuleDiagnostics(moduleName) {
	const thisModule = moduleManager.getModule(moduleName);
	if (!thisModule) return;
	const diagnosticsList = [...thisModule.staticDiagnostics, ...thisModule.dynamicDiagnostics].map(toDiagnostic);
	// const diagnosticsList = [];
	// Object.entries(thisModule.varPositions).forEach(([p, val]) => {
	// 	const pos = indexToPosition(p);
	// 	try {
	// 		if (ov.is(val, 'ref')) {
	// 			const ref = ov.as(val, 'ref');
	// 			const defPos = positionToIndex(ref.line, ref.position);
	// 			if (ov.is(thisModule.varPositions[defPos], 'def')) {
	// 				const def = ov.as(thisModule.varPositions[defPos], 'def');
	// 				const ragne = new vscode.Range(pos[0] - 1, pos[1] - 1, pos[0] - 1, pos[1] - 1 + def.name.length);
	// 				diagnosticsList.push(new vscode.Diagnostic(ragne, `ref ${def.name}`, vscode.DiagnosticSeverity.Information));
	// 			} else {
	// 				const ragne = new vscode.Range(pos[0] - 1, pos[1] - 1, pos[0] - 1, pos[1] - 1 + 1);
	// 				diagnosticsList.push(new vscode.Diagnostic(ragne, `ref !!err ${defPos}`, vscode.DiagnosticSeverity.Error));
	// 			}
	// 		} else if (ov.is(val, 'def')) {
	// 			const def = ov.as(val, 'def');
	// 			const ragne = new vscode.Range(def.defPlace.line - 1, def.defPlace.position - 1, def.defPlace.line - 1, def.defPlace.position - 1 + def.name.length);
	// 			diagnosticsList.push(new vscode.Diagnostic(ragne, `def ${def.name}`, vscode.DiagnosticSeverity.Warning));
	// 		} else {
	// 			console.log('error', val);
	// 		}
	// 	} catch (e) {
	// 		const ragne = new vscode.Range(pos[0] - 1, pos[1] - 1, pos[0] - 1, pos[1] - 1 + 1);
	// 		diagnosticsList.push(new vscode.Diagnostic(ragne, `ref !!err`, vscode.DiagnosticSeverity.Error));
	// 		console.error('Error processing variable position:', e);
	// 	}
	// });
	
	diagnostics.set(vscode.Uri.file(thisModule.filePath), diagnosticsList);
}

function updateDiagnostics(document) {
	if (isNotNl(document)) return;
	publishModuleDiagnostics(moduleManager.getModuleName(document.fileName));
}

function deleteDiagnostics(uri) {
	diagnostics.delete(uri);
}

module.exports = { updateDiagnostics, publishModuleDiagnostics, deleteDiagnostics };
