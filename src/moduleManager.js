const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

const moduleCache = {};
const referenceCache = {};
const referenceBackCache = {};
let ig = ignore();

function updateIgnore() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return;
    const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    ig = ignore();
    const gitignorePath = path.join(workspaceFolderPath, '.gitignore');
    const vscodeignorePath = path.join(workspaceFolderPath, '.vscodeignore');
    if (fs.existsSync(gitignorePath)) ig.add(fs.readFileSync(gitignorePath, 'utf8'));
    if (fs.existsSync(vscodeignorePath)) ig.add(fs.readFileSync(vscodeignorePath, 'utf8'));
}

function checkFileIgnore(filePath) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return true;
    const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    updateIgnore();
    return ig.ignores(path.relative(workspaceFolderPath, filePath));
}

function updateModule(filePath, text, checkIgnore = false) {
    if (checkIgnore && checkFileIgnore(filePath)) return;
    const thisModuleName = path.basename(filePath, path.extname(filePath));
    const privateMethods = {};
    const publicMethods = {};
    let pos = 0;
    let lineNumber = 1;
    const [openBrackets, closeBrackets] = [['(', '{', '['], [')', '}', ']']];

    if (filePath in referenceBackCache) {
        for (const method of Object.keys(referenceBackCache[filePath])) {
            if (method in referenceCache && filePath in referenceCache[method]) {
                delete referenceCache[method][filePath];
            }
        }
    }
    referenceBackCache[filePath] = {};

    const skipWhiteChars = () => {
        while (/\s/.test(text[pos])) { if (text[pos] === '\n') lineNumber++; pos++; }
    }

    const tryAddReference = (startPos) => {
        if (!/[a-zA-Z0-9_]/.test(text[pos])) return false;
        if (startPos == undefined) {
            startPos = pos;
            pos++;
            while (/[a-zA-Z0-9_]/.test(text[pos])) pos++;
        }
        
        if (text[pos] == ':' && text[pos + 1] == ':') {
            pos++; pos++;
            if (!/[a-zA-Z0-9_]/.test(text[pos])) return true;
            while (/[a-zA-Z0-9_]/.test(text[pos])) pos++;
            addReference(text.slice(startPos, pos), startPos);
            return true;
        }
        const endPos = pos;
        if (text[startPos - 1] !== '@') {
            skipWhiteChars();
            if (text[pos] != '(') return true;
        }
        addReference(text.slice(startPos, endPos), startPos);
        return true;
    }

    const addReference = (methodName, startPos) => {
        if (!(methodName in referenceCache)) referenceCache[methodName] = {};
        if (!(filePath in referenceCache[methodName])) referenceCache[methodName][filePath] = [];
        referenceCache[methodName][filePath].push(startPos);

        referenceBackCache[filePath][methodName] = true;
    }

    const getParamiters = () => {
        pos++;
        let depth = 1;
        let parameters = [];
        let lastPartStart = pos;
        whileRun(c => {
            if (openBrackets.includes(c)) depth++;
            else if (closeBrackets.includes(c)) {
                depth--;
                if (depth === 0) {
                    const content = text.slice(lastPartStart, pos)
                    if (parameters.length > 0 || /[a-zA-Z0-9_{}\]\[\(\)\']/.test(content)) parameters.push(content);
                    pos++;
                    return true;
                } else if (depth < 0) {
                    console.error('bad paramiters depth < 0', filePath, pos);
                    return true;
                }
            } else if (c === ',' && depth === 1) {
                parameters.push(text.slice(lastPartStart, pos));
                lastPartStart = pos + 1;
            } else if (tryAddReference()) return;
            pos++;
        });
        if (depth != 0) {
            console.error('bad paramiters depth != 0', filePath, pos);
        }
        return parameters;
    }

    const getReturnType = () => {
        if (pos >= text.length || text[pos] != ':') return '';
        pos++;
        if (pos >= text.length || !/\s/.test(text[pos])) return '';
        skipWhiteChars();
        if (!/[@a-zA-Z0-9_]/.test(text[pos])) return '';
        let depth = 0;
        const startingTypeOffset = pos;
        whileRun(c => {
            if (openBrackets.includes(c)) {
                if (depth == 0 && c == '{') return true;
                depth++;
            }
            else if (closeBrackets.includes(c)) depth--;
            else if (tryAddReference()) return;
            pos++;
        });
        if (depth != 0) {
            console.error('bad returnType depth != 0', filePath, pos);
        }
        return text.slice(startingTypeOffset, pos);
    }

    const getBody = () => {
        if (pos >= text.length || text[pos] != '{') {
            console.error('bad body', filePath, pos, text[pos], text.slice(pos - 5, pos + 5));
            return '!!! bad syntax - no body !!!';
        }
        let depth = 0;
        const startingBodyOffset = pos;
        whileRun(c => {
            if (openBrackets.includes(c)) depth++;
            else if (closeBrackets.includes(c)) {
                if (depth == 1) { pos++; return true; }
                depth--;
            } else if (tryAddReference()) return;
            pos++;
        });
        if (depth != 1) {
            console.error('bad body depth != 0', filePath, pos, text[pos], text.slice(pos - 5, pos + 5));
        }
        return text.slice(startingBodyOffset, pos);
    }

    const whileRun = (run) => {
        let isString = false;
        let isCommant = false;
        while (pos < text.length) {
            if (text[pos] === '\n') { isString = false; isCommant = false; pos++; lineNumber++; continue; }
            if (isCommant) { pos++; continue; }
            if (text[pos] === "'") isString = !isString;
            if (isString) { pos++; continue; }
            if (text[pos] === "#") { isCommant = true; pos++; continue; }

            const ret = run(text[pos]);
            if (ret) return ret;
        }
    }

    const getModule = () => {
        const startingOffset = pos;
        while (/[a-zA-Z0-9_]/.test(text[pos])) pos++;
        let moduleName = thisModuleName;
        let methodName = text.slice(startingOffset, pos);
        let isPrivate = true;
        if (text[pos] == ':') {
            isPrivate = false;
            moduleName = methodName;
            pos++;
            if (pos >= text.length || text[pos] != ':') return;
            pos++;
            if (!/[a-zA-Z0-9_]/.test(text[pos])) return;
            const methodStartPos = pos;
            while (/[a-zA-Z0-9_]/.test(text[pos])) pos++;
            methodName = text.slice(methodStartPos, pos);
        }
        skipWhiteChars();
        if (pos >= text.length || text[pos] != '(') return;
        const parameters = getParamiters();

        skipWhiteChars();
        const returnType = getReturnType();

        skipWhiteChars();
        const body = getBody();

        return { moduleName, methodName, parameters, startingOffset, isPrivate, returnType, body };
    }

    whileRun(() => {
        if (/[a-zA-Z0-9_]/.test(text[pos])) {
            const startPos = pos;
            pos++;
            while (/[a-zA-Z0-9_]/.test(text[pos])) pos++;
            const word = text.slice(startPos, pos);
            if (word == 'def') {
                skipWhiteChars();
                if (!/[a-zA-Z0-9_]/.test(text[pos])) return;
                const moduleDef = getModule();
                if (!moduleDef || moduleDef.moduleName != thisModuleName) return; // error
                if (moduleDef.isPrivate) {
                    delete moduleDef.isPrivate;
                    privateMethods[moduleDef.methodName] = moduleDef;
                } else {
                    delete moduleDef.isPrivate;
                    publicMethods[moduleDef.methodName] = moduleDef;
                }
            } else if (tryAddReference(startPos)) return; 
        }

        pos++;
    });

    moduleCache[thisModuleName] = { filePath, privateMethods, publicMethods }
}

function removeModule(filePath, checkIgnore = false) {
    if (checkIgnore && checkFileIgnore(filePath)) return;
    const segments = filePath.split('/');
    const fileName = segments[segments.length - 1];
    const moduleName = fileName.split('.')[0];
    delete moduleCache[moduleName];

    if (filePath in referenceBackCache) {
        for (const method of Object.keys(referenceBackCache[filePath])) {
            if (method in referenceCache && filePath in referenceCache[method]) {
                delete referenceCache[method][filePath];
            }
        }
    }
    delete referenceBackCache[filePath];
}

async function findFiles(filePath = '**/*.nl') {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) return [];
    const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    updateIgnore();
    return (await vscode.workspace.findFiles(filePath, '**/node_modules/**')).filter(uri => !ig.ignores(path.relative(workspaceFolderPath, uri.fsPath)));
}

function getModule(moduleName) {
    if (!moduleName) return null;
    return moduleCache[moduleName];
}

function getReferences(functionName, filePath) {
    if (functionName.includes("::")) {
        return referenceCache[functionName] ?? {};
    }
    return { [filePath]: (referenceCache[functionName] ?? {})[filePath] ?? [] };
}


module.exports = { updateModule, removeModule, getModule, moduleCache, findFiles, getReferences, updateIgnore };
