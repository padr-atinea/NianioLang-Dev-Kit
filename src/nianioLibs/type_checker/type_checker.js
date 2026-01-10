const ov = require('../base/ov');
const array = require('../base/array');
const tc_types = require('./tc_types');
const hash = require('../base/hash');
const string = require('../base/string');
const nast = require('../base/nast');
const tct = require('./tct');
const ptd_parser = require('../parsers/ptd_parser');
const ptd_system = require('./ptd_system');
const own_to_im_converter = require('./own_to_im_converter');
const nparser = require('../parsers/nparser');

const DC = (obj) => JSON.parse(JSON.stringify(obj));
// const DC = (obj) => structuredClone(obj);

const ObjectAssignInPlace = (objA, objB) =>
	Object.keys(objA).forEach(key => delete objA[key]) ??
	Object.keys(objB).forEach(key => objA[key] = objB[key]);

const ArrayAssignInPlace = (objA, arrB) => { while (objA.pop()); objA.push(...arrB); };

function type_to_ptd(type, errors) {
	let match_type_5 = type;
	if (ov.is(match_type_5, 'type')) {
		let tt = ov.as(match_type_5, 'type');
		let match_ptd_parser_try_value_to_ptd_tt_1 = ptd_parser.try_value_to_ptd(tt);
		if (ov.is(match_ptd_parser_try_value_to_ptd_tt_1, 'err')) {
			let err = ov.as(match_ptd_parser_try_value_to_ptd_tt_1, 'err');
			add_error(errors, err);
			return tct.tct_im();
		} else if (ov.is(match_ptd_parser_try_value_to_ptd_tt_1, 'ok')) {
			let ok = ov.as(match_ptd_parser_try_value_to_ptd_tt_1, 'ok');
			return ok;
		}
	} else if (ov.is(match_type_5, 'none')) {
		return tct.tct_im();
	}
}

function get_fun_def_key(func) {
	let match_func_access_0 = func.access;
	if (ov.is(match_func_access_0, 'pub')) {
		return func.name;
	} else if (ov.is(match_func_access_0, 'priv')) {
		return 'priv::' + func.name;
	}
}

function get_fun_key(fun_name, fun_module) {
	let ret = '';
	if (fun_module === '') {
		ret += 'priv::';
	}
	return ret + fun_name;
}

function return_type_to_tct(type, errors) {
	let match_type_6 = type;
	if (ov.is(match_type_6, 'type')) {
		let tt = ov.as(match_type_6, 'type');
		if (ov.is(tt.value, 'fun_val')) {
			let fun_val = ov.as(tt.value, 'fun_val');
			if (fun_val.module === 'ptd' && fun_val.name === 'void') {
				return tct.void_();
			}
		}
		return type_to_ptd(type, errors);
	} else if (ov.is(match_type_6, 'none')) {
		return tct.tct_im();
	}
}

function check_types_imported(type, modules, errors) {
	let match_type_7 = type;
	if (ov.is(match_type_7, 'tct_im')) {
	} else if (ov.is(match_type_7, 'tct_arr')) {
		let arr_type = ov.as(match_type_7, 'tct_arr');
		check_types_imported(arr_type, modules, errors);
	} else if (ov.is(match_type_7, 'tct_own_arr')) {
		let arr_type = ov.as(match_type_7, 'tct_own_arr');
		check_types_imported(arr_type, modules, errors);
	} else if (ov.is(match_type_7, 'tct_hash')) {
		let hash_type = ov.as(match_type_7, 'tct_hash');
		check_types_imported(hash_type, modules, errors);
	} else if (ov.is(match_type_7, 'tct_own_hash')) {
		let hash_type = ov.as(match_type_7, 'tct_own_hash');
		check_types_imported(hash_type, modules, errors);
	} else if (ov.is(match_type_7, 'tct_rec')) {
		let records = ov.as(match_type_7, 'tct_rec');
		for (const [name, record] of Object.entries(records)) {
			check_types_imported(record, modules, errors);
		}
	} else if (ov.is(match_type_7, 'tct_own_rec')) {
		let records = ov.as(match_type_7, 'tct_own_rec');
		for (const [name, record] of Object.entries(records)) {
			check_types_imported(record, modules, errors);
		}
	} else if (ov.is(match_type_7, 'tct_ref')) {
		let ref_name = ov.as(match_type_7, 'tct_ref');
		let ix = string.index2(ref_name, '::');
		if (ix >= 0) {
			let [module_name, fun_name] = ref_name.split('::');
			check_function_exists(module_name, fun_name, modules, errors);
		} else {
			add_error(errors, `wrong type name \'${ref_name}\'`);
		}
	} else if (ov.is(match_type_7, 'tct_void')) {
	} else if (ov.is(match_type_7, 'tct_int')) {
	} else if (ov.is(match_type_7, 'tct_string')) {
	} else if (ov.is(match_type_7, 'tct_bool')) {
	} else if (ov.is(match_type_7, 'tct_var')) {
		let var_s = { ...ov.as(match_type_7, 'tct_var') };
		for (const [name, from_type] of Object.entries(var_s)) {
			let match_from_type_1 = from_type;
			if (ov.is(match_from_type_1, 'no_param')) {
			} else if (ov.is(match_from_type_1, 'with_param')) {
				let param = ov.as(match_from_type_1, 'with_param');
				check_types_imported(param, modules, errors);
			}
		}
	} else if (ov.is(match_type_7, 'tct_own_var')) {
		let var_s = { ...ov.as(match_type_7, 'tct_own_var') };
		for (const [name, from_type] of Object.entries(var_s)) {
			let match_from_type_2 = from_type;
			if (ov.is(match_from_type_2, 'no_param')) {
			} else if (ov.is(match_from_type_2, 'with_param')) {
				let param = ov.as(match_from_type_2, 'with_param');
				check_types_imported(param, modules, errors);
			}
		}
	} else if (ov.is(match_type_7, 'tct_empty')) {
	}
}

function prepare_def_fun(modules, errors) {
	let def_fun = {};
	for (const [module_name, ast] of Object.entries(modules)) {
		errors.current_debug = nast.empty_debug();
		errors.module = module_name;
		let funs = {};
		for (const fun_def of ast.fun_def) {
			let new_args = [];
			for (const fun_arg of fun_def.args) {
				array.push(new_args, { name: fun_arg.name, mod: fun_arg.mod, type: type_to_ptd(fun_arg.type, errors) });
			}
			let new_fun_def = {
				cmd: fun_def.cmd,
				is_type: ov.mk('no'),
				ref_types: ov.mk('no'),
				name: fun_def.name,
				module: module_name,
				access: fun_def.access,
				args: new_args,
				ret_type: return_type_to_tct(fun_def.ret_type.type, errors)
			};
			let name = get_fun_def_key(new_fun_def);
			if ((hash.has_key(funs, name))) {
				add_error(errors, `redefine function: ${name}`);
			}
			hash.set_value(funs, name, new_fun_def);
		}
		hash.set_value(def_fun, module_name, funs);
	}
	return def_fun;
}

// function check(modules, lib_modules) {
// 	return check_modules(modules, lib_modules);
// }

// function gather_types(modules) {
// 	let known_types = {};
// 	for (const [module_name, ast] of Object.entries(modules)) {
// 		for (const func of ast.fun_def) {
// 			let match_func_defines_type = func.defines_type;
// 			if (ov.is(match_func_defines_type, 'yes')) {
// 				let type = ov.as(match_func_defines_type, 'yes');
// 				hash.set_value(known_types, `${module_name}::${func.name}`, type);
// 			} else if (ov.is(match_func_defines_type, 'no')) {
// 			}
// 		}
// 	}
// 	return known_types;
// }

function check_modules(modules, lib_modules, known_types) {
	let errors = { errors: { '': [] }, warnings: { '': [] }, module: '', current_debug: nast.empty_debug(), varPositions: {} };
	let deref = { delete: [], create: [] };
	try {
		for (const [module_name, ast] of Object.entries(modules)) {
			let own_conv = {};
			for (const func of ast.fun_def) {
				let match_func_defines_type_0 = func.defines_type;
				if (ov.is(match_func_defines_type_0, 'yes')) {
					let type = ov.as(match_func_defines_type_0, 'yes');
					if (tct.is_own_type(type, known_types)) {
						let ref_type = ov.mk('tct_ref', module_name + '::' + func.name);
						hash.set_value(own_conv, own_to_im_converter.get_function_name(ref_type, known_types), ref_type);
					}
				} else if (ov.is(match_func_defines_type_0, 'no')) {
				}
			}
			let new_module = create_own_convertions_module(own_conv, known_types, module_name);
			let found = false;
			let new_fun_def = DC(ast.fun_def);
			for (const new_fun of new_module.fun_def) {
				found = false;
				for (let i = 0; i < array.len(ast.fun_def); i++) {
					if (new_fun_def[i].name === new_fun.name) {
						found = true;
						new_fun_def[i] = new_fun;
						break;
					}
				}
				if (!found) {
					new_fun_def.push(new_fun);
				}
			}
			modules[module_name].fun_def = new_fun_def;
			lib_modules[module_name].fun_def = new_fun_def;
		}
		let def_fun = prepare_def_fun(lib_modules, errors);
		for (const [module_name, ast] of Object.entries(modules)) {
			errors.current_debug = nast.empty_debug()
			errors.module = module_name;
			errors.errors[errors.module] = []; 
			errors.warnings[errors.module] = [];
			try {
				check_module(modules[module_name], def_fun, errors, deref, known_types);
			} catch (e) {
				console.log(errors.module, e, e.stack);
				add_error(errors, `!! parser error !! ${e.message}`);
			}
		}
	} catch (e) {
		console.log(errors.module, e, e.stack);
		add_error(errors, `!! parser error !! ${e.message}`);
	}

	return { errors: errors.errors, deref: deref, warnings: errors.warnings, varPositions: errors.varPositions };
}

function get_own_conv_defs(defs, types, known_types) {
	let r;
	for (const [name, type] of Object.entries(types)) {
		if (hash.has_key(defs, name)) {
			continue;
		}
		r = own_to_im_converter.get_function(type, known_types);
		hash.set_value(defs, name, r.body);
		get_own_conv_defs(defs, r.required_functions, known_types);
	}
}

function create_own_convertions_module(own_conv, known_types, moudule_name) {
	let own_conv_defs = {};
	get_own_conv_defs(own_conv_defs, own_conv, known_types);
	let new_code = 'use own; use ptd;';
	for (const [name, body] of Object.entries(own_conv_defs)) {
		new_code += body + string.lf();
	}
	let new_module = nparser.sparse(new_code, moudule_name);
	if (new_module.errors.filter(err => !/module '[a-z_]+' not imported/.test(err.message)).length > 0) {
		throw new Error();
	}

	let errors = { errors: [], warnings: [], module: '', current_debug: nast.empty_debug() };
	for (let i = 0; i < array.len(new_module.fun_def); i++) {
		let tct_type = type_to_ptd(new_module.fun_def[i].args[0].type, errors);
		new_module.fun_def[i].args[0].tct_type = tct_type;
	}
	if (!array.is_empty(errors.errors)) {
		throw new Error();
	}
	return new_module;
}

function check_func(i, modules, own_conv, module, def_fun, errors, deref, known_types) {
	let fun_vars = {};
	let fun_def = module.fun_def[i];
	for (let j = 0; j < array.len(fun_def.args); j++) {
		let fun_arg = fun_def.args[j];
		let arg_type = type_to_ptd(fun_arg.type, errors);
		if (tct.is_own_type(arg_type, known_types)) {
			let match_fun_arg_mod = fun_arg.mod;
			if (ov.is(match_fun_arg_mod, 'ref')) {
			} else if (ov.is(match_fun_arg_mod, 'none')) {
				add_error(errors, `Function ${fun_def.name} takes non-ref own argument ${fun_arg.name}`);
			}
		}
		check_types_imported(arg_type, modules, errors);
		add_var_decl_to_vars(arg_type, fun_arg.name, fun_vars, errors, fun_arg.place);
		module.fun_def[i].args[j].tct_type = arg_type;
	}
	modules.env.ret_type = fun_def.ret_type.tct_type;
	if (tct.is_own_type(modules.env.ret_type, known_types)) {
		add_error(errors, `Function ${fun_def.name} returns own type.`);
	}
	check_cmd(module.fun_def[i].cmd, modules, fun_vars, errors, known_types);
	check_types_imported(modules.env.ret_type, modules, errors);
	let fun_name = get_function_name(module.module_name, fun_def.name);
	if (ov.is(fun_def.access, 'pub') && hash.has_key(special_functions, fun_name)) {
		let special_fun_def = special_functions[fun_name];
		module.fun_def[i].ret_type.tct_type = special_fun_def.r;
		for (let j = 0; j < array.len(module.fun_def[i].args); j++) {
			module.fun_def[i].args[j].tct_type = special_fun_def.a[j].type;
			fun_vars[module.fun_def[i].args[j].name] = new_var_decl(module.fun_def[i].args[j].name, special_fun_def.a[j].type, module.fun_def[i].args[j].place, false);
		}
	} else {
		module.fun_def[i].ret_type.tct_type = modules.env.ret_type;
	}
	if (array.is_empty(errors.errors[errors.module])) {
		fill_value_types_in_cmd(module.fun_def[i].cmd, fun_vars, modules, errors, known_types, own_conv, module.module_name);
	}
}

function check_module(module, def_fun, errors, deref, known_types) {
	let modules = {
		env: { deref: deref, current_module: module.module_name, breaks: { vars: {}, is: false }, ret_type: tct.empty() },
		imports: {},
		funs: def_fun
	};
	for (const import_ of module.imports) {
		hash.set_value(modules.imports, import_.name, true);
	}
	hash.set_value(modules.imports, module.module_name, true);
	let own_conv = {};
	for (let i = 0; i < array.len(module.fun_def); i++) {
		check_func(i, modules, own_conv, module, def_fun, errors, deref, known_types);
	}
	let i_offset = array.len(module.fun_def);
	let new_module = create_own_convertions_module(own_conv, known_types, module.module_name);
	let to_delete = [];
	let exist_name_hash = {};
	for (const f of module.fun_def) {
		exist_name_hash[f.name] = f.name;
	}
	for (let f = 0; f < array.len(new_module.fun_def); f++) {
		if (hash.has_key(exist_name_hash, new_module.fun_def[f].name)) {
			to_delete.push(f);
		}
	}
	let n_offset = 0;
	for (const n of to_delete) {
		array.remove(new_module.fun_def, n - n_offset);
		n_offset += 1;
	}
	let h_new_module = {};
	hash.set_value(h_new_module, module.module_name, new_module);
	for (const [a, b] of Object.entries(prepare_def_fun(h_new_module, errors))) {
		for (const [c, d] of Object.entries(b)) {
			modules.funs[a][c] = d;
			def_fun[a][c] = d;
		}
	}
	let m = module.fun_def;
	array.append(m, new_module.fun_def);
	module.fun_def = m;
	for (let i = 0; i < array.len(new_module.fun_def); i++) {
		try {
			check_func(i + i_offset, modules, own_conv, module, def_fun, errors, deref, known_types);

		} catch (e) {
			console.log(errors.module, e, e.stack);
			add_error(errors, `!! parser error !! ${e.message}`);
		}
	}
}

function join_vars(vars, vars_op, modules, errors, known_types) {
	if (hash.has_key(vars_op, '__END')) {
		return;
	}
	if (hash.has_key(vars, '__END')) {
		ObjectAssignInPlace(vars, vars_op);
		return;
	}
	for (const [var_name, var_] of Object.entries(vars)) {
		let match_var_overwrited_2 = var_.overwrited;
		if (ov.is(match_var_overwrited_2, 'yes')) {
			let t1 = var_.type;
			let t2 = hash.get_value(vars_op, var_name).type;
			set_type_to_variable(vars, var_name, ptd_system.cross_type(t1, t2, modules, errors, known_types), errors, var_.defPlace);
		} else if (ov.is(match_var_overwrited_2, 'no')) {
		}
	}
}

function set_end_function(vars, errors, place) {
	set_type_to_variable(vars, '__END', tct.empty(), errors, place);
}

function check_cmd(cmd, modules, b_vars, errors, known_types) {
	errors.current_debug = cmd.debug;
	let ret = {};
	let vars = DC(b_vars);
	let match_cmd_cmd_0 = DC(cmd.cmd);
	if (ov.is(match_cmd_cmd_0, 'if')) {
		let as_if = ov.as(match_cmd_cmd_0, 'if');
		let vars_op = DC(vars);
		let if_cond_type = check_val(as_if.cond, modules, vars_op, errors, known_types);
		if (!(ptd_system.is_condition_type(if_cond_type, modules, errors))) {
			add_error(errors, `if argument should be boolean instead of ${get_print_tct_type_name(if_cond_type.type)}`);
		}
		check_cmd(as_if.if, modules, vars_op, errors, known_types);
		for (let i = 0; i < array.len(as_if.elsif); i++) {
			let elsif_s = as_if.elsif[i];
			errors.current_debug = elsif_s.cmd.debug;
			const elsif_cond = check_val(elsif_s.cond, modules, vars, errors, known_types);
			if (!(ptd_system.is_condition_type(elsif_cond, modules, errors))) {
				add_error(errors, `elsif condition should be boolean instead of ${get_print_tct_type_name(elsif_cond.type)}`);
			}
			const vars_cmd = DC(vars);
			check_cmd(as_if.elsif[i].cmd, modules, vars_cmd, errors, known_types);
			join_vars(vars_op, vars_cmd, modules, errors, known_types);
		}
		check_cmd(as_if.else, modules, vars, errors, known_types);
		join_vars(vars, vars_op, modules, errors, known_types);
		cmd.cmd = DC(ov.mk('if', as_if));
	} else if (ov.is(match_cmd_cmd_0, 'for')) {
		let as_for = ov.as(match_cmd_cmd_0, 'for');
		let match_as_for_start_0 = as_for.start;
		if (ov.is(match_as_for_start_0, 'value')) {
			let value = ov.as(match_as_for_start_0, 'value');
			check_val(value, modules, vars, errors, known_types);
		} else if (ov.is(match_as_for_start_0, 'var_decl')) {
			let var_decl = ov.as(match_as_for_start_0, 'var_decl');
			add_var_to_vars(check_var_decl(var_decl, modules, vars, errors, known_types), vars, errors);
		}
		let vars_op = DC(vars);
		if (!(ov.is(as_for.cond.value, 'nop'))) {
			let for_cond = check_val(as_for.cond, modules, vars_op, errors, known_types);
			if (!(ptd_system.is_condition_type(for_cond, modules, errors))) {
				add_error(errors, 'for condition should be boolean instead of ' + get_print_tct_type_name(for_cond.type));
			}
			join_vars(vars_op, vars, modules, errors, known_types);
		}
		break_continue_block(as_for.cmd, modules, vars_op, errors, known_types);
		check_val(as_for.iter, modules, vars_op, errors, known_types);
		join_vars(vars, vars_op, modules, errors, known_types);
		if (ov.is(as_for.start, 'var_decl')) {
			let var_decl = ov.as(as_for.start, 'var_decl');
			var_decl.tct_type = vars[var_decl.name].type;
			as_for.start = ov.mk('var_decl', var_decl);
		}
		cmd.cmd = DC(ov.mk('for', as_for));
	} else if (ov.is(match_cmd_cmd_0, 'fora')) {
		let as_fora = ov.as(match_cmd_cmd_0, 'fora');
		check_fora(as_fora, modules, vars, errors, known_types);
		cmd.cmd = DC(ov.mk('fora', as_fora));
	} else if (ov.is(match_cmd_cmd_0, 'forh')) {
		let as_forh = ov.as(match_cmd_cmd_0, 'forh');
		check_forh(as_forh, modules, vars, errors, known_types);
		cmd.cmd = DC(ov.mk('forh', as_forh));
	} else if (ov.is(match_cmd_cmd_0, 'loop')) {
		let as_loop = ov.as(match_cmd_cmd_0, 'loop');
		break_continue_block(as_loop, modules, vars, errors, known_types);
		cmd.cmd = DC(ov.mk('loop', as_loop));
	} else if (ov.is(match_cmd_cmd_0, 'rep')) {
		let as_rep = ov.as(match_cmd_cmd_0, 'rep');
		check_rep(as_rep, modules, vars, errors, known_types);
		cmd.cmd = DC(ov.mk('rep', as_rep));
	} else if (ov.is(match_cmd_cmd_0, 'while')) {
		let as_while = ov.as(match_cmd_cmd_0, 'while');
		check_while(as_while, modules, vars, errors, known_types);
		cmd.cmd = ov.mk('while', as_while);
	} else if (ov.is(match_cmd_cmd_0, 'if_mod')) {
		let if_mod = ov.as(match_cmd_cmd_0, 'if_mod');
		let vars_op = vars;
		let if_cond_type = check_val(if_mod.cond, modules, vars_op, errors, known_types);
		if (!(ptd_system.is_condition_type(if_cond_type, modules, errors))) {
			add_error(errors, 'if argument should be boolean type instead of ' +
				get_print_tct_type_name(if_cond_type.type));
		}
		check_cmd(if_mod.cmd, modules, vars_op, errors, known_types);
		join_vars(vars, vars_op, modules, errors, known_types);
		cmd.cmd = DC(ov.mk('if_mod', if_mod));
	} else if (ov.is(match_cmd_cmd_0, 'unless_mod')) {
		let unless_mod = ov.as(match_cmd_cmd_0, 'unless_mod');
		let unless_cond_type = check_val(unless_mod.cond, modules, vars, errors, known_types);
		if (!(ptd_system.is_condition_type(unless_cond_type, modules, errors))) {
			add_error(errors, 'unless argument should be boolean type instead of ' +
				get_print_tct_type_name(unless_cond_type.type));
		}
		let vars_op = DC(vars);
		check_cmd(unless_mod.cmd, modules, vars_op, errors, known_types);
		join_vars(vars, vars_op, modules, errors, known_types);
		cmd.cmd = DC(ov.mk('unless_mod', unless_mod));
	} else if (ov.is(match_cmd_cmd_0, 'break')) {
		if (!modules.env.breaks.is) {
			add_error(errors, 'command break can be used only in cyclic block');
		} else {
			let tmp = modules.env.breaks.vars;
			join_vars(tmp, vars, modules, errors, known_types);
			modules.env.breaks.vars = DC(tmp);
		}
	} else if (ov.is(match_cmd_cmd_0, 'continue')) {
		if (!modules.env.breaks.is) {
			add_error(errors, 'command continue can be used only in cyclic block');
		} else {
			let tmp = modules.env.breaks.vars;
			join_vars(tmp, vars, modules, errors, known_types);
			modules.env.breaks.vars = DC(tmp);
		}
	} else if (ov.is(match_cmd_cmd_0, 'match')) {
		let as_match = ov.as(match_cmd_cmd_0, 'match');
		vars = { ...check_match(as_match, modules, vars, errors, known_types) };
		cmd.cmd = DC(ov.mk('match', as_match));
	} else if (ov.is(match_cmd_cmd_0, 'value')) {
		let val = ov.as(match_cmd_cmd_0, 'value');
		check_val(val, modules, vars, errors, known_types);
	} else if (ov.is(match_cmd_cmd_0, 'return')) {
		let as_return = ov.as(match_cmd_cmd_0, 'return');
		let ret_type = check_val(as_return, modules, vars, errors, known_types);
		if (tct.is_own_type(ret_type.type, known_types)) {
			add_error(errors, 'can\'t return own value');
		} else if (ov.is(modules.env.ret_type, 'tct_void') && !ov.is(ret_type.type, 'tct_empty')) {
			add_error(errors, 'can\'t return value in void function');
		} else if (!ov.is(modules.env.ret_type, 'tct_void') && !ov.is(modules.env.ret_type, 'tct_im') && ov.is(ret_type.
			type,
			'tct_empty')) {
			add_error(errors, 'must be returned value in non void function');
		} else if (!ov.is(modules.env.ret_type, 'tct_void') && !ov.is(ret_type.type, 'tct_empty')) {
			let check_info = ptd_system.check_assignment(modules.env.ret_type, ret_type, modules, errors);
			if (ov.is(check_info, 'err')) {
				add_error(errors, 'return value has the wrong type: ' + get_print_check_info(check_info));
			}
		}
		set_end_function(vars, errors, cmd.debug.end);
	} else if (ov.is(match_cmd_cmd_0, 'block')) {
		let block = ov.as(match_cmd_cmd_0, 'block');
		for (let i = 0; i < array.len(block.cmds); i++) {
			const r = check_cmd(block.cmds[i], modules, vars, errors, known_types);
			for (const [var_name, var_] of Object.entries(r)) {
				add_var_to_vars(var_, vars, errors);
			}
		}
		for (let i = 0; i < array.len(block.cmds); i++) {
			if (ov.is(block.cmds[i].cmd, 'var_decl')) {
				let var_decl = ov.as(block.cmds[i].cmd, 'var_decl');
				var_decl.tct_type = vars[var_decl.name].type;
				block.cmds[i].cmd = ov.mk('var_decl', var_decl);
			}
		}
		cmd.cmd = DC(ov.mk('block', block));
	} else if (ov.is(match_cmd_cmd_0, 'die')) {
		let as_die = ov.as(match_cmd_cmd_0, 'die');
		for (const arg of as_die) {
			check_val(arg, modules, vars, errors, known_types);
		}
		set_end_function(vars, errors, cmd.debug.end);
	} else if (ov.is(match_cmd_cmd_0, 'var_decl')) {
		let var_decl = ov.as(match_cmd_cmd_0, 'var_decl');
		hash.set_value(ret, var_decl.name, check_var_decl(var_decl, modules, vars, errors, known_types));
	} else if (ov.is(match_cmd_cmd_0, 'try')) {
		let as_try = ov.as(match_cmd_cmd_0, 'try');
		let type = { type: modules.env.ret_type, src: ov.mk('speculation') };
		if (!(ptd_system.is_try_ensure_type(type, modules, errors))) {
			add_error(errors, 'function in which is used \'try\' must return variant: ok, err ');
		}
		let vars_err_type = check_try_ensure(as_try, modules, vars, errors, known_types);
		let ok_err_types = ptd_system.try_get_ensure_sub_types({ type: modules.env.ret_type, src: ov.mk('known') },
			modules, errors);
		let check_info = ptd_system.check_assignment(ok_err_types.err, vars_err_type.err_type, modules, errors);
		if (ov.is(check_info, 'err')) {
			add_error(errors, 'the return value have the wrong type: ' + get_print_check_info(check_info));
		}
		ret = DC(vars_err_type.vars);
	} else if (ov.is(match_cmd_cmd_0, 'ensure')) {
		let as_ensure = ov.as(match_cmd_cmd_0, 'ensure');
		let vars_err_type = check_try_ensure(as_ensure, modules, vars, errors, known_types);
		ret = DC(vars_err_type.vars);
	} else if (ov.is(match_cmd_cmd_0, 'nop')) {
	}
	for (const [var_name, var_] of Object.entries(b_vars)) {
		const v = hash.get_value(vars, var_name);
		v.endPlace = cmd.debug.end;
		hash.set_value(b_vars, var_name, v);
	}
	if (hash.has_key(vars, '__END')) {
		hash.set_value(b_vars, '__END', new_var_decl('__END', tct.empty(), ov.mk('none'), true));
	}
	return ret;
}

function break_continue_block(cmd, modules, vars, errors, known_types) {
	let old = { ...modules.env.breaks };
	modules.env.breaks = { is: true, vars: DC(vars) };
	check_cmd(cmd, modules, vars, errors, known_types);
	join_vars(vars, modules.env.breaks.vars, modules, errors, known_types);
	modules.env.breaks = DC(old);
}

function check_try_ensure(try_ensure, modules, vars, errors, known_types) {
	let ret = {};
	let err_type = { type: tct.empty(), src: ov.mk('speculation') };
	let ok_type = tct.tct_im();
	let match_try_ensure_0 = try_ensure;
	if (ov.is(match_try_ensure_0, 'decl')) {
		let decl = ov.as(match_try_ensure_0, 'decl');
		let ok_err_types = check_var_decl_try(decl, true, modules, vars, errors, known_types);
		hash.set_value(ret, decl.name, ok_err_types.ok);
		err_type = ok_err_types.err;
		ok_type = ok_err_types.ok.type;
	} else if (ov.is(match_try_ensure_0, 'lval')) {
		let lval = ov.as(match_try_ensure_0, 'lval');
		let type = check_val(lval.right, modules, vars, errors, known_types);
		let err_left_len = array.len(errors.errors[errors.module]);
		let left_type = get_type_left_side_equation(lval.left, modules, vars, errors, known_types);
		err_left_len = array.len(errors.errors[errors.module]) - err_left_len;
		if (err_left_len == 0) {
			let ok_err_types = ptd_system.try_get_ensure_sub_types(type, modules, errors);
			type.type = ok_err_types.ok;
			set_type_to_lval(lval.left, left_type, type, modules, vars, errors, known_types);
			err_type = { type: ok_err_types.err, src: type.src };
			ok_type = ok_err_types.ok;
		}
	} else if (ov.is(match_try_ensure_0, 'expr')) {
		let expr = ov.as(match_try_ensure_0, 'expr');
		let type = check_val(expr, modules, vars, errors, known_types);
		let ok_err_types = ptd_system.try_get_ensure_sub_types(type, modules, errors);
		err_type = { type: ok_err_types.err, src: type.src };
		ok_type = ok_err_types.ok;
	}
	if ((ov.is(err_type.type, 'tct_empty') && ov.is(ok_type, 'tct_empty'))) {
		add_error(errors, 'empty, no value used as variant in try/ensure');
	}
	return { vars: ret, err_type: err_type };
}

function check_forh(as_forh, modules, vars, errors, known_types) {
	let hash_type = ptd_system.can_delete(check_val(as_forh.hash, modules, vars, errors, known_types), modules, errors);
	if (ptd_system.is_accepted(hash_type, tct.hash(tct.tct_im()), modules, errors) || ptd_system.is_accepted(hash_type,
		tct.own_hash(tct.empty()), modules, errors)) {
	} else if (ptd_system.is_accepted(hash_type, tct.rec({}), modules, errors) || ptd_system.is_accepted(hash_type, tct.own_rec({
	}), modules, errors)) {
		if (is_known(hash_type)) {
			add_error(errors, 'forh argument should be a hash not rec');
		}
	} else {
		add_error(errors, 'forh argument should be a hash type instead of ' + get_print_tct_type_name(hash_type.type));
	}
	let match_as_forh_val_mod = as_forh.val_mod;
	if (ov.is(match_as_forh_val_mod, 'none')) {
		if (tct.is_own_type(hash_type.type, known_types)) {
			add_error(errors, 'value iterator of own hash has to be ref');
		}
	} else if (ov.is(match_as_forh_val_mod, 'ref')) {
		if (!tct.is_own_type(hash_type.type, known_types)) {
			add_error(errors, 'value iterator of non-own hash cannot be ref');
		}
	}
	if (ov.is(hash_type.type, 'tct_hash')) {
		hash_type.type = ov.as(hash_type.type, 'tct_hash');
	} else if (ov.is(hash_type.type, 'tct_own_hash')) {
		hash_type.type = ov.as(hash_type.type, 'tct_own_hash');
	} else {
		hash_type.type = tct.tct_im();
	}
	let vars_op = DC(vars);
	add_var_decl_with_type_and_check(as_forh.key, { type: tct.string(), src: ov.mk('speculation') }, vars_op, errors);
	add_var_decl_with_type_and_check(as_forh.val, hash_type, vars_op, errors);
	let var_tab = [];
	let match_as_forh_val_mod_0 = as_forh.val_mod;
	if (ov.is(match_as_forh_val_mod_0, 'none')) {
	} else if (ov.is(match_as_forh_val_mod_0, 'ref')) {
		var_tab = rec_get_var_from_lval(as_forh.hash, errors);
		vars[ov.as(var_tab[0], 'var')].referenced_by = ov.mk('variable', as_forh.val.name);
	}
	break_continue_block(as_forh.cmd, modules, vars_op, errors, known_types);
	let match_as_forh_val_mod_1 = as_forh.val_mod;
	if (ov.is(match_as_forh_val_mod_1, 'none')) {
	} else if (ov.is(match_as_forh_val_mod_1, 'ref')) {
		vars[ov.as(var_tab[0], 'var')].referenced_by = ov.mk('none');
	}
	join_vars(vars, vars_op, modules, errors, known_types);
}

function check_fora(as_fora, modules, vars, errors, known_types) {
	let fora_arr_type = ptd_system.can_delete(check_val(as_fora.array, modules, vars, errors, known_types), modules,
		errors);
	if (!ptd_system.is_accepted(fora_arr_type, tct.arr(tct.tct_im()), modules, errors) &&
		!ptd_system.is_accepted(fora_arr_type, tct.own_arr(tct.empty()), modules, errors)) {
		add_error(errors, 'fora argument should be an array instead of ' + get_print_tct_type_name(fora_arr_type.type));
	}
	if (ov.is(fora_arr_type.type, 'tct_arr')) {
		fora_arr_type.type = ov.as(fora_arr_type.type, 'tct_arr');
	} else if (ov.is(fora_arr_type.type, 'tct_own_arr')) {
		fora_arr_type.type = ov.as(fora_arr_type.type, 'tct_own_arr');
	} else {
		fora_arr_type.type = tct.tct_im();
	}
	let vars_op = DC(vars);
	add_var_decl_with_type_and_check(as_fora.iter, fora_arr_type, vars_op, errors);
	break_continue_block(as_fora.cmd, modules, vars_op, errors, known_types);
	join_vars(vars, vars_op, modules, errors, known_types);
}

function check_while(as_while, modules, vars, errors, known_types) {
	let cond_type = check_val(as_while.cond, modules, vars, errors, known_types);
	if (!(ptd_system.is_condition_type(cond_type, modules, errors))) {
		add_error(errors, 'while argument should be boolean type insteand of ' + get_print_tct_type_name(cond_type.type));
	}
	let vars_op = DC(vars);
	break_continue_block(as_while.cmd, modules, vars_op, errors, known_types);
	join_vars(vars, vars_op, modules, errors, known_types);
}

function check_rep(as_rep, modules, vars, errors, known_types) {
	let count_type = check_val(as_rep.count, modules, vars, errors, known_types);
	if (!(ptd_system.is_accepted(count_type, tct.int(), modules, errors))) {
		add_error(errors, 'rep argument should be a number instead of ' + get_print_tct_type_name(count_type.type));
	}
	let vars_op = DC(vars);
	add_var_decl_with_type_and_check(as_rep.iter, { type: tct.int(), src: ov.mk('speculation') }, vars_op, errors);
	break_continue_block(as_rep.cmd, modules, vars_op, errors, known_types);
	join_vars(vars, vars_op, modules, errors, known_types);
}

function check_match(as_match, modules, vars, errors, known_types) {
	let val_type = ptd_system.can_delete(check_val(as_match.val, modules, vars, errors, known_types), modules, errors);
	let branches = as_match.branch_list;
	let type_is_match = false;
	let branch_var_types = {};
	let variants = {};
	if (!ptd_system.is_accepted(val_type, tct.var_({}), modules, errors) &&
		!ptd_system.is_accepted(val_type, tct.own_var({}), modules, errors)) {
		add_error(errors, 'wrong type used as match argument: ' + get_print_tct_type_name(val_type.type));
	}
	if (ov.is(val_type.type, 'tct_var') || ov.is(val_type.type, 'tct_own_var')) {
		if (ov.is(val_type.type, 'tct_var')) {
			variants = ov.as(val_type.type, 'tct_var');
		} else {
			variants = ov.as(val_type.type, 'tct_own_var');
		}
		let used_variants = {};
		for (const branch of branches) {
			let variant_name = branch.variant.name;
			if (!hash.has_key(variants, variant_name)) {
				if (is_known(val_type)) {
					add_error(errors, `variant definition \`:${variant_name}\' does not exist`);
				}
				continue;
			}
			hash.set_value(used_variants, variant_name, true);
			let match_hash_get_value_variants_variant_name_0 = hash.get_value(variants, variant_name);
			if (ov.is(match_hash_get_value_variants_variant_name_0, 'with_param')) {
				let param_type = ov.as(match_hash_get_value_variants_variant_name_0, 'with_param');
				hash.set_value(branch_var_types, variant_name, param_type);
			} else if (ov.is(match_hash_get_value_variants_variant_name_0, 'no_param')) {
			}
		}
		for (const [name, type] of Object.entries(variants)) {
			if (!hash.has_key(used_variants, name)) {
				add_error(errors, 'unchecked match variants: ' + name);
			}
		}
		type_is_match = true;
	}
	let vars_op = DC(vars);
	let first = true;
	let hash_b = {};
	for (let i = 0; i < array.len(branches); i++) {
		let branch = branches[i];
		let vars_case = DC(vars);
		let variant_name = branch.variant.name;
		if ((hash.has_key(hash_b, variant_name))) {
			add_error(errors, 'repeated the case name in match: ' + variant_name);
		}
		hash.set_value(hash_b, variant_name, 1);
		let match_branch_variant_value_1 = branch.variant.value;
		if (ov.is(match_branch_variant_value_1, 'value')) {
			let var_decl = ov.as(match_branch_variant_value_1, 'value');
			check_var_decl(var_decl.declaration, modules, vars_case, errors, known_types);
			let branch_var_type;
			if (type_is_match) {
				if ((!hash.has_key(variants, variant_name))) {
					continue;
				}
				if (!hash.has_key(branch_var_types, variant_name)) {
					add_error(errors, 'variant `:' + variant_name + '\' should has no param');
					continue;
				}
				branch_var_type = hash.get_value(branch_var_types, variant_name);
			} else {
				branch_var_type = tct.tct_im();
			}
			add_var_decl_to_vars(tct.tct_im(), var_decl.declaration.name, vars_case, errors, var_decl.declaration.place);
			set_type_to_variable(vars_case, var_decl.declaration.name, branch_var_type, errors, var_decl.declaration.place);
			let match_var_decl_mod = var_decl.mod;
			if (ov.is(match_var_decl_mod, 'none')) {
				if (tct.is_own_type(val_type.type, known_types)) {
					add_error(errors, 'case param of own variant has to be ref');
				}
			} else if (ov.is(match_var_decl_mod, 'ref')) {
				if (!tct.is_own_type(val_type.type, known_types)) {
					add_error(errors, 'case param of non-own variant cannot be ref');
				}
				vars_case[ov.as(as_match.val.value, 'var')].referenced_by = ov.mk('variable', var_decl.declaration.name);
			}
		} else if (ov.is(match_branch_variant_value_1, 'none')) {
			if (hash.has_key(branch_var_types, variant_name)) {
				add_error(errors, 'variant `:' + variant_name + ' should has param');
			}
		}
		check_cmd(as_match.branch_list[i].cmd, modules, vars_case, errors, known_types);
		let match_branch_variant_value_2 = branch.variant.value;
		if (ov.is(match_branch_variant_value_2, 'value')) {
			let var_decl = ov.as(match_branch_variant_value_2, 'value');
			var_decl.declaration.tct_type = vars_case[var_decl.declaration.name].type;
			as_match.branch_list[i].variant.value = ov.mk('value', var_decl);
			if (!(hash.has_key(vars_op, var_decl.declaration.name))) {
				hash.delete(vars_case, var_decl.declaration.name);
			}
		} else if (ov.is(match_branch_variant_value_2, 'none')) {
		}
		if (ov.is(as_match.val.value, 'var')) {
			vars_case[ov.as(as_match.val.value, 'var')].referenced_by = ov.mk('none');
		}
		if (first) {
			ObjectAssignInPlace(vars_op, vars_case);
		} else {
			join_vars(vars_op, vars_case, modules, errors, known_types);
		}
		first = false;
	}
	return vars_op;
}

function check_val(val, modules, vars, errors, known_types) {
	let ret = tc_types.get_default_type();
	let match_val_value_0 = val.value;
	errors.current_debug = val.debug;
	if (ov.is(match_val_value_0, 'ternary_op')) {
		let ternary_op = ov.as(match_val_value_0, 'ternary_op');
		let cond_type = check_val(ternary_op.fst, modules, vars, errors, known_types);
		if (!(ptd_system.is_condition_type(cond_type, modules, errors))) {
			add_error(errors, `ternary op first argument should be boolean type instead of ${get_print_tct_type_name(cond_type.type)}`, ternary_op.fst.debug);
		}
		let rt = check_val(ternary_op.snd, modules, vars, errors, known_types).type;
		if (ov.is(rt, 'tct_void')) {
			ret.type = rt;
		} else {
			let rt2 = check_val(ternary_op.thrd, modules, vars, errors, known_types).type;
			if (ov.is(rt2, 'tct_void')) {
				ret.type = rt2;
			} else {
				ret.type = ptd_system.cross_type(rt, rt2, modules, errors, known_types);
			}
		}
	} else if (ov.is(match_val_value_0, 'hash_key')) {
		let hash_key = ov.as(match_val_value_0, 'hash_key');
		ret.type = tct.string();
	} else if (ov.is(match_val_value_0, 'nop')) {
		ret.type = tct.empty();
	} else if (ov.is(match_val_value_0, 'parenthesis')) {
		let parenthesis = ov.as(match_val_value_0, 'parenthesis');
		return check_val(parenthesis, modules, vars, errors, known_types);
	} else if (ov.is(match_val_value_0, 'variant')) {
		let variant = ov.as(match_val_value_0, 'variant');
		if (variant.name === 'TRUE' || variant.name === 'FALSE') {
			ret.type = tct.bool();
			return ret;
		}
		let ret_variants = {};
		if (ov.is(variant.var.value, 'nop')) {
			hash.set_value(ret_variants, variant.name, tct.none());
		} else {
			let ty = check_val(variant.var, modules, vars, errors, known_types);
			hash.set_value(ret_variants, variant.name, ty.type);
			ret.src = ty.src;
		}
		ret.type = tct.var_(ret_variants);
	} else if (ov.is(match_val_value_0, 'const')) {
		let as_const = ov.as(match_val_value_0, 'const');
		ret.type = tct.int();
	} else if (ov.is(match_val_value_0, 'bool')) {
		let as_bool = ov.as(match_val_value_0, 'bool');
		ret.type = tct.bool();
	} else if (ov.is(match_val_value_0, 'arr_decl')) {
		let arr_decl = ov.as(match_val_value_0, 'arr_decl');
		if (array.len(arr_decl) == 0) {
			ret.type = tct.arr(tct.empty());
			return ret;
		}
		let types = [];
		for (const dec of arr_decl) {
			let t = check_val(dec, modules, vars, errors, known_types);
			array.push(types, t);
		}
		let rt = types[0].type;
		for (let i = 1; i < array.len(types); ++i) {
			rt = ptd_system.cross_type(rt, types[i].type, modules, errors, known_types);
		}
		ret.type = tct.arr(rt);
	} else if (ov.is(match_val_value_0, 'hash_decl')) {
		let hash_decl = ov.as(match_val_value_0, 'hash_decl');
		let rt = {};
		for (const el of hash_decl) {
			let label = ov.as(el.key.value, 'hash_key');
			let ty = check_val(el.val, modules, vars, errors, known_types);
			hash.set_value(rt, label, ty);
		}
		let retur = {};
		for (const [key, ty] of Object.entries(rt)) {
			hash.set_value(retur, key, ty.type);
		}
		ret.type = tct.rec(retur);
	} else if (ov.is(match_val_value_0, 'var')) {
		let variable_name = ov.as(match_val_value_0, 'var');
		if (!hash.has_key(vars, variable_name)) {
			add_error(errors, `variable \'${variable_name}\' does not exist`);
			return ret;
		}
		let var_ = hash.get_value(vars, variable_name);
		let match_var_referenced_by = var_.referenced_by;

		const place = placeToIndex(val.debug.begin);
		const defPlace = placeToIndex(var_.defPlace);
		errors.varPositions[errors.module][place] = { ref: var_.defPlace };
		errors.varPositions[errors.module][defPlace] ??= { def: var_ };
		errors.varPositions[errors.module][defPlace].def.refs ??= {};
		errors.varPositions[errors.module][defPlace].def.refs[place] = 1;

		if (ov.is(match_var_referenced_by, 'variable')) {
			let name = ov.as(match_var_referenced_by, 'variable');
			add_error(errors, `variable \'${variable_name}\' cannot be accessed, because it is referenced by \'${name}\'`);
			return ret;
		} else if (ov.is(match_var_referenced_by, 'none')) {
		}
		let match_var_overwrited_3 = var_.overwrited;
		if (ov.is(match_var_overwrited_3, 'yes')) {
			return { type: var_.type, src: ov.mk('speculation') };
		} else if (ov.is(match_var_overwrited_3, 'no')) {
			return { type: var_.type, src: ov.mk('known') };
		}
	} else if (ov.is(match_val_value_0, 'bin_op')) {
		let bin_op = ov.as(match_val_value_0, 'bin_op');
		return get_type_from_bin_op_and_check(bin_op, modules, vars, errors, known_types);
	} else if (ov.is(match_val_value_0, 'unary_op')) {
		let unary_op = ov.as(match_val_value_0, 'unary_op');
		errors.current_debug = unary_op.val.debug;
		let type = check_val(unary_op.val, modules, vars, errors, known_types);
		if (unary_op.op === '!') {
			if (!ptd_system.is_condition_type(type, modules, errors)) {
				add_error(errors, `incorrect type of argument operator \'!\' : ${get_print_tct_type_name(type.type)}`);
			}
			ret.type = tct.bool();
			return ret;
		} else if (unary_op.op === '@') {
			if (!ptd_system.is_accepted(type, tct.func(), modules, errors)) {
				add_error(errors, `incorrect type of argument operator \'${unary_op.op}\' : ${get_print_tct_type_name(type.type)}`);
			}
			ret.type = tct.var_({ ref: tct.func() });
			return ret;
		} else if (unary_op.op === '--' || unary_op.op === '++') {
			return unary_op_dec_inc(unary_op.val, `incorrect type of argument operator \'${unary_op.op}\' : `,
				modules, vars, errors, known_types);
		} else {
			if (!ptd_system.is_accepted(type, tct.int(), modules, errors)) {
				add_error(errors, `incorrect type of argument operator \'${unary_op.op}\' : ${get_print_tct_type_name(type.type)}`);
			}
		}
		ret.type = tct.int();
	} else if (ov.is(match_val_value_0, 'fun_label')) {
		let fun_label = ov.as(match_val_value_0, 'fun_label');
		if (!(check_function_exists(fun_label.module, fun_label.name, modules, errors))) {
			return ret;
		}
		if (takes_own_arg(get_function(fun_label.module, fun_label.name, modules), known_types)) {
			add_error(errors, 'cannot reference functions which takes own argument');
		}
		ret.type = tct.func();
	} else if (ov.is(match_val_value_0, 'fun_val')) {
		let fun_val = ov.as(match_val_value_0, 'fun_val');
		ret = check_fun_val(fun_val, modules, vars, errors, known_types);
	} else if (ov.is(match_val_value_0, 'string')) {
		let str = ov.as(match_val_value_0, 'string');
		ret.type = tct.string();
	} else if (ov.is(match_val_value_0, 'post_inc')) {
		let inc = ov.as(match_val_value_0, 'post_inc');
		return unary_op_dec_inc(inc, 'wrong type in post increment : ', modules, vars, errors, known_types);
	} else if (ov.is(match_val_value_0, 'post_dec')) {
		let dec = ov.as(match_val_value_0, 'post_dec');
		return unary_op_dec_inc(dec, 'wrong type in post decrement : ', modules, vars, errors, known_types);
	}
	return ret;
}

function check_fun_val(fun_val, modules, vars, errors, known_types) {
	let ret = tc_types.get_default_type();
	let args_values_types = [];
	for (const fun_val_arg of fun_val.args) {
		array.push(args_values_types, check_val(fun_val_arg.val, modules, vars, errors, known_types));
	}
	errors.current_debug = fun_val.debug;
	let fun_def = get_special_function_def(fun_val.module, fun_val.name);
	let is_spec = false;
	let match_fun_def_access_0 = fun_def.access;
	if (ov.is(match_fun_def_access_0, 'pub')) {
		is_spec = true;
		if (!hash.has_key(modules.imports, fun_val.module)) {
			add_error(errors, 'module \'' + fun_val.module + '\' not imported');
			hash.set_value(modules.imports, fun_val.module, false);
		}
	} else if (ov.is(match_fun_def_access_0, 'priv')) {
		if (!(check_function_exists(fun_val.module, fun_val.name, modules, errors))) {
			return ret;
		}
		fun_def = get_function_def(fun_val.module, fun_val.name, modules);
	}
	if (array.len(fun_val.args) != array.len(fun_def.args)) {
		add_error(errors, 'wrong number ' + array.len(fun_val.args) + ' of function arguments : ' +
			get_function_name(fun_val.module, fun_val.name));
		return ret;
	}
	let prev_ref = {};
	for (let i = 0; i < array.len(fun_val.args); i++) {
		let fun_val_arg = fun_val.args[i];
		let fun_def_arg = fun_def.args[i];
		if (
			!(ov.eq_safe(fun_def_arg.mod, fun_val_arg.mod) ||
				(ov.eq_safe(fun_def_arg.mod, ov.mk('fun')) && ov.eq_safe(fun_val_arg.mod, ov.mk('none'))))) {
			add_error(errors, 'arg no. ' + (i + 1) + ' \'' + fun_def_arg.name + '\' ref mismatched with function prototype');
		}
		let check_info;
		if (is_spec) {
			let ist = args_values_types[i];
			ist.src = ov.mk('speculation');
			check_info = ptd_system.is_accepted_info(ist, fun_def_arg.type, modules, errors);
		} else {
			if (ov.is(fun_def_arg.mod, 'ref')) {
				let err_len = array.len(errors.errors[errors.module]);
				let var_tab = rec_get_var_from_lval(fun_val_arg.val, errors);
				if (err_len == array.len(errors.errors[errors.module])) {
					let var_name = ov.as(var_tab[0], 'var');
					if (hash.has_key(prev_ref, var_name)) {
						if (tct.is_own_type(vars[var_name].type, known_types)) {
							add_error(errors, 'many ref-arguments come from the same own-type variable: ' + var_name);
						} else {
							add_warning(errors, 'many ref-arguments come from the same variable: ' + var_name);
						}
					}
					hash.set_value(prev_ref, var_name, 0);
					set_type_to_lval(fun_val_arg.val, args_values_types[i], {
						type: fun_def_arg.type,
						src: ov.mk('known')
					}, modules, vars, errors, known_types);
				}
			}
			check_info = ptd_system.check_assignment(fun_def_arg.type, args_values_types[i], modules, errors);
		}
		if (ov.is(check_info, 'err')) {
			add_error(errors, `In function call: ${get_function_name(fun_val.module, fun_val.name)} argument no.${i + 1} \'${fun_def_arg.name}\' has invalid type: ${get_print_check_info(check_info)}`);
		}
	}
	return check_special_function({ type: fun_def.ret_type, src: ov.mk('known') }, fun_val, args_values_types, modules,
		vars, errors, known_types);
}

function unary_op_dec_inc(type, err_str, modules, vars, errors, known_types) {
	let vtype = check_val(type, modules, vars, errors, known_types);
	if (!ptd_system.is_accepted(vtype, tct.int(), modules, errors)) {
		add_error(errors, err_str + get_print_tct_type_name(vtype.type));
	}
	vtype.type = tct.int();
	let err_left_len = array.len(errors.errors[errors.module]);
	let left_type = get_type_left_side_equation(type, modules, vars, errors, known_types);
	if (array.len(errors.errors[errors.module]) - err_left_len > 0) {
		return left_type;
	}
	return set_type_to_lval(type, left_type, vtype, modules, vars, errors, known_types);
}

const special_functions = {
	'ptd::ensure': {
		r: tct.tct_im(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.tct_im(), name: '' }]
	},
	'ptd::try_cast': {
		r: tct.var_({ok: ov.mk('tct_var_none'), err: ov.mk('tct_var_none')}),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.tct_im(), name: ''}]
	},
	'ptd::ensure_only_static_do_not_touch_without_permission':  {
		r: tct.tct_im(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.tct_im(), name: '' }]
	},
	'ptd::int_to_string':  { r: tct.string(), a: [{ mod: ov.mk('none'), type: tct.int(), name: '' }] },
	'array::push':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('ref'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }
		]
	},
	'array::insert':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('ref'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' },
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }
		]
	},
	'array::remove':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('ref'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' }
		]
	},
	'array::subarray':  {
		r: tct.arr(tct.tct_im()),
		a: [
			{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' }
		]
	},
	'array::join':  {
		r: tct.string(),
		a: [
			{ mod: ov.mk('none'), type: tct.string(), name: '' },
			{ mod: ov.mk('none'), type: tct.arr(tct.string()), name: '' }
		]
	},
	'array::append':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('ref'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' }
		]
	},
	'array::len':  { r: tct.int(), a: [{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' }] },
	'array::sort':  { r: tct.void_(), a: [{ mod: ov.mk('ref'), type: tct.tct_im(), name: '' }] },
	'array::pop':  { r: tct.void_(), a: [{ mod: ov.mk('ref'), type: tct.arr(tct.tct_im()), name: '' }] },
	'array::equal':  {
		r: tct.bool(),
		a: [
			{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' }
		]
	},
	'array::part_sort':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' },
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' },
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' },
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }
		]
	},
	'own_array::len':  {
		r: tct.int(),
		a: [{ mod: ov.mk('ref'), type: tct.own_arr(tct.empty()), name: '' }]
	},
	'hash::set_value':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('ref'), type: tct.hash(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.string(), name: '' },
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }
		]
	},
	'hash::get_value':  {
		r: tct.tct_im(),
		a: [
			{ mod: ov.mk('none'), type: tct.hash(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.string(), name: '' }
		]
	},
	'hash::has_key':  {
		r: tct.bool(),
		a: [
			{ mod: ov.mk('none'), type: tct.hash(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.string(), name: '' }
		]
	},
	'hash::delete':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('ref'), type: tct.hash(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.string(), name: '' }
		]
	},
	'hash::size':  { r: tct.int(), a: [{ mod: ov.mk('none'), type: tct.hash(tct.tct_im()), name: '' }] },
	'hash::values':  {
		r: tct.arr(tct.tct_im()),
		a: [{ mod: ov.mk('none'), type: tct.hash(tct.tct_im()), name: '' }]
	},
	'hash::keys':  {
		r: tct.arr(tct.string()),
		a: [{ mod: ov.mk('none'), type: tct.hash(tct.tct_im()), name: '' }]
	},
	'hash::add_all':  {
		r: tct.void_(),
		a: [
			{ mod: ov.mk('ref'), type: tct.hash(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.hash(tct.tct_im()), name: '' }
		]
	},
	'ov::is':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.var_({}), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'ov::as':  {
		r: tct.tct_im(),
		a: [{ mod: ov.mk('none'), type: tct.var_({}), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'dfile::ssave':  { r: tct.string(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'dfile::sload_with_type':  {
		r: tct.tct_im(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_std_lib::fast_substr':  {
		r: tct.string(),
		a: [
			{ mod: ov.mk('none'), type: tct.arr(tct.string()), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' }
		]
	},
	'c_std_lib::int_to_string':  {
		r: tct.string(),
		a: [{ mod: ov.mk('none'), type: tct.int(), name: '' }]
	},
	'c_std_lib::string_to_int':  {
		r: tct.int(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_std_lib::try_string_to_int':  {
		r: tct.var_({ ok: tct.int(), err: tct.string() }),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_std_lib::string_chr':  { r: tct.string(), a: [{ mod: ov.mk('none'), type: tct.int(), name: '' }] },
	'c_std_lib::string_ord':  { r: tct.int(), a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }] },
	'c_std_lib::string_length':  {
		r: tct.int(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_std_lib::string_index':  {
		r: tct.int(),
		a: [
			{ mod: ov.mk('none'), type: tct.string(), name: '' },
			{ mod: ov.mk('none'), type: tct.string(), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' }
		]
	},
	'c_std_lib::string_sub':  {
		r: tct.string(),
		a: [
			{ mod: ov.mk('none'), type: tct.string(), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' }
		]
	},
	'c_std_lib::string_get_char_code':  {
		r: tct.int(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.int(), name: '' }]
	},
	'c_std_lib::string_replace':  {
		r: tct.string(),
		a: [
			{ mod: ov.mk('none'), type: tct.string(), name: '' },
			{ mod: ov.mk('none'), type: tct.string(), name: '' },
			{ mod: ov.mk('none'), type: tct.string(), name: '' }
		]
	},
	'c_std_lib::string_compare':  {
		r: tct.int(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_std_lib::array_sub':  {
		r: tct.arr(tct.tct_im()),
		a: [
			{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' }
		]
	},
	'c_std_lib::array_len':  {
		r: tct.int(),
		a: [{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' }]
	},
	'c_std_lib::is_int':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_std_lib::is_string':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_std_lib::is_printable':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }]
	},
	'c_std_lib::is_array':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_std_lib::is_hash':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_std_lib::is_variant':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_std_lib::string_compare':  {
		r: tct.int(),
		a: [
			{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' },
			{ mod: ov.mk('none'), type: tct.arr(tct.tct_im()), name: '' }
		]
	},
	'c_std_lib::hash_has_key':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.tct_im(), name: '' }]
	},
	'c_std_lib::hash_size':  { r: tct.int(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::ov_is':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.tct_im(), name: '' }]
	},
	'c_rt_lib::priv_is':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.tct_im(), name: '' }]
	},
	'c_rt_lib::is_end_hash':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::get_ref_arr':  {
		r: tct.tct_im(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }, { mod: ov.mk('none'), type: tct.int(), name: '' }]
	},
	'c_rt_lib::set_ref_arr':  {
		r: tct.tct_im(),
		a: [
			{ mod: ov.mk('ref'), type: tct.tct_im(), name: '' },
			{ mod: ov.mk('none'), type: tct.int(), name: '' },
			{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }
		]
	},
	'c_rt_lib::array_len':  { r: tct.int(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::is_int':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::is_string':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::is_printable':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::is_array':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::is_hash':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::is_variant':  { r: tct.bool(), a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }] },
	'c_rt_lib::int_to_string':  { r: tct.string(), a: [{ mod: ov.mk('none'), type: tct.int(), name: '' }] },
	'c_rt_lib::str_float_eq':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_rt_lib::str_float_ne':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_rt_lib::str_float_lt':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_rt_lib::str_float_gt':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_rt_lib::str_float_leq':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_rt_lib::str_float_geq':  {
		r: tct.bool(),
		a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }, { mod: ov.mk('none'), type: tct.string(), name: '' }]
	},
	'c_olympic_io::print':  { r: tct.void_(), a: [{ mod: ov.mk('none'), type: tct.string(), name: '' }] },
	'c_olympic_io::readln':  { r: tct.string(), a: [] },
	'c_olympic_io::read_int':  { r: tct.int(), a: [] },
	'c_olympic_io::read_char':  { r: tct.string(), a: [] },
	'c_singleton::sigleton_do_not_use_without_approval':  {
		r: tct.tct_im(),
		a: [{ mod: ov.mk('none'), type: tct.tct_im(), name: '' }]
	}
};

function get_special_function_def(module, name) {
	let ret = {
		cmd: { debug: nast.empty_debug(), cmd: ov.mk('nop') },
		is_type: ov.mk('no'),
		ref_types: ov.mk('no'),
		name: name,
		module: module,
		access: ov.mk('pub'),
		args: [],
		ret_type: tct.tct_im()
	};
	name = get_function_name(module, name);
	if (hash.has_key(special_functions, name)) {
		let t = hash.get_value(special_functions, name);
		ret.args = t.a;
		ret.ret_type = t.r;
	} else {
		ret.access = ov.mk('priv');
	}
	return ret;
}

function check_special_function(ret_type, fun_val, fun_val_type, modules, vars, errors, known_types) {
	let name = get_function_name(fun_val.module, fun_val.name);
	if (name === 'ptd::ensure' || name === 'ptd::ensure_only_static_do_not_touch_without_permission' || name ===
		'ptd::ensure_with_cast') {
		let match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_1 = ptd_parser.try_value_to_ptd(fun_val.args[0].val);
		if (ov.is(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_1, 'err')) {
			let err = ov.as(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_1, 'err');
			add_error(errors, err);
			ret_type.type = tct.tct_im();
		} else if (ov.is(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_1, 'ok')) {
			let ok = ov.as(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_1, 'ok');
			let check_info = ptd_system.cast_type(ok, fun_val_type[1], modules, errors);
			if (ov.is(check_info, 'err')) {
				add_error(errors, 'this casting of type cannot be correct: ' + get_print_check_info(check_info));
			}
			ret_type.type = ok;
			check_types_imported(ok, modules, errors);
		}
	}
	if (name === 'own::to_im') {
		let type = fun_val_type[0];
		if (!tct.is_own_type(type.type, known_types)) {
			add_error(errors, 'own::to_im takes only own arguments');
		}
		ret_type.src = type.src;
		ret_type.type = tct.own_type_to_ptd(type.type, known_types);
	}
	if (name === 'ptd::try_cast') {
		let match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_2 = ptd_parser.try_value_to_ptd(fun_val.args[0].val);
		if (ov.is(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_2, 'err')) {
			let err = ov.as(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_2, 'err');
			add_error(errors, err);
			ret_type.type = tct.tct_im();
		} else if (ov.is(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_2, 'ok')) {
			let ok = ov.as(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_2, 'ok');
			if (!(check_function_exists(fun_val.module, fun_val.name, modules, errors))) {
				return ret_type;
			}
			let fun_def = get_function_def(fun_val.module, fun_val.name, modules);
			let ok_err_var = { type: fun_def.ret_type, src: ov.mk('known') };
			ret_type.type = ptd_system.can_delete(ok_err_var, modules, errors).type;
			if (ptd_system.is_try_ensure_type(ret_type, modules, errors)) {
				let ensure_err_type = tct.try_var_as_case(ret_type.type, 'err');
				if (ov.is(ensure_err_type, 'err')) throw new Error();
				let err_type = ov.as(ensure_err_type, 'ok');

				ret_type.type = tct.var_({ ok: ok, err: err_type });
			} else {
				add_error(errors, 'function ptd::try_cast must return variant: ok, err ');
			}
			check_types_imported(ok, modules, errors);
		}
	}
	if (name === 'array::push') {
		fun_val_type[1].type = tct.arr(fun_val_type[1].type);
		set_type_to_lval_spec(fun_val.args[0].val, fun_val_type[0], fun_val_type[1], tct.arr(tct.empty()), modules, vars, errors, known_types);
	}
	if (name === 'array::insert') {
		fun_val_type[2].type = tct.arr(fun_val_type[2].type);
		set_type_to_lval_spec(fun_val.args[0].val, fun_val_type[0], fun_val_type[2], tct.arr(tct.empty()), modules, vars, errors, known_types);
	}
	if (name === 'array::append') {
		set_type_to_lval_spec(fun_val.args[0].val, fun_val_type[0], fun_val_type[1], tct.arr(tct.empty()), modules, vars, errors, known_types);
	}
	if (name === 'array::subarray') {
		return fun_val_type[0];
	}
	if (name === 'hash::set_value') {
		fun_val_type[2].type = tct.hash(fun_val_type[2].type);
		set_type_to_lval_spec(fun_val.args[0].val, fun_val_type[0], fun_val_type[2], tct.rec({}), modules, vars, errors, known_types);
	}
	if (name === 'hash::delete') {
		let type = ptd_system.can_delete(fun_val_type[0], modules, errors);
		if (ov.is(type.type, 'tct_rec')) {
			let cross = type;
			cross.type = ptd_system.cross_type(tct.hash(tct.empty()), type.type, modules, errors, known_types);
			set_type_to_lval_spec(fun_val.args[0].val, type, cross, tct.rec({}), modules, vars, errors, known_types);
		}
	}
	if (name === 'hash::get_value') {
		let type = ptd_system.can_delete(fun_val_type[0], modules, errors);
		ret_type.src = type.src;
		if (ov.is(type.type, 'tct_hash')) {
			ret_type.type = ov.as(type.type, 'tct_hash');
		}
	}
	if (name === 'hash::values') {
		let type = ptd_system.can_delete(fun_val_type[0], modules, errors);
		ret_type.src = type.src;
		if (ov.is(type.type, 'tct_hash')) {
			ret_type.type = tct.arr(ov.as(type.type, 'tct_hash'));
		}
	}
	if (name === 'hash::add_all') {
		set_type_to_lval_spec(fun_val.args[0].val, fun_val_type[0], fun_val_type[1], tct.rec({}), modules, vars, errors, known_types);
	}
	if (name === 'ov::as') {
		ptd_system.check_assignment(tct.tct_im(), fun_val_type[0], modules, errors);
	}
	if (name === 'dfile::ssave') {
		ptd_system.check_assignment(tct.tct_im(), fun_val_type[0], modules, errors);
	}
	if (name === 'dfile::sload_with_type') {
		let match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_3 = ptd_parser.try_value_to_ptd(fun_val.args[0].val);
		if (ov.is(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_3, 'err')) {
			let err = ov.as(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_3, 'err');
			add_error(errors, err);
			ret_type.type = tct.tct_im();
		} else if (ov.is(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_3, 'ok')) {
			let ok = ov.as(match_ptd_parser_try_value_to_ptd_fun_val_args_0_val_3, 'ok');
			ret_type.type = ok;
		}
	}
	if (name === 'singleton::sigleton_do_not_use_without_approval') {
		return fun_val_type[0];
	}
	return ret_type;
}

function rec_get_var_from_lval(lval, errors) {
	let a = [];
	if (ov.is(lval.value, 'var')) {
		array.push(a, ov.mk('var', ov.as(lval.value, 'var')));
	} else if (ov.is(lval.value, 'bin_op')) {
		let bin_op = ov.as(lval.value, 'bin_op');
		if (bin_op.op === '->') {
			a = rec_get_var_from_lval(bin_op.left, errors);
			array.push(a, ov.mk('rec', ov.as(bin_op.right.value, 'hash_key')));
		} else if (bin_op.op === 'ARRAY_INDEX') {
			a = rec_get_var_from_lval(bin_op.left, errors);
			array.push(a, ov.mk('arr'));
		} else if (bin_op.op === 'HASH_INDEX') {
			a = rec_get_var_from_lval(bin_op.left, errors);
			array.push(a, ov.mk('hashkey'));
		} else if (bin_op.op === 'OV_AS') {
			let right_val = ov.as(bin_op.right.value, 'hash_key');
			a = rec_get_var_from_lval(bin_op.left, errors);
			a.push(ov.mk('variant', right_val));
		} else {
			add_error(errors, 'invalid operator ' + (bin_op.op) + ' used in lvalue');
		}
	} else if (ov.is(lval.value, 'parenthesis')) {
		a = rec_get_var_from_lval(ov.as(lval.value, 'parenthesis'), errors);
	} else {
		add_error(errors, 'invalid type for lvalue');
	}
	return a;
}

function mk_new_type_lval(var_tab, rtype, ltype, empty_type, modules, errors, known_types) {
	var_tab = array.subarray(var_tab, 1, array.len(var_tab) - 1);
	if (array.len(var_tab) == 0) {
		if (is_known(ltype)) {
			let check_info = ptd_system.check_assignment(ltype.type, rtype, modules, errors);
			if (ov.is(check_info, 'err')) {
				add_error(errors, 'invalid type in assignment: ' + get_print_check_info(check_info));
			}
			return ltype.type;
		} else {
			ptd_system.check_assignment(tct.tct_im(), rtype, modules, errors);
			ptd_system.can_create(ltype, modules, errors);
			if (ptd_system.is_equal(ltype.type, empty_type)) {
				return rtype.type;
			}
			return ptd_system.cross_type(ltype.type, rtype.type, modules, errors, known_types);
		}
	} else {
		ptd_system.can_create(ltype, modules, errors);
		let match_var_tab_0_0 = var_tab[0];
		if (ov.is(match_var_tab_0_0, 'var')) {
			let name = ov.as(match_var_tab_0_0, 'var');
			throw new Error({ var_tab });
		} else if (ov.is(match_var_tab_0_0, 'arr')) {
			if (!(ov.is(ltype.type, 'tct_arr'))) {
				return tct.tct_im();
			}
			ltype.type = ov.as(ltype.type, 'tct_arr');
			return tct.arr(mk_new_type_lval(var_tab, rtype, ltype, empty_type, modules, errors, known_types));
		} else if (ov.is(match_var_tab_0_0, 'hashkey')) {
			if (!(ov.is(ltype.type, 'tct_hash'))) {
				return tct.tct_im();
			}
			ltype.type = ov.as(ltype.type, 'tct_hash');
			return tct.hash(mk_new_type_lval(var_tab, rtype, ltype, empty_type, modules, errors, known_types));
		} else if (ov.is(match_var_tab_0_0, 'rec')) {
			let name = ov.as(match_var_tab_0_0, 'rec');
			if (!(ov.is(ltype.type, 'tct_rec'))) {
				return tct.tct_im();
			}
			let tt = ov.as(ltype.type, 'tct_rec');
			if (hash.has_key(tt, name)) {
				ltype.type = hash.get_value(tt, name);
				hash.set_value(tt, name, mk_new_type_lval(var_tab, rtype, ltype, empty_type, modules, errors,
					known_types));
			} else {
				if (array.len(var_tab) != 1) {
					return tct.tct_im();
				}
				ptd_system.check_assignment(tct.tct_im(), rtype, modules, errors);
				hash.set_value(tt, name, rtype.type);
			}
			return tct.rec(tt);
		} else if (ov.is(match_var_tab_0_0, 'variant')) {
			let label = ov.as(match_var_tab_0_0, 'variant');
			if (!(ov.is(ltype.type, 'tct_var'))) {
				return tct.tct_im();
			}
			let variant = ov.as(ltype.type, 'tct_var');
			if (hash.has_key(variant, label)) {
				ltype.type = ov.as((ov.as(ltype.type, 'tct_var'))[label], 'with_param');
				hash.set_value(variant, label, mk_new_type_lval(var_tab, rtype, ltype, empty_type, modules, errors,
					known_types));
			} else {
				if (array.len(var_tab) != 1) {
					return tct.tct_im();
				}
				ptd_system.check_assignment(tct.tct_im(), rtype, modules, errors);
				variant[label] = rtype.type;
			}
			return tct.var_(variant);
		}
	}
}

function set_type_to_lval(lval, ltype, rtype, modules, vars, errors, known_types) {
	let empty_type = ptd_system.can_delete(ltype, modules, errors);
	return set_type_to_lval_spec(lval, ltype, rtype, empty_type.type, modules, vars, errors, known_types);
}

function set_type_to_lval_spec(lval, ltype, rtype, empty_type, modules, vars, errors, known_types) {
	let err_len = array.len(errors.errors[errors.module]);
	let var_tab = rec_get_var_from_lval(lval, errors);
	if ((err_len != array.len(errors.errors[errors.module]))) {
		return ltype;
	}
	let var_name = ov.as(var_tab[0], 'var');
	if (!hash.has_key(vars, var_name)) {
		add_error(errors, `variable ${var_name} does not exist`);
		return ltype;
	}
	let var_ = hash.get_value(vars, var_name);
	let match_var_overwrited_4 = var_.overwrited;
	if (ov.is(match_var_overwrited_4, 'yes')) {
		let new_type = mk_new_type_lval(var_tab, rtype, { type: var_.type, src: ov.mk('speculation') }, empty_type,
			modules, errors, known_types);
		set_type_to_variable(vars, var_name, new_type, errors, var_.defPlace);
		return rtype;
	} else if (ov.is(match_var_overwrited_4, 'no')) {
		mk_new_type_lval(var_tab, rtype, { type: var_.type, src: ov.mk('known') }, empty_type, modules, errors,
			known_types);
		return ltype;
	}
}

function get_type_left_side_equation(left, modules, vars, errors, known_types) {
	if (ov.is(left.value, 'bin_op') && (ov.as(left.value, 'bin_op')).op === '->') {
		return get_type_record_key(ov.as(left.value, 'bin_op'), modules, vars, errors, known_types);
	} else {
		return check_val(left, modules, vars, errors, known_types);
	}
}

function get_type_record_key(bin_op, modules, vars, errors, known_types) {
	let left_type = check_val(bin_op.left, modules, vars, errors, known_types);
	left_type = ptd_system.can_delete(left_type, modules, errors);
	if (ov.is(left_type.type, 'tct_rec')) {
		let fields = ov.as(left_type.type, 'tct_rec');
		let field = ov.as(bin_op.right.value, 'hash_key');
		if (!hash.has_key(fields, field)) {
			if (is_known(left_type)) {
				add_error(errors, 'unknown record key: ' + field, bin_op.right.debug);
			}
			left_type.type = tct.tct_im();
			return left_type;
		}
		left_type.type = hash.get_value(fields, field);
		const place = placeToIndex(bin_op.right.debug.begin);
		errors.varPositions[errors.module][place] = { field: { name: field, type: left_type.type } };
		return left_type;
	}
	if (ov.is(left_type.type, 'tct_own_rec')) {
		let fields = ov.as(left_type.type, 'tct_own_rec');
		let field = ov.as(bin_op.right.value, 'hash_key');
		if (!hash.has_key(fields, field)) {
			if (is_known(left_type)) {
				add_error(errors, 'unknown record key: ' + field, bin_op.right.debug);
			}
			left_type.type = tct.tct_im();
			return left_type;
		}
		left_type.type = hash.get_value(fields, field);
		const place = placeToIndex(bin_op.right.debug.begin);
		errors.varPositions[errors.module][place] = { field: { name: field, type: left_type.type } };
		return left_type;
	}
	if (ov.is(left_type.type, 'tct_hash')) {
		left_type.type = ov.as(left_type.type, 'tct_hash');
		return left_type;
	}
	if (ov.is(left_type.type, 'tct_own_hash')) {
		left_type.type = ov.as(left_type.type, 'tct_own_hash');
		return left_type;
	}
	if (!ptd_system.is_accepted(left_type, tct.rec({}), modules, errors) &&
		!ptd_system.is_accepted(left_type, tct.own_rec({}), modules, errors)) {
		add_error(errors, `binary operator -> can be applied only to record : ${get_print_tct_type_name(left_type.type)}`, {
			begin: bin_op.left.debug.end,
			end: { line: bin_op.left.debug.end.line, position: bin_op.left.debug.end.position + 2 },
		});
	}
	left_type.type = tct.tct_im();
	return left_type;
}

function get_type_from_bin_op_and_check(bin_op, modules, vars, errors, known_types) {
	let op = bin_op.op;
	let right_type = check_val(bin_op.right, modules, vars, errors, known_types);
	if (op === '=') {
		if (ov.is(right_type.type, 'tct_void')) {
			add_error(errors, 'cannot use \'void\' type returned from function as value');
			return { type: tct.tct_im(), src: ov.mk('speculation') };
		}
		let err_left_len = array.len(errors.errors[errors.module]);
		let left_type = get_type_left_side_equation(bin_op.left, modules, vars, errors, known_types);
		left_type.type = ptd_system.cross_type(left_type.type, right_type.type, modules, errors, known_types);
		if ((array.len(errors.errors[errors.module]) - err_left_len > 0)) {
			return left_type;
		}
		return set_type_to_lval(bin_op.left, left_type, right_type, modules, vars, errors, known_types);
	}
	let left_type2 = ptd_system.can_delete(check_val(bin_op.left, modules, vars, errors, known_types), modules, errors);
	let ret_type = { type: tct.tct_im(), src: left_type2.src };
	if (op === '->') {
		return get_type_record_key(bin_op, modules, vars, errors, known_types);
	}
	if (op === 'ARRAY_INDEX') {
		if (!ptd_system.is_accepted(left_type2, tct.arr(tct.tct_im()), modules, errors) &&
			!ptd_system.is_accepted(left_type2, tct.own_arr(tct.tct_im()), modules, errors)) {
			add_error(errors, 'array operator \'[]\' can be applied only to array, not for: ' +
				get_print_tct_type_name(left_type2.type));
			return ret_type;
		}
		if (!ptd_system.is_accepted(right_type, tct.int(), modules, errors)) {
			add_error(errors, 'array index should be number, got ' + get_print_tct_type_name(right_type.type));
		}
		if (ov.is(left_type2.type, 'tct_arr')) {
			left_type2.type = ov.as(left_type2.type, 'tct_arr');
		}
		if (ov.is(left_type2.type, 'tct_own_arr')) {
			left_type2.type = ov.as(left_type2.type, 'tct_own_arr');
		}
		return left_type2;
	}
	if (op === 'HASH_INDEX') {
		if (!ptd_system.is_accepted(left_type2, tct.hash(tct.tct_im()), modules, errors) &&
			!ptd_system.is_accepted(left_type2, tct.own_hash(tct.empty()), modules, errors)) {
			add_error(errors, 'hash operator \'{}\' can be applied only to hash', bin_op.left.debug);
			return ret_type;
		}
		if (!ptd_system.is_accepted(right_type, tct.string(), modules, errors)) {
			add_error(errors, 'hash index should be string', bin_op.right.debug);
		}
		if (ov.is(left_type2.type, 'tct_hash')) {
			left_type2.type = ov.as(left_type2.type, 'tct_hash');
		}
		if (ov.is(left_type2.type, 'tct_own_hash')) {
			left_type2.type = ov.as(left_type2.type, 'tct_own_hash');
		}
		return left_type2;
	}
	if (op === '[]=') {
		if (!ptd_system.is_accepted(left_type2, tct.arr(tct.tct_im()), modules, errors) &&
			!ptd_system.is_accepted(left_type2, tct.own_arr(tct.tct_im()), modules, errors)) {
			add_error(errors, 'array operator \'[]=\' can be applied only to array', {
				begin: bin_op.left.debug.end,
				end: { line: bin_op.left.debug.end.line, position: bin_op.left.debug.end.position + 3 }
			});
			return ret_type;
		}
		right_type.type = tct.arr(right_type.type);
		set_type_to_lval_spec(bin_op.left, left_type2, right_type, tct.arr(tct.empty()), modules, vars, errors,
			known_types);
		if (ov.is(left_type2.type, 'tct_arr')) {
			left_type2.type = ov.as(left_type2.type, 'tct_arr');
		}
		return left_type2;
	}
	if (op === 'OV_AS') {
		ret_type = { type: tct.tct_im(), src: left_type2.src };
		if (ptd_system.is_accepted(left_type2, tct.var_({}), modules, errors) || ptd_system.is_accepted(left_type2, tct.own_var({
		}), modules, errors)) {
			let variants;
			if (ov.is(left_type2.type, 'tct_var')) {
				variants = ov.as(left_type2.type, 'tct_var');
			} else if (ov.is(left_type2.type, 'tct_own_var')) {
				variants = ov.as(left_type2.type, 'tct_own_var');
			} else {
				return ret_type;
			}
			let right_val = ov.as(bin_op.right.value, 'hash_key');
			if (!hash.has_key(variants, right_val)) {
				add_error(errors, `case ${right_val} doesn\'t exist is: ${get_print_tct_type_name(left_type2.type)}`, bin_op.right.debug);
				return ret_type;
			}
			let t = hash.get_value(variants, right_val);
			let match_t_0 = t;
			if (ov.is(match_t_0, 'with_param')) {
				let sub_type = ov.as(match_t_0, 'with_param');
				ret_type.type = sub_type;
			} else if (ov.is(match_t_0, 'no_param')) {
				add_error(errors, `case ${right_val} don\'t have value: ${get_print_tct_type_name(left_type2.type)}`);
			}
			return ret_type;
		} else {
			add_error(errors, `binary operator \'as/is\' can be applied only to variant: ${get_print_tct_type_name(left_type2.type)}`);
			return ret_type;
		}
	}
	if (op === 'OV_IS') {
		ret_type = { type: tct.bool(), src: ov.mk('speculation') };
		if (ptd_system.is_accepted(left_type2, tct.var_({}), modules, errors) || ptd_system.is_accepted(left_type2, tct.own_var({
		}), modules, errors)) {
			if (!(ov.is(left_type2.type, 'tct_var'))) {
				return ret_type;
			}
			let variants = ov.as(left_type2.type, 'tct_var');
			let right_val = ov.as(bin_op.right.value, 'hash_key');
			if (!hash.has_key(variants, right_val)) {
				add_error(errors, `case ${right_val} doesn\'t exist is: ${get_print_tct_type_name(left_type2.type)}`);
				return ret_type;
			}
			return ret_type;
		} else {
			add_error(errors, `binary operator \'as/is\' can be applied only to variant: ${get_print_tct_type_name(left_type2.type)}`);
			return ret_type;
		}
	}
	if (op === '.') {
		if (!ptd_system.is_accepted(left_type2, tct.string(), modules, errors) &&
			!ptd_system.is_accepted(left_type2, tct.int(), modules, errors)) {
			add_error(errors, `incorrect type of the first argument operator \' . \': ${get_print_tct_type_name(left_type2.type)}`, bin_op.left.debug);
		}
		if (!ptd_system.is_accepted(right_type, tct.string(), modules, errors) &&
			!ptd_system.is_accepted(right_type, tct.int(), modules, errors)) {
			add_error(errors, `incorrect type of the first argument operator \' . \': ${get_print_tct_type_name(left_type2.type)}`, bin_op.left.debug);
		}
		return { type: tct.string(), src: ov.mk('speculation') };
	}
	let op_def2 = tc_types.get_bin_op_def(op);
	if (!ptd_system.is_accepted(left_type2, op_def2.arg1, modules, errors)) {
		add_error(errors, `incorrect type of the first argument operator \'${op}\': ${get_print_tct_type_name(left_type2.type)}`, bin_op.left.debug);
	} else if (ov.is(bin_op.left.value, 'var')) {
		vars[ov.as(bin_op.left.value, 'var')].type = ptd_system.cross_type(op_def2.arg1, vars[ov.as(bin_op.left.value,
			'var')].type, modules, errors, known_types);
	}
	if (!ptd_system.is_accepted(right_type, op_def2.arg2, modules, errors)) {
		add_error(errors, `incorrect type of the second argument operator \'${op}\': ${get_print_tct_type_name(right_type.type)}`, bin_op.right.debug);
	} else if (ov.is(bin_op.right.value, 'var')) {
		vars[ov.as(bin_op.right.value, 'var')].type = ptd_system.cross_type(op_def2.arg2, vars[ov.as(bin_op.right.value,
			'var')].type, modules, errors, known_types);
	}
	return { type: op_def2.ret, src: ov.mk('speculation') };
}

function get_print_tct_type_name(type) {
	let match_type_8 = type;
	if (ov.is(match_type_8, 'tct_empty')) {
		return '';
	} else if (ov.is(match_type_8, 'tct_im')) {
		return 'ptd::ptd_im()';
	} else if (ov.is(match_type_8, 'tct_void')) {
		return 'ptd::void()';
	} else if (ov.is(match_type_8, 'tct_int')) {
		return 'ptd::int()';
	} else if (ov.is(match_type_8, 'tct_string')) {
		return 'ptd::string()';
	} else if (ov.is(match_type_8, 'tct_bool')) {
		return 'ptd::bool()';
	} else if (ov.is(match_type_8, 'tct_ref')) {
		let ref_name = ov.as(match_type_8, 'tct_ref');
		return '@' + ref_name;
	} else if (ov.is(match_type_8, 'tct_arr')) {
		let arr = ov.as(match_type_8, 'tct_arr');
		return 'ptd::arr(' + get_print_tct_type_name(arr) + ')';
	} else if (ov.is(match_type_8, 'tct_own_arr')) {
		let arr = ov.as(match_type_8, 'tct_own_arr');
		return 'own::arr(' + get_print_tct_type_name(arr) + ')';
	} else if (ov.is(match_type_8, 'tct_var')) {
		let variants = ov.as(match_type_8, 'tct_var');
		let ret = 'ptd::var(';
		for (const [field, tt] of Object.entries(variants)) {
			let match_tt_0 = tt;
			if (ov.is(match_tt_0, 'with_param')) {
				let typ = ov.as(match_tt_0, 'with_param');
				ret += field + ' => ' + get_print_tct_type_name(typ) + ', ';
			} else if (ov.is(match_tt_0, 'no_param')) {
				ret += field + ', ';
			}
		}
		return ret + ')';
	} else if (ov.is(match_type_8, 'tct_own_var')) {
		let variants = ov.as(match_type_8, 'tct_own_var');
		let ret = 'own::var(';
		for (const [field, tt] of Object.entries(variants)) {
			let match_tt_1 = tt;
			if (ov.is(match_tt_1, 'with_param')) {
				let typ = ov.as(match_tt_1, 'with_param');
				ret += field + ' => ' + get_print_tct_type_name(typ) + ', ';
			} else if (ov.is(match_tt_1, 'no_param')) {
				ret += field + ', ';
			}
		}
		return ret + ')';
	} else if (ov.is(match_type_8, 'tct_rec')) {
		let recs = ov.as(match_type_8, 'tct_rec');
		let ret = 'ptd::rec(';
		for (const [field, tt] of Object.entries(recs)) {
			ret += field + ' => ' + get_print_tct_type_name(tt) + ', ';
		}
		return ret + ')';
	} else if (ov.is(match_type_8, 'tct_own_rec')) {
		let recs = ov.as(match_type_8, 'tct_own_rec');
		let ret = 'own::rec(';
		for (const [field, tt] of Object.entries(recs)) {
			ret += field + ' => ' + get_print_tct_type_name(tt) + ', ';
		}
		return ret + ')';
	} else if (ov.is(match_type_8, 'tct_hash')) {
		let hash = ov.as(match_type_8, 'tct_hash');
		return 'ptd::hash(' + get_print_tct_type_name(hash) + ')';
	} else if (ov.is(match_type_8, 'tct_own_hash')) {
		let hash = ov.as(match_type_8, 'tct_own_hash');
		return 'own::hash(' + get_print_tct_type_name(hash) + ')';
	}
}

function get_print_tct_label(type) {
	let match_type_9 = type;
	if (ov.is(match_type_9, 'tct_empty')) {
		return 'ptd::ptd_empty';
	} else if (ov.is(match_type_9, 'tct_im')) {
		return 'ptd::ptd_im';
	} else if (ov.is(match_type_9, 'tct_void')) {
		return 'ptd::void';
	} else if (ov.is(match_type_9, 'tct_int')) {
		return 'ptd::int';
	} else if (ov.is(match_type_9, 'tct_string')) {
		return 'ptd::string';
	} else if (ov.is(match_type_9, 'tct_bool')) {
		return 'ptd::bool';
	} else if (ov.is(match_type_9, 'tct_ref')) {
		let ref_name = ov.as(match_type_9, 'tct_ref');
		return 'ptd::ref';
	} else if (ov.is(match_type_9, 'tct_arr')) {
		let arr = ov.as(match_type_9, 'tct_arr');
		return 'ptd::arr';
	} else if (ov.is(match_type_9, 'tct_own_arr')) {
		let arr = ov.as(match_type_9, 'tct_own_arr');
		return 'own::arr';
	} else if (ov.is(match_type_9, 'tct_var')) {
		let variants = ov.as(match_type_9, 'tct_var');
		return 'ptd::var';
	} else if (ov.is(match_type_9, 'tct_own_var')) {
		let variants = ov.as(match_type_9, 'tct_own_var');
		return 'own::var';
	} else if (ov.is(match_type_9, 'tct_rec')) {
		let recs = ov.as(match_type_9, 'tct_rec');
		return 'ptd::rec';
	} else if (ov.is(match_type_9, 'tct_own_rec')) {
		let recs = ov.as(match_type_9, 'tct_own_rec');
		return 'own::rec';
	} else if (ov.is(match_type_9, 'tct_hash')) {
		let hash = ov.as(match_type_9, 'tct_hash');
		return 'ptd::hash';
	} else if (ov.is(match_type_9, 'tct_own_hash')) {
		let hash = ov.as(match_type_9, 'tct_own_hash');
		return 'own::hash';
	}
}

function get_print_check_info(check_info) {
	let match_check_info_0 = check_info;
	if (ov.is(match_check_info_0, 'ok')) {
		throw new Error();
	} else if (ov.is(match_check_info_0, 'err')) {
		let info = ov.as(match_check_info_0, 'err');
		let ret = ' ';
		for (let i = array.len(info.stack) - 1; i >= 0; i -= 1) {
			let match_info_stack_i_0 = info.stack[i];
			if (ov.is(match_info_stack_i_0, 'ptd_arr')) {
				ret += 'ptd::arr';
			} else if (ov.is(match_info_stack_i_0, 'own_arr')) {
				ret += 'own::arr';
			} else if (ov.is(match_info_stack_i_0, 'ptd_var')) {
				let variant = ov.as(match_info_stack_i_0, 'ptd_var');
				ret += 'ptd::var(' + variant + ')';
			} else if (ov.is(match_info_stack_i_0, 'own_var')) {
				let variant = ov.as(match_info_stack_i_0, 'own_var');
				ret += 'own::var(' + variant + ')';
			} else if (ov.is(match_info_stack_i_0, 'ptd_rec')) {
				let field = ov.as(match_info_stack_i_0, 'ptd_rec');
				ret += 'ptd::rec(' + field + ')';
			} else if (ov.is(match_info_stack_i_0, 'own_rec')) {
				let field = ov.as(match_info_stack_i_0, 'own_rec');
				ret += 'own::rec(' + field + ')';
			} else if (ov.is(match_info_stack_i_0, 'ptd_hash')) {
				ret += 'ptd::hash';
			} else if (ov.is(match_info_stack_i_0, 'own_hash')) {
				ret += 'own::hash';
			}
			ret += '->';
		}
		if (ov.is(info.from, 'tct_rec') && ov.is(info.to, 'tct_rec')) {
			for (const [name, record] of Object.entries(ov.as(info.from, 'tct_rec'))) {
				if (hash.has_key(ov.as(info.to, 'tct_rec'), name)) {
					continue;
				}
				return `${ret}(ptd::rec with field: \'${name}\' instead of ptd::rec without field: \'${name}\')`;
			}
			for (const [name, record] of Object.entries(ov.as(info.to, 'tct_rec'))) {
				if (hash.has_key(ov.as(info.from, 'tct_rec'), name)) {
					continue;
				}
				return ret + '(ptd::rec without field: \'' + name + '\' instead of ptd::rec with field: \'' + name +
					'\')';
			}
		} else if (ov.is(info.from, 'tct_var') && ov.is(info.to, 'tct_var')) {
			for (const [name, from_type] of Object.entries(ov.as(info.from, 'tct_var'))) {
				let to_types = ov.as(info.to, 'tct_var');
				if (hash.has_key(to_types, name)) {
					let match_from_type_3 = from_type;
					if (ov.is(match_from_type_3, 'no_param')) {
						if (ov.is(hash.get_value(to_types, name), 'with_param')) {
							return ret + '(ptd::var case: \'' + name + '\' no_param instead of ptd::var case: \'' + name
								+ '\' with_param)';
						}
					} else if (ov.is(match_from_type_3, 'with_param')) {
						let f_t = ov.as(match_from_type_3, 'with_param');
						if (ov.is(hash.get_value(to_types, name), 'no_param')) {
							return ret + '(ptd::var case: \'' + name + '\' with_param instead of ptd::var case: \'' +
								name + '\' no_param)';
						}
					}
				} else {
					return ret + '(ptd::var with case: \'' + name + '\' instead of ptd::var without case: \'' + name +
						'\')';
				}
			}
		} else if (ov.is(info.from, 'tct_own_var') && ov.is(info.to, 'tct_own_var')) {
			for (const [name, from_type] of Object.entries(ov.as(info.from, 'tct_own_var'))) {
				let to_types = ov.as(info.to, 'tct_own_var');
				if (hash.has_key(to_types, name)) {
					let match_from_type_4 = from_type;
					if (ov.is(match_from_type_4, 'no_param')) {
						if (ov.is(hash.get_value(to_types, name), 'with_param')) {
							return ret + '(own::var case: \'' + name + '\' no_param instead of own::var case: \'' + name
								+ '\' with_param)';
						}
					} else if (ov.is(match_from_type_4, 'with_param')) {
						let f_t = ov.as(match_from_type_4, 'with_param');
						if (ov.is(hash.get_value(to_types, name), 'no_param')) {
							return ret + '(own::var case: \'' + name + '\' with_param instead of own::var case: \'' +
								name + '\' no_param)';
						}
					}
				} else {
					return ret + '(own::var with case: \'' + name + '\' instead of own::var without case: \'' + name +
						'\')';
				}
			}
		} else {
			ret += '(' + get_print_tct_label(info.from) + ' instead of ' + get_print_tct_label(info.to) + ')';
		}
		return ret;
	}
}

function check_var_decl(var_decl, modules, vars, errors, known_types) {
	return check_var_decl_try(var_decl, false, modules, vars, errors, known_types).ok;
}

function check_var_decl_try(var_decl, is_try, modules, vars, errors, known_types) {
	if (hash.has_key(vars, var_decl.name)) {
		add_error(errors, `variable \'${var_decl.name}\' already exists`);
	}
	let ret_types = {
		ok: new_var_decl(var_decl.name, tct.empty(), var_decl.place, true),
		err: { type: tct.empty(), src: ov.mk('speculation') }
	};
	let match_var_decl_type_0 = var_decl.type;
	if (ov.is(match_var_decl_type_0, 'type')) {
		let tt = ov.as(match_var_decl_type_0, 'type');
		let match_ptd_parser_try_value_to_ptd_tt_2 = ptd_parser.try_value_to_ptd(tt);
		if (ov.is(match_ptd_parser_try_value_to_ptd_tt_2, 'err')) {
			let err = ov.as(match_ptd_parser_try_value_to_ptd_tt_2, 'err');
			add_error(errors, err);
			ret_types.ok.type = tct.tct_im();
		} else if (ov.is(match_ptd_parser_try_value_to_ptd_tt_2, 'ok')) {
			let ok = ov.as(match_ptd_parser_try_value_to_ptd_tt_2, 'ok');
			ret_types.ok.type = ok;
			check_types_imported(ok, modules, errors);
			if (tct.is_own_type(ok, known_types)) {
				let match_var_decl_value_0 = var_decl.value;
				if (ov.is(match_var_decl_value_0, 'value')) {
				} else if (ov.is(match_var_decl_value_0, 'none')) {
					add_error(errors, 'own types must be initialized');
				}
			}
		}
		ret_types.ok.overwrited = ov.mk('no');
	} else if (ov.is(match_var_decl_type_0, 'none')) {
	}
	let match_var_decl_value_1 = var_decl.value;
	if (ov.is(match_var_decl_value_1, 'value')) {
		let value = ov.as(match_var_decl_value_1, 'value');
		let assign_type = check_val(value, modules, vars, errors, known_types);
		if (ov.is(assign_type.type, 'tct_void')) {
			add_error(errors, 'cannot use \'void\' type returned from function as value');
			return ret_types;
		}
		if (is_try) {
			let ok_err_types = ptd_system.try_get_ensure_sub_types(assign_type, modules, errors);
			ret_types.err = { type: ok_err_types.err, src: assign_type.src };
			assign_type.type = ok_err_types.ok;
		}
		if (ov.is(ret_types.ok.type, 'tct_empty')) {
			ptd_system.check_assignment(tct.tct_im(), assign_type, modules, errors);
			ret_types.ok.type = assign_type.type;
		} else {
			let check_info = ptd_system.check_assignment(ret_types.ok.type, assign_type, modules, errors);
			if (ov.is(check_info, 'err')) {
				add_error(errors, `invalid type in variable declaration: ${get_print_check_info(check_info)}`, value.debug);
			}
		}
	} else if (ov.is(match_var_decl_value_1, 'none')) {
	}
	return ret_types;
}

const placeToIndex = (place) => `${place.line}|${place.position}`;

function add_var_to_vars(var_, vars, errors) {
	if (var_.name !== '__END') {
		const varPos = placeToIndex(var_.defPlace);
		errors.varPositions[errors.module] ??= {};
		errors.varPositions[errors.module][varPos] = { def: var_ };
	}
	hash.set_value(vars, var_.name, var_);
}

function set_type_to_variable(vars, name, type, errors, place) {
	add_var_to_vars(new_var_decl(name, type, place, true), vars, errors);
}

function add_var_decl_to_vars(var_type, name, vars, errors, place) {
	if (ov.is(var_type, 'tct_im') || ov.is(var_type, 'tct_empty')) {
		add_var_to_vars(new_var_decl(name, var_type, place, true), vars, errors);
	} else {
		add_var_to_vars(new_var_decl(name, var_type, place, false), vars, errors);
	}
}

function new_var_decl(name, type, place, overwrited) {
	return { name, type, defPlace: place, overwrited: overwrited ? ov.mk('yes') : ov.mk('no'), referenced_by: ov.mk('none') };
}

function add_var_decl_with_type_and_check(var_decl, type, vars, errors) {
	if (hash.has_key(vars, var_decl.name)) {
		add_error(errors, `variable \'${var_decl.name}\' already exists`);
	}
	if (is_known(type)) {
		add_var_to_vars(new_var_decl(var_decl.name, type.type, var_decl.place, false), vars, errors);
		var_decl.tct_type = type.type;
	} else {
		add_var_to_vars(new_var_decl(var_decl.name, type.type, var_decl.place, true), vars, errors);
		var_decl.tct_type = type.type;
	}
}

function is_known(vtype) {
	return ptd_system.is_known(vtype.src);
}

function get_function_name(fun_module, fun_name) {
	return ((fun_module !== '') ? (fun_module + '::') : '') + fun_name;
}

function get_fun_module(fun_module, module) {
	return fun_module === '' ? module : fun_module;
}

function get_function_def(fun_module, fun_name, modules) {
	return hash.get_value(hash.get_value(modules.funs, get_fun_module(fun_module, modules.env.current_module)),
		get_fun_key(fun_name, fun_module));
}

function check_function_exists(fun_module, fun_name, modules, errors) {
	let module = get_fun_module(fun_module, modules.env.current_module);
	if (!hash.has_key(modules.imports, module) || !hash.get_value(modules.imports, module)) {
		// if (!hash.has_key(modules.imports, module)) {
		// 	add_error(errors, `module \'${module}\' not imported`);
		// }
		hash.set_value(modules.imports, module, false);
		return false;
	} else if (!hash.has_key(modules.funs, module)) {
		return false;
	}
	if (!hash.has_key(hash.get_value(modules.funs, module), get_fun_key(fun_name, fun_module))) {
		add_error(errors, `function \`${get_function_name(fun_module, fun_name)}\' does not exist`);
		return false;
	}
	return true;
}

function get_function(fun_module, fun_name, modules) {
	let module = get_fun_module(fun_module, modules.env.current_module);
	return modules.funs[module][get_fun_key(fun_name, fun_module)];
}

function add_error(errors, msg, debug = null) {
	if (!(errors.module in errors.errors)) errors.errors[errors.module] = [];
	array.push(errors.errors[errors.module], {
		message: msg,
		module: errors.module,
		type: ov.mk('error'),
		debug: debug ?? errors.current_debug,
	});
}

function add_warning(errors, msg) {
	if (!(errors.module in errors.errors)) errors.errors[errors.module] = [];
	array.push(errors.errors[errors.module], {
		message: msg,
		module: errors.module,
		type: ov.mk('warning'),
		debug: errors.current_debug,
	});
}

function fill_value_types_in_cmd(cmd, b_vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let vars = DC(b_vars);
	let ret = {};
	let match_cmd_cmd_1 = cmd.cmd;
	if (ov.is(match_cmd_cmd_1, 'if')) {
		let as_if = ov.as(match_cmd_cmd_1, 'if');
		fill_value_types_in_if(as_if, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('if', as_if);
	} else if (ov.is(match_cmd_cmd_1, 'for')) {
		let as_for = ov.as(match_cmd_cmd_1, 'for');
		fill_value_types_in_for(as_for, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('for', as_for);
	} else if (ov.is(match_cmd_cmd_1, 'fora')) {
		let as_fora = ov.as(match_cmd_cmd_1, 'fora');
		fill_value_types_in_fora(as_fora, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('fora', as_fora);
	} else if (ov.is(match_cmd_cmd_1, 'forh')) {
		let as_forh = ov.as(match_cmd_cmd_1, 'forh');
		fill_value_types_in_forh(as_forh, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('forh', as_forh);
	} else if (ov.is(match_cmd_cmd_1, 'loop')) {
		let as_loop = ov.as(match_cmd_cmd_1, 'loop');
		fill_value_types_in_cmd(as_loop, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('loop', as_loop);
	} else if (ov.is(match_cmd_cmd_1, 'rep')) {
		let as_rep = ov.as(match_cmd_cmd_1, 'rep');
		fill_value_types_in_rep(as_rep, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('rep', as_rep);
	} else if (ov.is(match_cmd_cmd_1, 'while')) {
		let as_while = ov.as(match_cmd_cmd_1, 'while');
		fill_value_types_in_while(as_while, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('while', as_while);
	} else if (ov.is(match_cmd_cmd_1, 'if_mod')) {
		let if_mod = ov.as(match_cmd_cmd_1, 'if_mod');
		fill_value_types_in_if_mod(if_mod, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('if_mod', if_mod);
	} else if (ov.is(match_cmd_cmd_1, 'unless_mod')) {
		let unless_mod = ov.as(match_cmd_cmd_1, 'unless_mod');
		fill_value_types_in_unless_mod(unless_mod, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('unless_mod', unless_mod);
	} else if (ov.is(match_cmd_cmd_1, 'break')) {
	} else if (ov.is(match_cmd_cmd_1, 'continue')) {
	} else if (ov.is(match_cmd_cmd_1, 'match')) {
		let as_match = ov.as(match_cmd_cmd_1, 'match');
		fill_value_types_in_match(as_match, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('match', as_match);
	} else if (ov.is(match_cmd_cmd_1, 'value')) {
		let val = ov.as(match_cmd_cmd_1, 'value');
		fill_value_types(val, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('value', val);
	} else if (ov.is(match_cmd_cmd_1, 'return')) {
		let as_return = ov.as(match_cmd_cmd_1, 'return');
		fill_value_types(as_return, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('return', as_return);
	} else if (ov.is(match_cmd_cmd_1, 'block')) {
		let block = ov.as(match_cmd_cmd_1, 'block');
		for (let i = 0; i < array.len(block.cmds); i++) {
			const vars_ = fill_value_types_in_cmd(block.cmds[i], vars, modules, errors, known_types, anon_own_conv, curr_module_name)
			for (const [var_name, var_] of Object.entries(vars_)) {
				add_var_to_vars(var_, vars, errors);
			}
		}
		cmd.cmd = ov.mk('block', block);
	} else if (ov.is(match_cmd_cmd_1, 'die')) {
	} else if (ov.is(match_cmd_cmd_1, 'var_decl')) {
		let var_decl = ov.as(match_cmd_cmd_1, 'var_decl');
		let match_var_decl_value_2 = var_decl.value;
		if (ov.is(match_var_decl_value_2, 'none')) {
		} else if (ov.is(match_var_decl_value_2, 'value')) {
			let value = ov.as(match_var_decl_value_2, 'value');
			value.type = var_decl.tct_type;
			fill_value_types(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
			var_decl.value = ov.mk('value', value);
			cmd.cmd = ov.mk('var_decl', var_decl);
		}
		hash.set_value(ret, var_decl.name, new_var_decl(var_decl.name, var_decl.tct_type, var_decl.place, false));
	} else if (ov.is(match_cmd_cmd_1, 'try')) {
		let as_try = ov.as(match_cmd_cmd_1, 'try');
		ret = fill_try_ensure_type(as_try, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('try', as_try);
	} else if (ov.is(match_cmd_cmd_1, 'ensure')) {
		let as_ensure = ov.as(match_cmd_cmd_1, 'ensure');
		ret = fill_try_ensure_type(as_ensure, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		cmd.cmd = ov.mk('ensure', as_ensure);
	} else if (ov.is(match_cmd_cmd_1, 'nop')) {
	}
	return ret;
}

function fill_value_types_in_if(as_if, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(as_if.cond, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types_in_cmd(as_if.if, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	for (let i = 0; i < array.len(as_if.elsif); i++) {
		fill_value_types(as_if.elsif[i].cond, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		fill_value_types_in_cmd(as_if.elsif[i].cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	}
	fill_value_types_in_cmd(as_if.else, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
}

function fill_value_types_in_for(as_for, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let match_as_for_start_1 = as_for.start;
	if (ov.is(match_as_for_start_1, 'var_decl')) {
		let var_decl = ov.as(match_as_for_start_1, 'var_decl');
		add_var_to_vars(new_var_decl(var_decl.name, var_decl.tct_type, var_decl.place, false), vars, errors);
		let var_decl_value = ov.as(var_decl.value, 'value');
		fill_value_types(var_decl_value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		var_decl.value = ov.mk('value', var_decl_value);
		as_for.start = ov.mk('var_decl', var_decl);
	} else if (ov.is(match_as_for_start_1, 'value')) {
		let value = ov.as(match_as_for_start_1, 'value');
		fill_value_types(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		as_for.start = ov.mk('value', value);
	}
	fill_value_types(as_for.iter, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types(as_for.cond, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types_in_cmd(as_for.cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
}

function fill_value_types_in_fora(as_fora, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(as_fora.array, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	let arr_type = unwrap_ref(as_fora.array.type, modules, errors);
	let inner_type;
	if (ov.is(arr_type, 'tct_arr')) {
		inner_type = ov.as(arr_type, 'tct_arr');
	} else if (ov.is(arr_type, 'tct_im')) {
		inner_type = ov.mk('tct_im');
	} else if (ov.is(arr_type, 'tct_own_arr')) {
		inner_type = ov.as(arr_type, 'tct_own_arr');
	} else {
		throw new Error();
	}
	add_var_to_vars(new_var_decl(as_fora.iter.name, inner_type, as_fora.iter.place, false), vars, errors);
	fill_value_types_in_cmd(as_fora.cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
}

function fill_value_types_in_forh(as_forh, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(as_forh.hash, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	add_var_to_vars(new_var_decl(as_forh.key.name, as_forh.key.tct_type, as_forh.key.place, false), vars, errors);
	let value_type;
	let hash_type = unwrap_ref(as_forh.hash.type, modules, errors);
	if (ov.is(hash_type, 'tct_hash')) {
		value_type = ov.as(hash_type, 'tct_hash');
	} else if (ov.is(hash_type, 'tct_own_hash')) {
		value_type = ov.as(hash_type, 'tct_own_hash');
	} else {
		value_type = ov.mk('tct_im');
	}
	as_forh.val.tct_type = value_type;
	add_var_to_vars(new_var_decl(as_forh.val.name, value_type, as_forh.val.place, false), vars, errors);
	fill_value_types_in_cmd(as_forh.cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
}

function fill_value_types_in_rep(as_rep, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(as_rep.count, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	add_var_to_vars(new_var_decl(as_rep.iter.name, as_rep.iter.tct_type, as_rep.iter.place, false), vars, errors);
	fill_value_types_in_cmd(as_rep.cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name, errors);
}

function fill_value_types_in_while(as_while, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(as_while.cond, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types_in_cmd(as_while.cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
}

function fill_value_types_in_if_mod(if_mod, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(if_mod.cond, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types_in_cmd(if_mod.cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
}

function fill_value_types_in_unless_mod(unless_mod, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(unless_mod.cond, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types_in_cmd(unless_mod.cmd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
}

function fill_value_types_in_match(as_match, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	fill_value_types(as_match.val, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	let variant_type = unwrap_ref(as_match.val.type, modules, errors);
	for (let i = 0; i < array.len(as_match.branch_list); i++) {
		let match_as_match_branch_list_i_variant_value = as_match.branch_list[i].variant.value;
		if (ov.is(match_as_match_branch_list_i_variant_value, 'none')) {
		} else if (ov.is(match_as_match_branch_list_i_variant_value, 'value')) {
			let value = ov.as(match_as_match_branch_list_i_variant_value, 'value');
			if (ov.is(variant_type, 'tct_own_var')) {
				let label = as_match.branch_list[i].variant.name;
				value.declaration.tct_type = ov.as((ov.as(variant_type, 'tct_own_var'))[label], 'with_param');
				as_match.branch_list[i].variant.value = ov.mk('value', value);
			}
			add_var_to_vars(new_var_decl(value.declaration.name, value.declaration.tct_type, value.declaration.place, false), vars, errors);
		}
		fill_value_types_in_cmd(as_match.branch_list[i].cmd, vars, modules, errors, known_types, anon_own_conv,
			curr_module_name);
	}
}

function fill_value_types(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let match_value_value = value.value;
	if (ov.is(match_value_value, 'ternary_op')) {
		let ternary_op = ov.as(match_value_value, 'ternary_op');
		fill_ternary_op_type(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	} else if (ov.is(match_value_value, 'hash_key')) {
		let hash_key = ov.as(match_value_value, 'hash_key');
		value.type = ov.mk('tct_string');
	} else if (ov.is(match_value_value, 'nop')) {
		value.type = ov.mk('tct_void');
	} else if (ov.is(match_value_value, 'parenthesis')) {
		let parenthesis = ov.as(match_value_value, 'parenthesis');
		fill_value_types(parenthesis, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		value.value = ov.mk('parenthesis', parenthesis);
		value.type = parenthesis.type;
	} else if (ov.is(match_value_value, 'variant')) {
		let variant = ov.as(match_value_value, 'variant');
		let value_type = unwrap_ref(value.type, modules, errors);
		if (variant.name === 'TRUE' || variant.name === 'FALSE') {
			value.type = ov.mk('tct_bool');
		}
		if (ov.is(value_type, 'tct_own_var')) {
			let match__ov_as_value_type_tct_own_var_variant_name = (ov.as(value_type, 'tct_own_var'))[variant.name];
			if (ov.is(match__ov_as_value_type_tct_own_var_variant_name, 'with_param')) {
				let param_type = ov.as(match__ov_as_value_type_tct_own_var_variant_name, 'with_param');
				variant.var.type = param_type;
			} else if (ov.is(match__ov_as_value_type_tct_own_var_variant_name, 'no_param')) {
			}
		}
		fill_value_types(variant.var, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		value.value = ov.mk('variant', variant);
	} else if (ov.is(match_value_value, 'const')) {
		let as_const = ov.as(match_value_value, 'const');
		value.type = ov.mk('tct_int');
	} else if (ov.is(match_value_value, 'bool')) {
		let as_bool = ov.as(match_value_value, 'bool');
		value.type = ov.mk('tct_bool');
	} else if (ov.is(match_value_value, 'arr_decl')) {
		let arr_decl = ov.as(match_value_value, 'arr_decl');
		let value_type = unwrap_ref(value.type, modules, errors);
		for (let i = 0; i < array.len(arr_decl); i++) {
			if (ov.is(value_type, 'tct_own_arr')) {
				arr_decl[i].type = ov.as(value_type, 'tct_own_arr');
			}
			fill_value_types(arr_decl[i], vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		}
		value.value = ov.mk('arr_decl', arr_decl);
	} else if (ov.is(match_value_value, 'hash_decl')) {
		let hash_decl = ov.as(match_value_value, 'hash_decl');
		let value_type = unwrap_ref(value.type, modules, errors);
		for (let i = 0; i < array.len(hash_decl); i++) {
			hash_decl[i].key.type = ov.mk('tct_string');
			if (ov.is(value_type, 'tct_own_rec')) {
				hash_decl[i].val.type = (ov.as(value_type, 'tct_own_rec'))[ov.as(hash_decl[i].key.value, 'hash_key')];
			} else if (ov.is(value_type, 'tct_own_hash')) {
				hash_decl[i].val.type = (ov.as(value_type, 'tct_own_hash'));
			}
			fill_value_types(hash_decl[i].val, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		}
		value.value = ov.mk('hash_decl', hash_decl);
	} else if (ov.is(match_value_value, 'var')) {
		let variable_name = ov.as(match_value_value, 'var');
		value.type = vars[variable_name].type;
	} else if (ov.is(match_value_value, 'bin_op')) {
		let bin_op = ov.as(match_value_value, 'bin_op');
		fill_binary_op_type(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	} else if (ov.is(match_value_value, 'unary_op')) {
		let unary_op = ov.as(match_value_value, 'unary_op');
		fill_unary_op_type(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	} else if (ov.is(match_value_value, 'fun_label')) {
		let fun_label = ov.as(match_value_value, 'fun_label');
		value.type = ov.mk('tct_im');
	} else if (ov.is(match_value_value, 'fun_val')) {
		let fun_val = ov.as(match_value_value, 'fun_val');
		fill_fun_val_type(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	} else if (ov.is(match_value_value, 'string')) {
		let str = ov.as(match_value_value, 'string');
		value.type = ov.mk('tct_string');
	} else if (ov.is(match_value_value, 'post_inc')) {
		let inc = ov.as(match_value_value, 'post_inc');
		fill_value_types(inc, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		value.value = ov.mk('post_inc', inc);
		value.type = ov.mk('tct_int');
	} else if (ov.is(match_value_value, 'post_dec')) {
		let dec = ov.as(match_value_value, 'post_dec');
		fill_value_types(dec, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		value.value = ov.mk('post_dec', dec);
		value.type = ov.mk('tct_int');
	}
}

function fill_unary_op_type(unary_op_val, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let unary_op = ov.as(unary_op_val.value, 'unary_op');
	fill_value_types(unary_op.val, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	unary_op_val.value = ov.mk('unary_op', unary_op);
	if (unary_op.op === '!') {
		unary_op_val.type = ov.mk('tct_bool');
	} else if (unary_op.op === '@') {
		unary_op_val.type = ov.mk('tct_im');
	} else if (unary_op.op === '--' || unary_op.op === '++' || unary_op.op === '-') {
		unary_op_val.type = ov.mk('tct_int');
	} else {
		unary_op_val.type = ov.mk('tct_im');
	}
}

function fill_binary_op_type(binary_op_val, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let binary_op = ov.as(binary_op_val.value, 'bin_op');
	fill_value_types(binary_op.left, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	binary_op_val.value = ov.mk('bin_op', binary_op);
	if (binary_op.op === '=') {
		binary_op_val.type = binary_op.left.type;
		binary_op.right.type = binary_op.left.type;
	} else if (binary_op.op === 'ARRAY_INDEX') {
		binary_op_val.type = get_type_from_bin_op_and_check(binary_op, modules, vars, errors, known_types).type;
		binary_op.right.type = ov.mk('tct_int');
	} else if (binary_op.op === 'HASH_INDEX') {
		binary_op_val.type = get_type_from_bin_op_and_check(binary_op, modules, vars, errors, known_types).type;
	} else if (binary_op.op === '->') {
		binary_op_val.type = get_type_from_bin_op_and_check(binary_op, modules, vars, errors, known_types).type;
	} else if (binary_op.op === '[]=') {
		if (ov.is(unwrap_ref(binary_op.left.type, modules, errors), 'tct_own_arr')) {
			binary_op.right.type = ov.as(unwrap_ref(binary_op.left.type, modules, errors), 'tct_own_arr');
		}
		binary_op_val.type = ov.mk('tct_void');
	} else if (binary_op.op === 'OV_AS') {
		binary_op_val.type = get_type_from_bin_op_and_check(binary_op, modules, vars, errors, known_types).type;
	} else if (binary_op.op === 'OV_IS') {
		binary_op_val.type = get_type_from_bin_op_and_check(binary_op, modules, vars, errors, known_types).type;
	} else {
		let op_def = tc_types.get_bin_op_def(binary_op.op);
		binary_op_val.type = op_def.ret;
	}
	fill_value_types(binary_op.right, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	binary_op_val.value = ov.mk('bin_op', binary_op);
}

function fill_ternary_op_type(ternary_op_val, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let ternary_op = ov.as(ternary_op_val.value, 'ternary_op');
	fill_value_types(ternary_op.fst, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types(ternary_op.snd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	fill_value_types(ternary_op.thrd, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	ternary_op_val.value = ov.mk('ternary_op', ternary_op);
	ternary_op_val.type = ptd_system.cross_type(ternary_op.snd.type, ternary_op.thrd.type, modules, errors, known_types);
}

function fill_fun_val_type(fun_val, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let as_fun = ov.as(fun_val.value, 'fun_val');
	let fun_name = get_function_name(as_fun.module, as_fun.name);
	for (let i = 0; i < array.len(as_fun.args); i++) {
		fill_value_types(as_fun.args[i].val, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
	}
	if (hash.has_key(special_functions, fun_name)) {
		let fun_def = special_functions[fun_name];
		fun_val.type = fun_def.r;
		for (let i = 0; i < array.len(as_fun.args); i++) {
			as_fun.args[i].expected_type = fun_def.a[i].type;
		}
	} else if (as_fun.module === 'c_std_lib' || as_fun.module === 'c_rt_lib' || as_fun.module === 'c_fe_lib') {
		fun_val.type = ov.mk('tct_im');
	} else if (as_fun.module === 'own' && as_fun.name === 'to_im') {
		fun_val.type = ov.mk('tct_im');
		let type = as_fun.args[0].val.type;
		if (ov.is(type, 'tct_ref')) {
			as_fun.module = curr_module_name;
		} else {
			as_fun.module = '';
		}
		let arg_type = own_to_im_converter.get_required_arg_type(type, known_types);
		let arg_type_var;
		if (arg_type === '') {
			arg_type_var = ov.mk('none');
		}
		arg_type_var = ov.mk('ref');
		as_fun.args[0].mod = arg_type_var;
		as_fun.args[0].expected_type = type;
		let name = own_to_im_converter.get_function_name(type, known_types);
		if (ov.is(type, 'tct_ref')) {
			let ix = string.index2(name, '::');
			as_fun.name = string.substr(name, ix + 2, string.length(name) - ix - 2);
		} else {
			as_fun.name = name;
		}
		if (!hash.has_key(anon_own_conv, name) && !(ov.is(type, 'tct_ref'))) {
			hash.set_value(anon_own_conv, name, type);
		}
	} else {
		if (check_function_exists(as_fun.module, as_fun.name, modules, errors)) {
			let fun_def = get_function_def(as_fun.module, as_fun.name, modules);
			fun_val.type = fun_def.ret_type;
			for (let i = 0; i < array.len(as_fun.args); i++) {
				as_fun.args[i].expected_type = fun_def.args[i].type;
			}
		} else {
			fun_val.type = ov.mk('tct_im');
		}
	}
	fun_val.value = ov.mk('fun_val', as_fun);
}

function fill_try_ensure_type(try_ensure, vars, modules, errors, known_types, anon_own_conv, curr_module_name) {
	let ret = {};
	let match_try_ensure_1 = DC(try_ensure);
	if (ov.is(match_try_ensure_1, 'decl')) {
		let decl = ov.as(match_try_ensure_1, 'decl');
		let match_decl_value = decl.value;
		if (ov.is(match_decl_value, 'value')) {
			let value = ov.as(match_decl_value, 'value');
			add_var_to_vars(new_var_decl(decl.name, decl.tct_type, decl.place, false), vars, errors);
			fill_value_types(value, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
			decl.value = ov.mk('value', value);
		} else if (ov.is(match_decl_value, 'none')) {
		}
		ret[decl.name] = new_var_decl(decl.name, decl.tct_type, decl.place, false);

		ObjectAssignInPlace(try_ensure, ov.mk('decl', decl));
	} else if (ov.is(match_try_ensure_1, 'lval')) {
		let lval = ov.as(match_try_ensure_1, 'lval');
		fill_value_types(lval.left, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		fill_value_types(lval.right, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		ObjectAssignInPlace(try_ensure, ov.mk('lval', lval));
	} else if (ov.is(match_try_ensure_1, 'expr')) {
		let expr = ov.as(match_try_ensure_1, 'expr');
		fill_value_types(expr, vars, modules, errors, known_types, anon_own_conv, curr_module_name);
		ObjectAssignInPlace(try_ensure, ov.mk('expr', expr));
	}
	return ret;
}

function unwrap_ref(type, modules, errors) {
	while (ov.is(type, 'tct_ref')) {
		type = ptd_system.get_ref_type(ov.as(type, 'tct_ref'), modules, errors);
	}
	return type;
}

function takes_own_arg(function_, defined_types) {
	for (const arg of function_.args) {
		if (tct.is_own_type(arg.type, defined_types)) {
			return true;
		}
	}
	return false;
}



module.exports = {
	// check,
	check_modules,
	get_print_tct_type_name
}