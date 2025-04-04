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

const showDebugInfo = false;

function updateModule(document, checkIgnore = false) {
	const filePath = document.uri.fsPath;
	const text = document.getText();
	if (checkIgnore && checkFileIgnore(filePath)) return;
	const thisModuleName = path.basename(filePath, path.extname(filePath));
	const privateMethods = {};
	const publicMethods = {};
	const usedModules = {};
	const positions = {};
	let lastUseStatementPos = 0;
	const staticDiagnostics = [];
	let pos = 0;
	let lineNumber = 1;

	const getPathLine = () => `${filePath}:${lineNumber} ${pos} '${text[pos]}'`;

	const getDiag = (startPos, endPos, message, messageCode = 'badSyntax', severity = vscode.DiagnosticSeverity.Error, tags = []) => {
		const diag = new vscode.Diagnostic(new vscode.Range(document.positionAt(startPos), document.positionAt(endPos)), message, severity);
		diag.code = messageCode;
		diag.tags = tags;
		return diag;
	}

	const pushDiag = (startPos, endPos, message, messageCode = 'badSyntax', severity = vscode.DiagnosticSeverity.Error, tags = []) => 
		staticDiagnostics.push(getDiag(startPos, endPos, message, messageCode, severity, tags));

	if (filePath in referenceBackCache) {
		for (const method of Object.keys(referenceBackCache[filePath])) {
			if (method in referenceCache && filePath in referenceCache[method]) {
				delete referenceCache[method][filePath];
			}
		}
	}
	referenceBackCache[filePath] = {};

	const getWord = (startPos, errMsg = 'Expected a word') => {
		if (!/[a-zA-Z0-9_]/.test(text[pos])) pushDiag(startPos, pos, errMsg);
		while (pos < text.length && /[a-zA-Z0-9_]/.test(text[pos])) pos++;
		return text.slice(startPos, pos);
	}

	const chechKeywordVar = () => {
		skipWhiteChars();
		const startvarWordPos = pos;
		return getWord(startvarWordPos, 'Expected keyword var') == 'var';
	}

	const nextRealCharPos = (currentPos) => {
		let newPos = currentPos;
		if (newPos >= text.length) return null;
		let isCommant = false;
		while (/\s|#/.test(text[newPos]) || isCommant) {
			if (text[newPos] === '#') isCommant = true;
			if (text[newPos] === '\n') isCommant = false;
			newPos++;
			if (newPos >= text.length) return null;
		}
		return newPos;
	}

	const skipWhiteChars = () => {
		let isCommant = false;
		while (/\s|#/.test(text[pos]) || isCommant) {
			if (text[pos] === '#') isCommant = true;
			if (text[pos] === '\n') {
				isCommant = false;
				lineNumber++;
			}
			pos++;
		}
	}

	const referenceUtils = {
		tryAdd: (startPos) => {
			if (startPos == undefined) {
				startPos = pos;
				getWord(startPos, 'Expected function or module name');
			} else if (!/[a-zA-Z0-9_]/.test(text[startPos])) return false;

			if (text[pos] == ':' && text[pos + 1] == ':') {
				pos++; pos++;
				if (!/[a-zA-Z0-9_]/.test(text[pos])) return true;
				referenceUtils.add(getWord(startPos, 'Expected function name'), startPos);
				return true;
			}
			const endPos = pos;
			if (text[startPos - 1] !== '@') {
				skipWhiteChars();
				if (text[pos] != '(') return true;
			}
			referenceUtils.add(text.slice(startPos, endPos), startPos);
			return true;
		},
		add: (methodName, startPos) => {
			if (!(methodName in referenceCache)) referenceCache[methodName] = {};
			if (!(filePath in referenceCache[methodName])) referenceCache[methodName][filePath] = [];
			referenceCache[methodName][filePath].push(startPos);

			const parts = methodName.split('::');
			if (parts.length == 2) {
				const moduleName = parts[0];
				if (moduleName in usedModules) {
					usedModules[moduleName].count++;
				} else if (moduleName != thisModuleName) {
					pushDiag(startPos, startPos + moduleName.length,
						`Module '${moduleName}' usage on top of file is missing`,
						'missingImport',
					);
				}
			}
			if (!(methodName in referenceBackCache[filePath])) referenceBackCache[filePath][methodName] = [];
			referenceBackCache[filePath][methodName].push(startPos);
		},
	}

	const getParamiters = () => {
		pos++;
		let depth = 1;
		const parameters = [];
		let currentParam = { fieldName: null, startPos: null, type: null, startPosOfRef: null };
		let startOfType = null;
		const history = [{ depth, pos, in: true }];
		whileRun(c => {
			if (/\(|\{|\[/.test(c)) { depth++; pos++; history.push({ depth, pos, in: true }); }
			else if (/\)|\}|\]/.test(c)) {
				depth--;
				history.push({ depth, pos, out: true });
				if (depth === 0) {
					if (currentParam.fieldName !== null) {
						if (startOfType !== null) currentParam.type = text.slice(startOfType, pos);
						parameters.push(currentParam);
					}
					pos++;
					return true;
				}
				pos++;
				if (depth < 0) return true;
			} else if (depth === 1) {
				if (c === ',') {
					if (currentParam.fieldName === null) {
						pushDiag(pos, pos, `Bad syntax - expected paramiter name`);
						pos++;
						return;
					}
					if (startOfType !== null) currentParam.type = text.slice(startOfType, pos);
					parameters.push(currentParam);
					currentParam = { fieldName: null, startPos: null, type: null, startPosOfRef: null };
					startOfType = null;
					pos++;
				} else if (c === ':') {
					if (currentParam.fieldName === null) {
						pushDiag(pos, pos, `Bad syntax - expected param name`);
						return;
					}
					pos++;
					skipWhiteChars();
					startOfType ??= pos;
				} else if (/[a-zA-Z0-9_]/.test(c)) {
					if (currentParam.startPos === null) {
						const startPos = pos;
						const word = getWord(pos);
						skipWhiteChars();
						if (/:/.test(text[pos])) {
							currentParam.startPos = startPos;
							currentParam.fieldName = word;
						} else if (/\)|,/.test(text[pos])) {
							currentParam.startPos = startPos;
							currentParam.fieldName = word;
						} else if (currentParam.startPosOfRef === null && word == 'ref' && /[a-zA-Z0-9_]/.test(text[pos])) {
							currentParam.startPosOfRef = startPos;
						} else {
							pushDiag(pos, pos, `Bad syntax`);
							pos++;
						}
					} else if (referenceUtils.tryAdd()) return;
					else {
						pushDiag(pos, pos, `Bad syntax`);
						pos++;
					}
				} else pos++;
			} else if (/[a-zA-Z0-9_]/.test(c) && referenceUtils.tryAdd()) return;
			else pos++;
		});
		if (depth != 0) {
			pushDiag(pos, pos, `Bad syntax - expected closig ')' of paramiters`);
			console.error('bad paramiters depth != 0', getPathLine());
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
			if (/\(|\{|\[/.test(c)) {
				if (depth == 0 && c == '{') return true;
				depth++;
			}
			else if (/\)|\}|\]/.test(c)) depth--;
			else if (/[a-zA-Z0-9_]/.test(c) && referenceUtils.tryAdd()) return;
			pos++;
		});
		if (depth != 0) {
			console.error('bad returnType depth != 0', getPathLine());
		}
		return text.slice(startingTypeOffset, pos);
	}

	const getBody = (parameters) => {
		if (pos >= text.length || text[pos] != '{') {
			pushDiag(pos, pos, `Bad syntax - no body`);
			return '!!! bad syntax - no body !!!';
		}
		pos++;
		let depth = 1;
		let expectedScopeDepth = 1;
		const startingBodyOffset = pos;
		const chechForInternalBody = [];
		const localEnv = getLocalEnv(parameters);

		whileRun(c => {
			const startWordPos = pos;
			const nextRealPos = nextRealCharPos(pos + 1);
			const nextRealChar = nextRealPos === null ? null : text[nextRealPos];
			if (/\(|\{|\[/.test(c)) {
				if (c == '{') {
					if (chechForInternalBody.length > 0 && chechForInternalBody.at(-1) == depth) {
						chechForInternalBody.pop();
					}
					if (localEnv.scopes.length == expectedScopeDepth) {
						localEnv.scopes.push([]);
						localEnv.releaseScopeBuffer();
					}
					expectedScopeDepth++;
				}
				depth++;
				pos++;
			} else if (/\)|\}|\]/.test(c)) {
				depth--;
				pos++;
				if (c == '}') {
					for (const field of localEnv.scopes.pop()) {
						delete localEnv.fields[field];
					}
					expectedScopeDepth--;
					if (depth == 0) return true;
				}
				if (depth <= 0) return false;
			} else if (/[a-zA-Z0-9_]/.test(c)) {
				const word = getWord(startWordPos);
				const nextRealPos = nextRealCharPos(pos);
				if (nextRealPos === null) return;
				const nextRealChar = text[nextRealPos];
				if (nextRealPos + 1 < text.length && `${nextRealChar}${text[nextRealPos + 1]}` == '=>') {
					skipWhiteChars(); pos++; pos++;
				} else if (/^(var)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) {
					localEnv.tryAddNew();
				} else if (/^(fora|rep)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) {
					if (!chechKeywordVar()) return;
					chechForInternalBody.push(depth);
					localEnv.tryAddNew(true);
				} else if (/^for$/.test(word) && /\(/.test(nextRealChar)) {
					skipWhiteChars();
					pos++; depth++;
					if (!chechKeywordVar()) return;
					localEnv.scopes.push([]);
					// chechForInternalBody.push(depth);
					localEnv.tryAddNew();
				} else if (/^forh$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) {
					if (!chechKeywordVar()) return;
					localEnv.tryAddNew(true);
					skipWhiteChars();
					if (text[pos] != ',') {
						pushDiag(pos, pos, `Bad syntax - expected ,`);
						return;
					}
					pos++;
					if (!chechKeywordVar()) return;
					chechForInternalBody.push(depth);
					localEnv.tryAddNew(true);
				} else if (/^(case)$/.test(word) && /:/.test(nextRealChar)) {
					skipWhiteChars(); pos++; skipWhiteChars();
					getWord(pos, 'Expected variant name'); skipWhiteChars();
					if (text[pos] == '{') return;
					if (text[pos] != '(') {
						pushDiag(pos, pos + 1, `Bad formated variant`);
						return;
					}
					depth++; pos++;
					if (!chechKeywordVar()) return;
					localEnv.tryAddNew(true);
					skipWhiteChars();
					if (text[pos] != ')') {
						pushDiag(startVariablePos, pos, `Bad formated variant`);
						return;
					}
					depth--; pos++;
				} else if (/^\d+$/.test(word)) return;
				else if (/^(as|is)$/.test(word) && /:/.test(nextRealChar)) return;
				else if (/^(else|loop)$/.test(word) && /\{/.test(nextRealChar)) return;
				else if (/^(true|false)$/.test(word)) return;
				else if (/^(def)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) return true;
				else if (/^(eq|ne|return)$/.test(word) && /\s/.test(text[pos])) return;
				else if (/^(for|match|die|if|unless|elsif|while)$/.test(word) && /\(/.test(nextRealChar)) return;
				else if (/^(die|break|continue|return)$/.test(word) && /;/.test(nextRealChar)) return;
				else if (/^(die|break|continue|return|while|unless|if|ensure|try|ref)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) return;
				else if (/^(unless|if)$/.test(word) && /!|\+/.test(nextRealChar)) return;
				else if ((nextRealPos + 1 < text.length && /::/.test(`${nextRealChar}${text[nextRealPos + 1]}`)) || /\(/.test(nextRealChar)) referenceUtils.tryAdd(startWordPos);
				else localEnv.addRef(word, startWordPos);
			} else if (c == ':' && /[a-zA-Z0-9_]/.test(nextRealChar)) {
				pos++; skipWhiteChars(); getWord(pos, 'Expected variant name');
			} else if (c == '-' && pos + 1 < text.length && text[pos + 1] == '>') {
				pos++; pos++; skipWhiteChars(); getWord(pos, 'Expected property name');
			} else if (c == '@') {
				pos++;
				referenceUtils.tryAdd();
			} else if (c == ';') {
				if (chechForInternalBody.length > 0 && chechForInternalBody.at(-1) == depth) {
					localEnv.releaseScopeBuffer(false);
					chechForInternalBody.pop();
				}

				staticDiagnostics.push(...Object.values(localEnv.waitingErrors).flat());
				localEnv.waitingErrors = {};
				pos++;
			} else pos++;
		});
		if (depth != 0) {
			pushDiag(pos, pos, `Bad syntax`);
			console.error('bad body depth != 0', getPathLine(), text.slice(pos - 5, pos + 5));
		}
		return text.slice(startingBodyOffset, pos);
	}

	const whileRun = (run) => {
		let isString = false;
		let isCommant = false;
		while (pos < text.length) {
			const c = text[pos];
			if (c === '\n') { isString = false; isCommant = false; pos++; lineNumber++; continue; }
			if (isCommant) { pos++; continue; }
			if (c === "'") isString = !isString;
			if (isString) { pos++; continue; }
			if (c === "#") { isCommant = true; pos++; continue; }
			if (/\s/.test(c)) { pos++; continue; }

			const ret = run(c);
			if (ret !== undefined) return ret;
		}
	}

	const getLocalEnv = (parameters) => {
		const localEnv = {
			fields: {},
			scopes: [[]],
			scopeBuffer: {},
			waitingErrors: {},
			tryAddNew(addToBuffer = false) {
				skipWhiteChars();
				const startPos = pos;
				const fieldName = getWord(startPos, 'Expected field name');

				if (fieldName in this.scopeBuffer || fieldName in this.fields) {
					if (!(fieldName in this.waitingErrors)) this.waitingErrors[fieldName] = [];
					this.waitingErrors[fieldName].push(getDiag(startPos, pos, 
						`Redeclaration of variable ${(this.scopeBuffer[fieldName] ?? this.fields[fieldName]).startPos}`,
						'redeclarationOfVariable',
						vscode.DiagnosticSeverity.Error, [startPos]
					));
				} else {
					this.addNew(fieldName, { startPos }, !addToBuffer);
				
					if (addToBuffer) {
						this.scopeBuffer[fieldName] = { startPos };
						if (fieldName in this.waitingErrors) {
							for (const diag of this.waitingErrors[fieldName]) {
								const sPos = diag.tags[0];
								positions[sPos] = { type: 'fieldRef', name: fieldName, defPos: startPos };
								positions[startPos].usage.push(sPos);
								if (showDebugInfo) {
									diag.message = startPos;
									diag.code = 'test';
									diag.severity = vscode.DiagnosticSeverity.Information;
								}
							}

							if (!showDebugInfo) delete this.waitingErrors[fieldName];
						}
					}
				}
			},
			addNew(fieldName, field, addToScope = true) {
				if (addToScope) {
					this.fields[fieldName] = field;
					this.scopes.at(-1).push(fieldName);
				}
				if (!(field.startPos in positions)) positions[field.startPos] = { type: 'fieldDef', name: fieldName, usage: [] };
				if (showDebugInfo) pushDiag(
					field.startPos, field.startPos + fieldName.length,
					'Root ' + field.startPos + ' scope depth: ' + this.scopes.length,
					'test', vscode.DiagnosticSeverity.Warning
				);
			},
			addRef(fieldName, startPos) {
				if (fieldName in this.fields) {
					if (showDebugInfo) pushDiag(
						startPos, pos,
						this.fields[fieldName].startPos,
						'test', vscode.DiagnosticSeverity.Information
					);
					positions[startPos] = { type: 'fieldRef', name: fieldName, defPos: this.fields[fieldName].startPos };
					positions[this.fields[fieldName].startPos].usage.push(startPos);
				} else {
					if (!(fieldName in this.waitingErrors)) this.waitingErrors[fieldName] = [];
					this.waitingErrors[fieldName].push(getDiag(startPos, pos, 
						`Variable not declared`, 'variableNotDeclared',
						vscode.DiagnosticSeverity.Error, [startPos]
					));
				}
			},
			releaseScopeBuffer(addToScope = true) {
				for (const [fieldName, field] of Object.entries(this.scopeBuffer)) {
					this.addNew(fieldName, field, addToScope);
				}
				this.scopeBuffer = {};
			},
		};
		for (const { fieldName, startPos } of parameters) localEnv.addNew(fieldName, { usage: [], startPos });
		return localEnv;
	}

	const getMethod = (startingOffset) => {
		skipWhiteChars();
		const startPos = pos;
		let methodName = getWord(startPos, 'Expected method or module name');
		let moduleName = thisModuleName;
		let isPrivate = true;
		skipWhiteChars();
		if (text[pos] == ':') {
			isPrivate = false;
			moduleName = methodName;
			pos++;
			if (pos >= text.length || text[pos] != ':') {
				pushDiag(startPos, pos, 'Bad public method syntax - expected :');
				return;
			}
			pos++; skipWhiteChars();
			methodName = getWord(pos, 'Expected method name');
			skipWhiteChars();
		}
		if (pos >= text.length || text[pos] != '(') {
			pushDiag(startPos, pos, 'Bad public method syntax - expected (');
			return;
		}

		positions[startPos] = { type: 'methodDef', name: isPrivate ? methodName : `${moduleName}::${methodName}` };

		const parameters = getParamiters();

		skipWhiteChars();
		const returnType = getReturnType();

		skipWhiteChars();
		const body = getBody(parameters);

		return { moduleName, methodName, parameters, startDefPos: startingOffset, startPos, endPos: pos, isPrivate, returnType, body };
	}

	// check for duplicated modules
	if (thisModuleName in moduleCache && moduleCache[thisModuleName].filePath != filePath) {
		if (!moduleCache[thisModuleName].staticDiagnostics.some((diag) => diag.code == 'duplicatedModule' && diag.tags.includes(filePath))) {
			pushDiag(0, 0,
				`Duplicated module - first detected is ${moduleCache[thisModuleName].filePath}`,
				'duplicatedModule',
				vscode.DiagnosticSeverity.Error,
				[filePath],
			);
		}
		return;
	}

	// toplevel search
	whileRun(c => {
		if (!/[a-zA-Z0-9_]/.test(c)) {
			if (!/\s/.test(c)) {
				pushDiag(pos, pos, 'Bad syntax - expected use or def');
				console.log('BAD module char', getPathLine());
			}
			pos++;
			return;
		}
		const startPos = pos;
		const word = getWord(startPos, 'Expected a word');

		if (word == 'use') {
			if (Object.keys(privateMethods).length > 0 || Object.keys(privateMethods).length > 0) {
				pushDiag(startPos, pos, 'Bad use statement - should occur before function definitions');
			}

			skipWhiteChars();
			if (!/[a-zA-Z0-9_]/.test(text[pos])) {
				pushDiag(startPos, pos, 'Bad use statement - missing module name');
				return;
			}
			const startModulePos = pos;
			pos++;
			const word = getWord(startModulePos, 'Expected module name');
			if (word in usedModules) {
				pushDiag(startPos, pos, `Module '${word}' usage is duplicated`, 'duplicatedImport', vscode.DiagnosticSeverity.Warning);
			} else {
				usedModules[word] = { count: 0, startPos: startPos, endPos: pos };
			}

			skipWhiteChars();

			if (text[pos] != ';') {
				pushDiag(startModulePos + word.length, pos, `Missing semicolon`);
			} else {
				pos++;
			}

			lastUseStatementPos = pos;
		} else if (word == 'def') {
			const methodDef = getMethod(startPos);
			if (!methodDef) {
				return;
			}
			if (methodDef.moduleName != thisModuleName) {
				pushDiag(methodDef.startPos, methodDef.startPos + methodDef.moduleName.length,
					`Module name '${methodDef.moduleName}' must equal file name '${thisModuleName}'`,
					'moduleNameNotEqualFileName',
				);
			} else if (methodDef.isPrivate) {
				if (methodDef.methodName in privateMethods) {
					pushDiag(methodDef.startPos, methodDef.startPos + methodDef.methodName.length,
						`Duplicated private method name '${methodDef.methodName}'`,
						'duplicatedMethodDef',
					);
				} else {
					privateMethods[methodDef.methodName] = methodDef;
				}
			} else {
				if (methodDef.methodName in publicMethods) {
					pushDiag(methodDef.startPos, methodDef.startPos + methodDef.methodName.length,
						`Duplicated public method name '${methodDef.methodName}'`,
						'duplicatedMethodDef',
					);
				} else {
					publicMethods[methodDef.methodName] = methodDef;
				}
			}
		} else {
			pushDiag(startPos, pos, 'Bad syntax - expected use or def');
			console.log('BAD module cont', getPathLine(), word);
		}

		pos++;
	});

	// chech if not used imports
	for (const [key, value] of Object.entries(usedModules)) {
		if (value.count == 0) {
			pushDiag(value.startPos, value.endPos, `Module '${key}' not used`, 'notUsedImport', vscode.DiagnosticSeverity.Warning);
		}
	}

	moduleCache[thisModuleName] = { filePath, privateMethods, publicMethods, staticDiagnostics, lastUseStatementPos, positions }
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

const getModule = (moduleName) => !moduleName ? null : moduleCache[moduleName];

const getReferences = (functionName, filePath) => functionName.includes("::") 
	? referenceCache[functionName] ?? {} : { [filePath]: (referenceCache[functionName] ?? {})[filePath] ?? [] };

const getReferencesBack = (filePath) => referenceBackCache[filePath] ?? {}

module.exports = { updateModule, removeModule, getModule, moduleCache, findFiles, getReferences, updateIgnore, getReferencesBack };
