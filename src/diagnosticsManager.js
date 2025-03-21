const vscode = require('vscode');
const path = require('path');
const diagnostics = vscode.languages.createDiagnosticCollection("nianiolang");
const moduleManager = require('./moduleManager');

function parseBraces(text, startIndex, openChars, closeChars, separationChar) {
    let index = startIndex;
    if (!openChars.includes(text[index])) return null;
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
                const content = text.slice(lastPartStart, index)
                if (parts.length > 0 || /[a-zA-Z0-9_{}\]\[\(\)\']/.test(content)) parts.push(content);
                return parts;
            }
        } else if (char === separationChar && depth === 1) {
            parts.push(text.slice(lastPartStart, index));
            lastPartStart = index + 1;
        }
        index++;
    }
    return null;
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
    if (document.languageId !== 'nianiolang') return;
    try {
        const diagnosticsList = [];
        const text = document.getText();
        const importedModules = new Set();
        const importedModulesRegex = /\s*(use\s+([a-zA-Z0-9_]+)\s*;\s*)/g;
        const thisModuleName = path.basename(document.fileName, path.extname(document.fileName));

        let match;
        while ((match = importedModulesRegex.exec(text)) !== null) {
            const importedModule = match[2];
            const fullName = match[1];
            if (importedModules.has(importedModule)) {
                const startPos = document.positionAt(match.index + match[0].length - fullName.length);
                const diag = new vscode.Diagnostic(
                    new vscode.Range(startPos, startPos.translate(0, fullName.length)),
                    `Module '${importedModule}' usage is duplicated`,
                    vscode.DiagnosticSeverity.Warning
                );
                diag.code = 'duplicatedImport';
                diagnosticsList.push(diag);
            }
            else importedModules.add(importedModule);
        }

        const methodRegex = /\b([a-zA-Z0-9_]+)::([a-zA-Z0-9_]+)\(/g;
        while ((match = methodRegex.exec(text)) !== null) {
            const moduleName = match[1];
            const methodName = match[2];
            const startPos = document.positionAt(match.index);
            const fullLineText = document.lineAt(startPos).text;
            if (isPositionInString(fullLineText, startPos.character)) continue;
            const lineTrimmed = fullLineText.substring(0, startPos.character).trim();

            if (lineTrimmed.endsWith('def')) {
                if (thisModuleName !== moduleName) {
                    const diag = new vscode.Diagnostic(
                        new vscode.Range(startPos, startPos.translate(0, moduleName.length)),
                        `Module name '${moduleName}' must equal file name '${thisModuleName}'`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diag.code = 'moduleNameNotEqualFileName';
                    diagnosticsList.push(diag);
                }
                continue;
            }
            if (!importedModules.has(moduleName) && thisModuleName !== moduleName) {
                const diag = new vscode.Diagnostic(
                    new vscode.Range(startPos, startPos.translate(0, moduleName.length)),
                    `Module '${moduleName}' usage on top of file is missing`,
                    vscode.DiagnosticSeverity.Error
                );
                diag.code = 'missingImport';
                diagnosticsList.push(diag);
            }
            const callParenIndex = match.index + match[0].length - 1;
            const parts = parseBraces(text, callParenIndex, ['(', '{', '['], [')', '}', ']'], ',');
            checkMethodUsage(moduleName, methodName, document, match.index, parts.length, diagnosticsList);
        }

        const typeRegex = /\@([a-zA-Z0-9_]+)::([a-zA-Z0-9_]+)/g;
        while ((match = typeRegex.exec(text)) !== null) {
            const moduleName = match[1];
            const methodName = match[2];
            const startPos = document.positionAt(match.index + 1);
            const pos = document.positionAt(match.index + moduleName.length + 3);
            const fullLineText = document.lineAt(startPos).text;
            if (isPositionInString(fullLineText, startPos.character)) continue;

            if (!importedModules.has(moduleName) && thisModuleName !== moduleName) {
                const diag = new vscode.Diagnostic(
                    new vscode.Range(startPos, startPos.translate(0, moduleName.length)),
                    `Module '${moduleName}' usage on top of file is missing`,
                    vscode.DiagnosticSeverity.Error
                );
                diag.code = 'missingImport';
                diagnosticsList.push(diag);
            }

            const module = moduleManager.getModule(moduleName);
            if (!module) continue;
            if (methodName in module.publicMethods) {}
            else if (methodName in module.privateMethods) {
                const diag = new vscode.Diagnostic(
                    new vscode.Range(pos, pos.translate(0, methodName.length)),
                    `The '${methodName}' method in module '${moduleName}' is private.`,
                    vscode.DiagnosticSeverity.Error
                );
                diag.code = 'privateMethod';
                diagnosticsList.push(diag);
            } else {
                const diag = new vscode.Diagnostic(
                    new vscode.Range(pos, pos.translate(0, methodName.length)),
                    `The '${methodName}' method doesn't exist in '${moduleName}'.`,
                    vscode.DiagnosticSeverity.Error
                );
                diag.code = 'nonExistentMethod';
                diagnosticsList.push(diag);
            }
        }


        diagnostics.set(document.uri, diagnosticsList);
    } catch (e) {
        console.log(e);
    }
}

function isPositionInString(lineText, col) {
    let inString = false;
    for (let i = 0; i < col; i++) {
        if (lineText[i] === "#") return true;
        if (lineText[i] === "'") inString = !inString;
    }
    return inString;
}

function checkMethodUsage(moduleName, methodName, document, index, callArgCount, diagnosticsList) {
    const module = moduleManager.getModule(moduleName);
    if (!module) return;
    const pos = document.positionAt(index + moduleName.length + 2);

    if (methodName in module.publicMethods) {
        const expectedCount = module.publicMethods[methodName].parameters.length;
        if (expectedCount !== callArgCount) {
            const diag = new vscode.Diagnostic(
                new vscode.Range(pos, pos.translate(0, methodName.length)),
                `Incorrect number of parameters of method ${methodName}: expected ${expectedCount}, given ${callArgCount}.`,
                vscode.DiagnosticSeverity.Error
            );
            diag.code = 'wrongParameterCount';
            diagnosticsList.push(diag);
        }
    } else if (methodName in module.privateMethods) {
        const diag = new vscode.Diagnostic(
            new vscode.Range(pos, pos.translate(0, methodName.length)),
            `The '${methodName}' method in module '${moduleName}' is private.`,
            vscode.DiagnosticSeverity.Error
        );
        diag.code = 'privateMethod';
        diagnosticsList.push(diag);
    } else {
        const diag = new vscode.Diagnostic(
            new vscode.Range(pos, pos.translate(0, methodName.length)),
            `The '${methodName}' method doesn't exist in '${moduleName}'.`,
            vscode.DiagnosticSeverity.Error
        );
        diag.code = 'nonExistentMethod';
        diagnosticsList.push(diag);
    }
}

function deleteDocument(document) {
    diagnostics.delete(document.uri);
}

module.exports = { updateDiagnostics, updateAllOpenTabs, deleteDocument };