const vscode = require('vscode');
const path = require('path');
const moduleManager = require('./moduleManager');
const diagnosticsManager = require('./diagnosticsManager');

function getMethod(fullName, fileName) {
    const thisModuleName = path.basename(fileName, path.extname(fileName));
    const isPublic = fullName.includes("::");
    const [moduleName, methodName] = isPublic ? fullName.split("::") : [thisModuleName, fullName];
    const module = moduleManager.getModule(moduleName);
    if (!module) return;
    const method = isPublic
        ? module.publicMethods[methodName] ?? module.privateMethods[methodName]
        : module.privateMethods[methodName] ?? module.publicMethods[methodName];
    if (!method) return;
    return { module, method, moduleName, methodName };
}

function getMethodAtPosition(document, position) {
    const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/);
    if (!range) return;
    const obj = getMethod(document.getText(range), document.fileName);
    if (!obj) return;
    return { range, ...obj };
}

async function provideDefinition(document, position) {
    const obj = getMethodAtPosition(document, position); if
    (!obj) return;
    const { method, module } = obj;
    const targetDoc = await vscode.workspace.openTextDocument(module.filePath);
    return new vscode.Location(targetDoc.uri, targetDoc.positionAt(method.startingOffset));
}

function complitionItems(document, moduleName, isPublic) {
    const module = moduleManager.getModule(moduleName);
    const methods = isPublic ? module.publicMethods : module.privateMethods;
    return Object.entries(methods).map(([methodName, method]) => {
        const item = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Function);
        const shortDef = method.returnType.length > 0 ?
            `def ${moduleName}::${methodName}(${method.parameters}) : ${method.returnType}` :
            `def ${moduleName}::${methodName}(${method.parameters})`;
        const fullDef = `${shortDef} ${method.body}`;
        item.detail = shortDef;
        item.insertText = new vscode.SnippetString(method.parameters.length > 0 ? `${methodName}($0)` : `${methodName}()`);
        item.command = { command: 'nianiolang.addImportAndTriggerSignatureHelp', title: 'Add Import and Show Signature Help', arguments: [moduleName, document.uri] };
        const md = new vscode.MarkdownString();
        md.appendCodeblock(fullDef, 'nianiolang');
        item.documentation = md;
        return item;
    });
}

function provideCompletionItems(document, position, token, context) {
    const line = document.lineAt(position);
    const text = line.text.substring(0, position.character);
    const publicMatch = text.match(/([a-zA-Z0-9_]+)::([a-zA-Z0-9_]*)$/);
    if (!publicMatch) {
        const privateMatch = text.match(/([a-zA-Z0-9_]+)$/);
        if (!privateMatch) return [];
        const moduleName = path.basename(document.fileName, path.extname(document.fileName));
        return complitionItems(document, moduleName, false);
    }
    return complitionItems(document, publicMatch[1], true);
}

function provideSignatureHelp(document, position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    let openParenIndex;
    let pos = offset-1;
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
            if (text[char] == ')'){
                depth--;
            }
            if (text[char] == ',' && depth == 0) paramIndex++;
        }
    }
    
    const prefix = text.slice(0, openParenIndex);
    const fullName = prefix.match(/([a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?)\s*$/);
    if (!fullName) return null;
    const parameters = getMethod(fullName[1], document.fileName)?.method.parameters;
    if (!parameters) return;

    const label = `${fullName[1]}(${parameters})`;
    const sigHelp = new vscode.SignatureHelp();
    const sigInfo = new vscode.SignatureInformation(label);
    sigInfo.parameters = parameters.map(p => new vscode.ParameterInformation(p.trim()));
    sigHelp.signatures = [sigInfo];
    sigHelp.activeSignature = 0;
    sigHelp.activeParameter = paramIndex < parameters.length ? paramIndex : parameters.length - 1;
    return sigHelp;
}

function addImportAndTriggerSignatureHelp(moduleName, uri) {
    addImport(moduleName, uri);
    vscode.commands.executeCommand('editor.action.triggerParameterHints');
}

function moduleNameNotEqualFileName(document, range) {
    document, range;
}

class NianioLangCodeActionProvider {
    provideCodeActions(document, range, context, token) {
        const actions = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code === 'missingImport') {
                const moduleName = document.getText(new vscode.Range(diagnostic.range.start, diagnostic.range.end));
                const action = new vscode.CodeAction(`Add 'use ${moduleName};'`, vscode.CodeActionKind.QuickFix);
                const edit = new vscode.WorkspaceEdit();
                let insertPosition = new vscode.Position(0, 0);
                for (let i = 0; i < document.lineCount; i++) {
                    if (document.lineAt(i).text.trim().startsWith('use ')) {
                        insertPosition = new vscode.Position(i, 0);
                    }
                }
                insertPosition = new vscode.Position(insertPosition.line + 1, 0);
                edit.insert(document.uri, insertPosition, `use ${moduleName};\n`);
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

            } else if (diagnostic.code === 'duplicatedImport') {
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

                const fileAction = new vscode.CodeAction("Remove all unnecessary usings in this file", vscode.CodeActionKind.QuickFix);
                fileAction.command = {
                    command: "extension.removeAllUsingsInFile",
                    title: "Remove all unnecessary usings in this file",
                    arguments: [document.uri]
                };
                actions.push(fileAction);
            } else if (diagnostic.code === 'moduleNameNotEqualFileName') {
                // Module name '${moduleName}' must equal file name '${thisModuleName}'
                const methodNameMatch = diagnostic.message.match(/Module name '([a-zA-Z0-9_]+)' must equal /);
                const moduleNameMatch = diagnostic.message.match(/file name '([a-zA-Z0-9_]+)'/);
                if (moduleNameMatch && methodNameMatch) {
                    const range = new vscode.Range(diagnostic.range.start, diagnostic.range.end);
                    const fileName = moduleNameMatch[1];
                    const action = new vscode.CodeAction(`Fix module name`, vscode.CodeActionKind.QuickFix);
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(document.uri, range, fileName);
                    action.edit = edit;
                    action.diagnostics = [diagnostic];
                    actions.push(action);

                    const fileAction = new vscode.CodeAction("Fix all incorret names", vscode.CodeActionKind.QuickFix);
                    fileAction.command = {
                        command: "extension.fixAllIncorretNames",
                        title: "Fix all incorret names",
                        arguments: [document.uri, fileName]
                    };
                    actions.push(fileAction);
                }
            } 
        }
        return actions;
    }
}

function addImport(moduleName, uri) {
    vscode.workspace.openTextDocument(uri).then((document) => {
        if (moduleName === path.basename(document.fileName, path.extname(document.fileName))) return;
        const edit = new vscode.WorkspaceEdit();
        let insertPosition = new vscode.Position(0, 0);
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text.trim();
            if (line.startsWith(`use ${moduleName};`)) return;
            if (line.startsWith('use ')) {
                insertPosition = new vscode.Position(i, 0);
            }
        }
        insertPosition = new vscode.Position(insertPosition.line + 1, 0);
        edit.insert(document.uri, insertPosition, `use ${moduleName};\n`);
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
    const obj = getMethodAtPosition(document, position); if (!obj) return;
    const { method, methodName, moduleName, range } = obj;

    const def = `def ${moduleName}::${methodName}(${method.parameters}) ${method.returnType.length > 0 ? `: ${method.returnType}` : ``}`;
    // const shortDef = `${def} { ... }`;
    const fullDef = `${def} ${method.body}`;

    const md = new vscode.MarkdownString();
    md.appendCodeblock(fullDef, 'nianiolang');
    return new vscode.Hover(md, range);
}

async function getReferences(document, position, applyToMatch) {
    const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)?/);
    if (!range) return;
    const symbol = document.getText(range);
    const references = moduleManager.getReferences(symbol, document.uri.fsPath);

    for (const [file, positions] of Object.entries(references)) {
        const doc = await vscode.workspace.openTextDocument(file);
        for (const pos of positions) {
            applyToMatch(doc, doc.positionAt(pos));
        }
    }
}

// async function provideRenameEdits(document, position, newName) {
//     const edit = new vscode.WorkspaceEdit();
//     const offset = document.offsetAt(position);
//     if (!/[a-zA-Z0-9_]/.test(newName)) return;
//     await getReferences(document, position, (doc, match) => {
//         const startPos = doc.positionAt(match.index);
//         const oldName = match[1];
//         if (oldName.includes('::')) {
//             // if 
//         }
//         const endPos = doc.positionAt(match.index + match[1].length);
//         edit.replace(doc.uri, new vscode.Range(startPos, endPos), newName);
//     });
//     return edit;
// }

async function provideReferences(document, position) {
    const locations = [];
    await getReferences(document, position, (doc, pos) => locations.push(new vscode.Location(doc.uri, pos)));
    return locations;
}

async function removeAllUsingsInFile(uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const edit = new vscode.WorkspaceEdit();
    for (const diagnostic of diagnostics) {
        if (diagnostic.code === 'duplicatedImport') continue;
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

async function fixAllIncorretNames(uri, fileName) {
    const document = await vscode.workspace.openTextDocument(uri);
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const edit = new vscode.WorkspaceEdit();
    for (const diagnostic of diagnostics) {
        if (diagnostic.code !== 'moduleNameNotEqualFileName') continue;
        const range = new vscode.Range(diagnostic.range.start, diagnostic.range.end);
        edit.replace(document.uri, range, fileName);
    }
    await vscode.workspace.applyEdit(edit);
}

async function fixAllIncorretNamesWhenRename(file) {
    const newUri = file.newUri;
    const fileName = path.basename(newUri.fsPath, path.extname(newUri.fsPath));
    const answer = await vscode.window.showWarningMessage(
        `Czy wykonać akcję naprawy nazw modułów w tym pliku?`,
        { modal: true }, 'Tak', 'Nie'
    );
    if (answer == 'Tak') fixAllIncorretNames(newUri, fileName);
}

class ReferenceCounterCodeLensProvider {
    async provideCodeLenses(document, token) {
        const filePath = document.uri.fsPath;
        const moduleName = path.basename(filePath, path.extname(filePath));
        const module = moduleManager.getModule(moduleName);
        if (!module) return [];
        const lenses = [];
        for (const [methodName, method] of Object.entries(module.privateMethods)) {
            const references = moduleManager.getReferences(methodName, filePath);
            const length = Object.values(references).flat().length;
            const pos = document.positionAt(method.startingOffset);
            const range = new vscode.Range(pos, pos);
            lenses.push(new vscode.CodeLens(range, {
                title: `${length} reference${length === 1 ? '' : 's'}`,
                command: 'extension.showReferences',
                arguments: [document, pos, references]
            }));
        }

        for (const [methodName, method] of Object.entries(module.publicMethods)) {
            const references = moduleManager.getReferences(`${moduleName}::${methodName}`);
            const length = Object.values(references).flat().length;
            const pos = document.positionAt(method.startingOffset);
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

async function activate(context) {
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
                moduleManager.updateModule(document.uri.fsPath, document.getText());
                progress.report({ increment: i / files.length * 0.6, message: `${i} / ${files.length} (${Math.round(10000 * i / files.length) / 100}%)` });
            } catch (e) {
                console.error(e);
            }
        }
        console.log('loadAllModules complited');

        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.nl', '**/node_modules/**');
        fileWatcher.onDidCreate(uri => vscode.workspace.openTextDocument(uri).then(document => moduleManager.updateModule(document.uri.fsPath, document.getText())));
        fileWatcher.onDidChange(uri => vscode.workspace.openTextDocument(uri).then(document => moduleManager.updateModule(document.uri.fsPath, document.getText())));
        fileWatcher.onDidDelete(uri => moduleManager.removeModule(uri.fsPath));
        context.subscriptions.push(fileWatcher);
    });

    // await loadAllModules(context);

    const selector = { scheme: 'file', language: 'nianiolang' };
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, { provideDefinition }));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, { provideCompletionItems }, ':'));
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(selector, { provideSignatureHelp }, '(', ','));
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, new NianioLangCodeActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
    context.subscriptions.push(vscode.languages.registerHoverProvider(selector, { provideHover }));
    // context.subscriptions.push(vscode.languages.registerRenameProvider(selector, { provideRenameEdits, prepareRename }));
    context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, { provideReferences }));
    context.subscriptions.push(vscode.commands.registerCommand('activate.addImport', addImport));
    context.subscriptions.push(vscode.commands.registerCommand('nianiolang.makeMethodPublic', makeMethodPublic));
    context.subscriptions.push(vscode.commands.registerCommand('nianiolang.addImportAndTriggerSignatureHelp', addImportAndTriggerSignatureHelp));
    context.subscriptions.push(vscode.commands.registerCommand('nianiolang.moduleNameNotEqualFileName', moduleNameNotEqualFileName));
    context.subscriptions.push(vscode.commands.registerCommand('extension.removeAllUsingsInFile', removeAllUsingsInFile));
    context.subscriptions.push(vscode.commands.registerCommand('extension.fixAllIncorretNames', fixAllIncorretNames));
    context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => event.files.forEach(fixAllIncorretNamesWhenRename)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => diagnosticsManager.updateDiagnostics(event.document)));
    // context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(diagnosticsManager.updateDiagnostics));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(diagnosticsManager.deleteDocument));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(diagnosticsManager.updateAllOpenTabs));
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
        editors.forEach(editor => diagnosticsManager.updateDiagnostics(editor.document));
    }));

    context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, new ReferenceCounterCodeLensProvider()));
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
