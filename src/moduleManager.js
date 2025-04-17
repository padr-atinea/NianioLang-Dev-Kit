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
	const closeBracketsToOpen = { ')': '(', '}': '{', ']': '[' };

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

	const chechKeywordVar = (errMsg = 'Expected keyword var') => {
		skipWhiteChars();
		const word = getWord(pos, errMsg);
		if (word == 'var') return true;
		pushDiag(pos - word.length, pos, errMsg);
		return false;
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
			let methodName;
			if (startPos === undefined) {
				startPos = pos;
				methodName = getWord(startPos, 'Expected function or module name');
			} else {
				if (!/[a-zA-Z0-9_]/.test(text[startPos])) return false;
				methodName = text.slice(startPos, pos);
			}
			skipWhiteChars();
			if (text[pos] == ':' && text[pos + 1] == ':') {
				pos++; pos++;
				skipWhiteChars();
				if (!/[a-zA-Z0-9_]/.test(text[pos])) return true;
				methodName = `${methodName}::${getWord(pos, 'Expected function name')}`;
			}
			if (text[startPos - 1] !== '@') {
				skipWhiteChars();
				if (text[pos] != '(') return true;
			}
			referenceUtils.add(methodName, startPos);
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
		let depth = ['('];
		const parameters = [];
		let currentParam = { fieldName: null, startPos: null, type: null, startPosOfRef: null };
		let startOfType = null;
		whileRun(c => {
			if (/\(|\{|\[/.test(c)) { depth.push(c); pos++; }
			else if (/\)|\}|\]/.test(c)) {
				if (closeBracketsToOpen[c] !== depth.pop()) {
					pushDiag(pos, pos + 1, `Bad syntax - expected ${closeBracketsToOpen[c]}`);
					return false;
				}
				if (depth.length === 0) {
					if (currentParam.fieldName !== null) {
						if (startOfType !== null) currentParam.type = text.slice(startOfType, pos);
						parameters.push(currentParam);
					}
					pos++;
					return true;
				}
				pos++;
			} else if (depth.length === 1) {
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
					} else if (!referenceUtils.tryAdd()) {
						pushDiag(pos, pos, `Bad syntax`);
						pos++;
					}
				} else pos++;
			} else if (/[a-zA-Z0-9_]/.test(c) && referenceUtils.tryAdd()) return;
			else pos++;
		});
		return parameters;
	}

	const getReturnType = () => {
		if (pos >= text.length || text[pos] != ':') return '';
		pos++;
		if (pos >= text.length || !/\s/.test(text[pos])) return '';
		skipWhiteChars();
		if (!/[@a-zA-Z0-9_]/.test(text[pos])) return '';
		const depth = [];
		const startingTypeOffset = pos;
		whileRun(c => {
			if (/\(|\{|\[/.test(c)) {
				if (depth.length == 0 && c == '{') return true;
				depth.push(c);
			}
			else if (/\)|\}|\]/.test(c)) {
				if (closeBracketsToOpen[c] !== depth.pop()) {
					pushDiag(pos, pos + 1, `Bad syntax - expected ${closeBracketsToOpen[c]}`);
					return false;
				}
			}
			else if (/[a-zA-Z0-9_]/.test(c) && referenceUtils.tryAdd()) return;
			pos++;
		});
		return text.slice(startingTypeOffset, pos);
	}

	const getBody = (parameters) => {
		if (pos >= text.length || text[pos] != '{') {
			pushDiag(pos, pos, `Bad syntax - no body`);
			return '!!! bad syntax - no body !!!';
		}
		pos++;
		const depth = ['{'];
		const startingBodyOffset = pos;
		const localEnv = getLocalEnv(parameters);

		whileRun(c => {
			const startWordPos = pos;
			const nextRealPos = nextRealCharPos(pos + 1);
			const nextRealChar = nextRealPos === null ? null : text[nextRealPos];
			if (/\(|\{|\[/.test(c)) {
				if (c == '{') localEnv.tryAddScope(depth.length);
				depth.push(c);
				pos++;
			} else if (/\)|\}|\]/.test(c)) {
				if (closeBracketsToOpen[c] !== depth.pop()) {
					pushDiag(pos, pos + 1, `Bad syntax - expected ${closeBracketsToOpen[c]}`);
					return false;
				}
				pos++;
				if (c == '}') {
					localEnv.tryCloseScope(depth.length);
					if (depth.length == 0) return true;
				}
			} else if (/[a-zA-Z0-9_]/.test(c)) {
				const word = getWord(startWordPos);
				const nextRealPos = nextRealCharPos(pos);
				if (nextRealPos === null) return;
				const nextRealChar = text[nextRealPos];
				if (nextRealPos + 1 < text.length && `${nextRealChar}${text[nextRealPos + 1]}` == '=>') {
					skipWhiteChars(); pos++; pos++;
				} else if (/^(var)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) {
					localEnv.tryAddNewDef({});
				} else if (/^(fora|rep)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) {
					if (!chechKeywordVar()) return;
					localEnv.tryAddNewDef({ expectedDepth: depth.length, addToScope: false, addToScopeBuffer: true, addToScopeAfterRelease: true });
					skipWhiteChars();
					if (text[pos] != '(') pushDiag(pos, pos + 1, `Bad formated ${word} - expected (`);
				} else if (/^for$/.test(word) && /\(/.test(nextRealChar)) {
					skipWhiteChars();
					if (text[pos] != '(') { pushDiag(pos, pos + 1, `Bad formated ${word}`); return; }
					pos++; depth.push('('); // skip (
					skipWhiteChars();
					if (text[pos] !== 'v' || getWord(pos) !== 'var') return; // no var
					const nextRealPos = nextRealCharPos(pos);
					if (nextRealPos === null || !/[a-zA-Z0-9_]/.test(text[nextRealPos])) return; // var is a variable
					localEnv.scopes.push([]);
					localEnv.tryAddNewDef({ expectedDepth: depth.length - 1, addToScope: true, addToScopeBuffer: false, addToScopeAfterRelease: false });
				} else if (/^forh$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) {
					if (!chechKeywordVar()) return;
					localEnv.tryAddNewDef({ expectedDepth: depth.length, addToScope: false, addToScopeBuffer: true, addToScopeAfterRelease: true });
					skipWhiteChars();
					if (text[pos] != ',') { pushDiag(pos, pos, `Bad syntax - expected ,`); return; }
					pos++; // skip ,
					if (!chechKeywordVar()) return;
					localEnv.tryAddNewDef({ expectedDepth: depth.length, addToScope: false, addToScopeBuffer: true, addToScopeAfterRelease: true });
				} else if (/^(case)$/.test(word) && /:/.test(nextRealChar)) {
					skipWhiteChars(); pos++; skipWhiteChars();
					getWord(pos, 'Expected variant name'); skipWhiteChars();
					if (text[pos] == '{') return; // no internal value
					if (text[pos] != '(') { pushDiag(pos, pos + 1, `Bad formated variant`); return; }
					depth.push('('); pos++; // skip (
					if (!chechKeywordVar()) return;
					localEnv.tryAddNewDef({ expectedDepth: depth.length - 1, addToScope: false, addToScopeBuffer: true, addToScopeAfterRelease: true });
					skipWhiteChars();
					if (text[pos] != ')') { pushDiag(startVariablePos, pos, `Bad formated variant`); return; }
					depth.pop(); pos++; // skip )
				} else if (/^\d+$/.test(word)) return;
				else if (/^(as|is|unless|if)$/.test(word) && /:/.test(nextRealChar)) return;
				else if (/^(else|loop)$/.test(word) && /\{/.test(nextRealChar)) return;
				else if (/^(true|false)$/.test(word)) return;
				else if (/^(def)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) return true;
				else if (/^(eq|ne|return)$/.test(word) && /\s/.test(text[pos])) return;
				else if (/^(for|match|die|if|unless|elsif|while)$/.test(word) && /\(/.test(nextRealChar)) return;
				else if (/^(die|break|continue|return)$/.test(word) && /;/.test(nextRealChar)) return;
				else if (/^(die|break|continue|return|while|unless|if|ensure|try|ref)$/.test(word) && /[a-zA-Z0-9_]/.test(nextRealChar)) return;
				else if (/^(unless|if)$/.test(word) && /!|\+|'/.test(nextRealChar)) return;
				else if ((nextRealPos + 1 < text.length && /::/.test(`${nextRealChar}${text[nextRealPos + 1]}`)) || /\(/.test(nextRealChar)) referenceUtils.tryAdd(startWordPos);
				else localEnv.tryAddRef(word, startWordPos, depth.length);
			} else if (c == ':' && /[a-zA-Z0-9_]/.test(nextRealChar)) {
				pos++; skipWhiteChars();
				const startPos = pos;
				const startLine = lineNumber;
				if (!/[a-zA-Z0-9_]/.test(text[pos])) return;
				while (pos < text.length && /[a-zA-Z0-9_]/.test(text[pos])) pos++;
				const word = text.slice(startPos, pos);
				skipWhiteChars();
				if (text[pos] == ':' && text[pos+1] == ':') {
					pos = startPos;
					lineNumber = startLine;
				}
			} else if (c == '-' && pos + 1 < text.length && text[pos + 1] == '>') {
				pos++; pos++; skipWhiteChars(); getWord(pos, 'Expected property name');
			} else if (c == '@') {
				pos++; referenceUtils.tryAdd();
			} else if (c == ';') {
				localEnv.tryReleaseScopeBuffer(depth.length); pos++;
			} else pos++;
		});
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
			fieldsPos: {},
			scopes: [[]],
			scopeBuffer: {},
			waitingErrors: {},
			waitingForNewScope: [],
			pushWaitingErrors(message, code, fieldName, startPos) {
				this.waitingErrors[fieldName].push(getDiag(startPos, pos, message, code, vscode.DiagnosticSeverity.Error, [startPos]));
			},
			tryAddNewDef({ expectedDepth = null, addToScope = true, addToScopeBuffer = false, addToScopeAfterRelease = true}) {
				skipWhiteChars();
				const startPos = pos;
				const fieldName = getWord(startPos, 'Expected field name');
				if (fieldName in this.scopeBuffer || fieldName in this.fieldsPos) {
					if (!(fieldName in this.waitingErrors)) this.waitingErrors[fieldName] = [];
					this.pushWaitingErrors(`Redeclaration of variable ${this.scopeBuffer[fieldName] ?? this.fieldsPos[fieldName]}`, 'redeclarationOfVariable', fieldName, startPos);
					return;
				}
				if (addToScope) this.addNewDef(fieldName, startPos);
				if (addToScopeBuffer) this.scopeBuffer[fieldName] = startPos;
				if (expectedDepth === null) return;
				if (this.waitingForNewScope.length > 0 && this.waitingForNewScope.at(-1).depth == expectedDepth) return;
				this.waitingForNewScope.push({ depth: expectedDepth, addToScopeAfterRelease });
			},
			addNewDefToPosition(fieldName, fieldPos) {
				if (!(fieldPos in positions)) positions[fieldPos] = { type: 'fieldDef', name: fieldName, startPos: fieldPos, usage: [] };
				if (showDebugInfo) {
					positions[fieldPos].scope = JSON.parse(JSON.stringify(this.scopes));
					pushDiag(
						fieldPos, fieldPos + fieldName.length,
						'Root ' + fieldPos,
						'test', vscode.DiagnosticSeverity.Warning
					);
				}
			},
			addNewDef(fieldName, fieldPos) {
				this.fieldsPos[fieldName] = fieldPos;
				this.addNewDefToPosition(fieldName, fieldPos);
				this.scopes.at(-1).push(fieldName);
			},
			tryAddRef(fieldName, startPos, depth) {
				if (fieldName in this.fieldsPos) this.addRef(fieldName, startPos, this.fieldsPos[fieldName], depth);
				else {
					if (!(fieldName in this.waitingErrors)) this.waitingErrors[fieldName] = [];
					this.pushWaitingErrors(`Variable not declared${showDebugInfo ? ` at depth ${depth}, depth scope ${this.scopes.length}` : ''}`, 'variableNotDeclared', fieldName, startPos);
				}
			},
			addRef(fieldName, startPos, defPos, depth) {
				positions[startPos] = { type: 'fieldRef', name: fieldName, startPos, def: positions[defPos] };
				positions[defPos].usage.push(startPos);
				if (showDebugInfo) {
					pushDiag(startPos, startPos, startPos + fieldName.length, 'test', vscode.DiagnosticSeverity.Information);
					positions[startPos].scope = JSON.parse(JSON.stringify(this.scopes));
					positions[startPos].depth = depth;
				}
			},
			tryAddScope(depth) {
				if (this.waitingForNewScope.length == 0) { this.scopes.push([]); return; } 
				if (this.waitingForNewScope.at(-1).depth != depth) return;
				if (!this.waitingForNewScope.pop().addToScopeAfterRelease) return;
				this.scopes.push([]);
				for (const [fieldName, field] of Object.entries(this.scopeBuffer)) this.addNewDef(fieldName, field);
				this.scopeBuffer = {};
			},
			tryReleaseScopeBuffer(depth) {
				if (this.waitingForNewScope.length > 0 
					&& this.waitingForNewScope.at(-1).depth === depth 
					&& this.waitingForNewScope.pop().addToScopeAfterRelease) {
					for (const [fieldName, fieldPos] of Object.entries(this.scopeBuffer)) {
						this.addNewDefToPosition(fieldName, fieldPos);
						if (fieldName in this.waitingErrors) {
							for (const diag of this.waitingErrors[fieldName]) {
								this.addRef(fieldName, diag.tags[0], fieldPos, depth);
							}
							delete this.waitingErrors[fieldName];
						}
						delete this.scopeBuffer[fieldName];
					}
				}
				staticDiagnostics.push(...Object.values(this.waitingErrors).flat());
				this.waitingErrors = {};
			},
			tryCloseScope(depth) {
				if (this.waitingForNewScope.length != 0 && this.waitingForNewScope.at(-1) != depth) return;
				if (depth !== 0 && this.scopes.length == 1) {
					pushDiag(pos - 1, pos, 'Bad scope');
					return;
				}
				for (const field of this.scopes.pop()) {
					delete this.fieldsPos[field];
				}
			},
		};
		for (const { fieldName, startPos } of parameters) localEnv.addNewDef(fieldName, startPos);
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

			skipWhiteChars();

			if (text[pos] != ';') {
				pushDiag(startModulePos + word.length, pos, `Missing semicolon`);
			} else {
				pos++;
			}

			if (word in usedModules) {
				pushDiag(startPos, pos, `Module '${word}' usage is duplicated`, 'duplicatedImport', vscode.DiagnosticSeverity.Warning);
			} else {
				usedModules[word] = { count: 0, startPos: startPos, endPos: pos };
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

	moduleCache[thisModuleName] = { filePath, privateMethods, publicMethods, staticDiagnostics, lastUseStatementPos, usedModules, positions }
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

module.exports = { updateModule, removeModule, getModule, moduleCache, findFiles, getReferences, updateIgnore, getReferencesBack, showDebugInfo };
