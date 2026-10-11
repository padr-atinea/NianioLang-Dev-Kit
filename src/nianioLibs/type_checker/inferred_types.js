const ov = require('../base/ov');
const DC = require('../base/json_clone');
const nparser = require('../parsers/nparser');
const ptd_parser = require('../parsers/ptd_parser');
const type_checker = require('./type_checker');

// Types of declarations without an explicit type (`var` commands, function parameters and return types of functions -
// not iterators of for / fora / forh / rep), which the type checker determines unambiguously:
//  - the variable has exactly one type during the whole check (recorded by the checker in var_types: the type at
//    the declaration, after every assignment, join of branches, narrowing by operators),
//  - a function returns values of exactly one type (ret_types; no return with a value: ptd::void()),
//  - the type can be written in nl2 syntax,
//  - adding all the types to the declarations does not cause new errors (verified by checking the module again).

const place_key = (place) => `${place.line}|${place.position}`;
const EMPTY = JSON.stringify({ tct_empty: null });

function walk_cmd(cmd, on_var_decl) {
	if (!cmd || !cmd.cmd) return;
	const c = cmd.cmd;
	if (ov.is(c, 'var_decl')) {
		on_var_decl(ov.as(c, 'var_decl'));
	} else if (ov.is(c, 'block')) {
		ov.as(c, 'block').cmds.forEach(sub => walk_cmd(sub, on_var_decl));
	} else if (ov.is(c, 'if')) {
		const as_if = ov.as(c, 'if');
		walk_cmd(as_if.if, on_var_decl);
		as_if.elsif.forEach(elsif => walk_cmd(elsif.cmd, on_var_decl));
		walk_cmd(as_if.else, on_var_decl);
	} else if (ov.is(c, 'loop')) {
		walk_cmd(ov.as(c, 'loop'), on_var_decl);
	} else if (ov.is(c, 'match')) {
		ov.as(c, 'match').branch_list.forEach(branch => walk_cmd(branch.cmd, on_var_decl));
	} else {
		for (const label of ['while', 'for', 'fora', 'forh', 'rep', 'if_mod', 'unless_mod']) {
			if (ov.is(c, label)) walk_cmd(ov.as(c, label).cmd, on_var_decl);
		}
	}
}

const fun_key = (fun, module_name) => ov.is(fun.access, 'pub') ? `${module_name}::${fun.name}` : fun.name;

// declarations without a type: [{ kind: 'var' | 'param' | 'return', key, name, place, fun }]
// (for 'return' the place is the beginning of the function body - '{')
function find_untyped_declarations(module) {
	const out = [];
	for (const fun of module.fun_def) {
		// (functions defining types return ptd types - they are not declared with a return type)
		if (ov.is(fun.ret_type.type, 'none') && !ov.is(fun.defines_type, 'yes')) out.push({ kind: 'return', key: place_key(fun.cmd.debug.begin), name: fun.name, place: fun.cmd.debug.begin, fun });
		for (const arg of fun.args) {
			if (ov.is(arg.type, 'none')) out.push({ kind: 'param', key: place_key(arg.place), name: arg.name, place: arg.place, fun });
		}
		walk_cmd(fun.cmd, var_decl => {
			if (ov.is(var_decl.type, 'none')) out.push({ kind: 'var', key: place_key(var_decl.place), name: var_decl.name, place: var_decl.place, fun });
		});
	}
	return out;
}

const is_proper_hash_key = (key) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key);
const hash_key = (key) => is_proper_hash_key(key) ? key : `'${key.replace(/'/g, '\'\'')}'`;

// the type in nl2 syntax, null when it can't be written (empty, void...)
function type_to_text(type) {
	const label = ov.get_element(type);
	const value = ov.get_value(type);
	const prefix = label.startsWith('tct_own_') ? 'own' : 'ptd';
	switch (label) {
		case 'tct_int': return 'ptd::int()';
		case 'tct_string': return 'ptd::string()';
		case 'tct_bool': return 'ptd::bool()';
		case 'tct_im': return 'ptd::ptd_im()';
		case 'tct_ref': return `@${value}`;
		case 'tct_arr': case 'tct_own_arr':
		case 'tct_hash': case 'tct_own_hash': {
			const inner = type_to_text(value);
			return inner === null ? null : `${prefix}::${label.endsWith('arr') ? 'arr' : 'hash'}(${inner})`;
		}
		case 'tct_rec': case 'tct_own_rec': {
			const fields = [];
			for (const [name, field_type] of Object.entries(value)) {
				const text = type_to_text(field_type);
				if (text === null) return null;
				fields.push(`${hash_key(name)} => ${text}`);
			}
			return `${prefix}::rec({${fields.join(', ')}})`;
		}
		case 'tct_var': case 'tct_own_var': {
			const cases = [];
			for (const [name, param] of Object.entries(value)) {
				let text = 'ptd::none()';
				if (ov.is(param, 'with_param')) text = type_to_text(ov.as(param, 'with_param'));
				if (text === null) return null;
				cases.push(`${hash_key(name)} => ${text}`);
			}
			return `${prefix}::var({${cases.join(', ')}})`;
		}
		default: return null;
	}
}

const VOID = { tct_void: null };

// the one type the function returns: { type, text } or null
function get_unambiguous_return_type(recorded) {
	if (!recorded) return null;
	const types = new Set(recorded);
	if (types.size === 0 || (types.size === 1 && types.has(EMPTY))) return { type: VOID, text: 'ptd::void()' };
	if (types.size !== 1 || types.has(EMPTY)) return null;
	const type = JSON.parse([...types][0]);
	if (ov.is(type, 'tct_im')) return null;
	const text = type_to_text(type);
	return text === null ? null : { type, text };
}

// the one type the declaration had during the check: { type, text } or null
function get_unambiguous_type(decl, recorded) {
	if (!recorded) return null;
	// a parameter without a type starts as ptd_im - its type comes from how it is used
	const types = new Set((decl.kind === 'param' ? recorded.slice(1) : recorded).filter(t => t !== EMPTY));
	if (types.size !== 1) return null;
	const type = JSON.parse([...types][0]);
	if (ov.is(type, 'tct_im')) return null;
	const text = type_to_text(type);
	return text === null ? null : { type, text };
}

const type_ast_cache = new Map();

// AST of the type with all positions set to the place of the declaration (errors are reported there)
function type_ast(text, place) {
	if (!type_ast_cache.has(text)) {
		const parsed = nparser.sparse(`def x::f(a : ${text}) {\n}\n`, 'x');
		const arg = parsed.fun_def[0]?.args[0];
		const syntax_errors = parsed.errors.filter(e => !e.message.includes('not imported'));
		type_ast_cache.set(text, arg && syntax_errors.length === 0 && ov.is(arg.type, 'type') ? arg.type : null);
	}
	const ast = type_ast_cache.get(text);
	if (!ast) return null;
	const relocate = (node) => {
		if (Array.isArray(node)) return node.map(relocate);
		if (node === null || typeof node !== 'object') return node;
		const out = {};
		for (const [key, value] of Object.entries(node)) {
			out[key] = key === 'debug' ? { begin: { ...place }, end: { ...place }, comment: [] } : key === 'place' ? { ...place } : relocate(value);
		}
		return out;
	};
	return relocate(ast);
}

const referenced_modules = (text) => [...new Set([...text.matchAll(/@([a-zA-Z0-9_]+)::/g)].map(m => m[1]))];

// copy of the module with the types added to the declarations (and modules used by the types imported)
function annotate(module, candidates) {
	const copy = DC(module);
	const by_key = new Map(candidates.map(c => [c.key, c]));
	const imported = new Set(copy.imports.map(imp => imp.name));
	for (const c of candidates) {
		for (const mod of c.imports) {
			if (!imported.has(mod)) {
				copy.imports.push({ name: mod, line: 0, column: 0, endLine: 0, endColumn: 0 });
				imported.add(mod);
			}
		}
	}
	for (const fun of copy.fun_def) {
		const ret = by_key.get(place_key(fun.cmd.debug.begin));
		if (ret && ret.kind === 'return' && ov.is(fun.ret_type.type, 'none')) {
			fun.ret_type.type = ret.ast;
			const tct_type = ptd_parser.try_value_to_ptd(ov.as(ret.ast, 'type'));
			fun.ret_type.tct_type = ov.is(tct_type, 'ok') ? ov.as(tct_type, 'ok') : ov.mk('tct_im');
		}
		for (const arg of fun.args) {
			const c = by_key.get(place_key(arg.place));
			if (c && c.kind === 'param' && ov.is(arg.type, 'none')) arg.type = c.ast;
		}
		walk_cmd(fun.cmd, var_decl => {
			const c = by_key.get(place_key(var_decl.place));
			if (c && c.kind === 'var' && ov.is(var_decl.type, 'none')) var_decl.type = c.ast;
		});
	}
	return copy;
}

const error_key = (err) => `${err.message}|${err.debug?.begin?.line}|${err.debug?.begin?.position}`;

function new_errors_of(result, module_name, base_keys) {
	const counts = new Map();
	for (const key of base_keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	const out = [];
	for (const err of [...(result.errors[module_name] ?? []), ...(result.warnings[module_name] ?? [])]) {
		const key = error_key(err);
		if ((counts.get(key) ?? 0) > 0) counts.set(key, counts.get(key) - 1);
		else out.push(err);
	}
	return out;
}

// Finds the declarations with unambiguous types.
// check: async (modules, def_fun) => result of check_modules_steps (null when cancelled)
// returns [{ kind, name, line, position, text, type, imports, fun }] or null when cancelled
async function find_inferred_types({ module_name, module, result, def_fun_cache, dependencies, check }) {
	const recorded = result.var_types?.[module_name] ?? {};
	const recorded_returns = result.ret_types?.[module_name] ?? {};
	const imported = new Set([module_name, ...module.imports.map(imp => imp.name)]);
	let candidates = [];
	for (const decl of find_untyped_declarations(module)) {
		const found = decl.kind === 'return' ? get_unambiguous_return_type(recorded_returns[decl.key]) : get_unambiguous_type(decl, recorded[decl.key]);
		if (!found) continue;
		const ast = type_ast(found.text, decl.place);
		if (!ast) continue;
		candidates.push({ ...decl, ...found, ast, imports: referenced_modules(found.text).filter(mod => !imported.has(mod)) });
	}
	const base_keys = [...(result.errors[module_name] ?? []), ...(result.warnings[module_name] ?? [])].map(error_key);
	const function_of_line = (line) => module.fun_def.find(fun => line >= fun.line && line <= fun.cmd.debug.end.line);
	// verification: the types are added and the module checked again, until there are no new errors
	for (let round = 0; candidates.length > 0; round++) {
		if (round === 4) {
			candidates = [];
			break;
		}
		const annotated = annotate(module, candidates);
		const def_fun = type_checker.def_fun_from_cache({ ...def_fun_cache, [module_name]: type_checker.prepare_module_def_fun(module_name, annotated) });
		const verification = await check({ [module_name]: annotated }, def_fun);
		if (!verification) return null;
		const errors = new_errors_of(verification, module_name, base_keys);
		if (errors.length === 0) break;
		const before = candidates.length;
		for (const err of errors) {
			const fun = function_of_line(err.debug?.begin?.line ?? 0);
			if (!fun) {
				candidates = [];
				break;
			}
			// declarations in the function, and types of parameters / return types of the functions it calls
			const called = new Set(Object.keys(dependencies(fun_key(fun, module_name)) ?? {}));
			candidates = candidates.filter(c => c.fun !== fun && !(c.kind !== 'var' && called.has(fun_key(c.fun, module_name))));
		}
		if (candidates.length === before) candidates = [];
	}
	return candidates.map(c => ({
		kind: c.kind,
		name: c.name,
		// the text the position points to (the name of the variable / '{' of the function body)
		anchor: c.kind === 'return' ? '{' : c.name,
		line: c.place.line,
		position: c.place.position,
		text: c.text,
		type: c.type,
		imports: c.imports,
		fun: fun_key(c.fun, module_name),
		public_fun: ov.is(c.fun.access, 'pub'),
	}));
}

module.exports = { find_inferred_types, type_to_text, find_untyped_declarations };
