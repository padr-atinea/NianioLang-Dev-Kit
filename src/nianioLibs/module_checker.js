const ov = require('./ov');
const ptd_parser = require('./ptd_parser');


// function search_loops(modules) {
// 	var checked = {};
// 	for (const [module_name, import_list] of Object.entries(modules)) {
// 		if (!Object.keys(checked).includes(module_name)) {
// 			var stack = [];
// 			var stack_hash = {};
// 			var check = check_module_(module_name, modules, stack, stack_hash, checked);
// 			if (ov.is(check, 'loop')) {
// 				return check;
// 			} else if (ov.is(check, 'ok')) {
// 			}
// 		}
// 	}
// 	return ov.mk('ok');
// }

// function check_module_(module_name, modules, stack, stack_hash, checked) {
// 	checked[module_name] = 1;
// 	stack_hash[module_name] = 1;
// 	stack.push(module_name);
// 	for (const import_ of modules[module_name]) {
// 		if (Object.keys(stack_hash).includes(import_)) {
// 			return ov.mk('loop', get_loop_from_stack(import_, stack));
// 		} else if (Object.keys(modules).includes(import_) && !Object.keys(checked).includes(import_)) {
// 			const check = check_module_(import_, modules, stack, stack_hash, checked);
// 			if (ov.is(check, 'loop')) {
// 				const l = ov.as(check, 'loop');
// 				return ov.mk('loop', l);
// 			} else if (ov.is(check, 'ok')) {
// 			}
// 		}
// 	}
// 	delete stack_hash[module_name];
// 	stack = stack.slice(0, stack.length - 1);
// 	return ov.mk('ok');
// }

// function get_loop_from_stack(last_elem, stack) {
// 	const ret = [];
// 	for (const el of stack) {
// 		if((el === last_elem)) ret = [];
// 		ret.push(el);
// 	}
// 	ret.push(last_elem);
// 	return ret;
// }

function add_error(errors, msg, line = null, column = -1, endLine = null, endColumn = null) {
	errors.errors.push({
		message: msg,
		line: line ?? errors.current_line,
		module: errors.module,
		type: ov.mk('error'),
		column: column,
		endLine: endLine ?? line ?? errors.current_line,
		endColumn: endColumn ?? column,
	});
}

function add_warning(errors, msg, line, column, endLine, endColumn) {
	errors.warnings.push({
		message: msg,
		line: line,
		module: errors.module,
		type: ov.mk('warning'),
		column: column,
		endLine: endLine,
		endColumn: endColumn,
	});
}

function set_used_function(fun_key, func, func_used) {
	func_used[fun_key] = 0;
	for (const [name, line] of Object.entries(func[fun_key])) {
		if(!(Object.keys(func).includes(name))) continue;
		if (Object.keys(func_used).includes(name)) continue;
		set_used_function(name, func, func_used);
	}
}

function check_module(module, check_public_fun, functions) {
	const errors = {errors: [], warnings: [], current_line: -1, module: module.name};
	const called = {func: {}, module: {}};
	const state = {
		return: {was: false, arg: ov.mk('none')},
		current_module: module.name,
		in_loop: false,
		called: called,
		vars: {},
		errors: errors,
		varPositions: {},
	};
	const func = {};
	const func_used = {};
	for (const fun_def of module.fun_def) {
		state.errors.current_line = fun_def.line;
		state.vars = {};
		state.return = {was: false, arg: check_return_type(fun_def.ret_type.type, state)};
		const prev = save_block(state);
		for (const fun_arg of fun_def.args) {
			add_var(fun_arg, false, false, true, state);
			check_type(fun_arg.type, state);
			use_var(fun_arg.name, ov.mk('set'), state, fun_arg.place);
		}
		check_cmd(fun_def.cmd, state);
		for (const fun_arg of fun_def.args) {
			if (ov.is(fun_arg.mod, 'ref')) {
				use_var(fun_arg.name, ov.mk('get'), state, fun_arg.place);
			}
		}
		load_block(state, prev);
		if (!state.return.was) {
			if (ov.is(state.return.arg, 'value') || ov.is(state.return.arg, 'was_value')) add_error(state.errors, 'no return value at end of function');
		}
		const fun_key = get_fun_key(ov.is(fun_def.access, 'pub') ? module.name : '', fun_def.name, module.name);
		func[fun_key] = state.called.func;
		functions[fun_key] = state.called.func;
		if(!(ov.is(fun_def.access, 'priv'))) func_used[fun_key] = 0;;
		state.called.func = {};
	}
	const imports = {};
	for (const import_ of module.import) {
		state.errors.current_line = import_.line;
		if ((Object.keys(imports).includes(import_.name))) add_warning(state.errors, 'multiple use module:' + import_.name, import_.line, import_.column, import_.endLine, import_.endColumn);
		if (!Object.keys(state.called.module).includes(import_.name)) add_warning(state.errors, 'unused module:' + import_.name, import_.line, import_.column, import_.endLine, import_.endColumn);
		imports[import_.name] = true;
	}
	for (const [name, line] of Object.entries(state.called.module)) {
		state.errors.current_line = line;
		if (module.name === name) continue;
		if (!((Object.keys(imports).includes(name)))) add_error(state.errors, 'module \'' + name + '\' not imported', line);
	}
	if (!check_public_fun) {
		const copy = JSON.parse(JSON.stringify(func_used));
		for (const [fun_key, none] of Object.entries(copy)) {
			set_used_function(fun_key, func, func_used);
		}
		for (const fun_def of module.fun_def) {
			if (ov.is(fun_def.access, 'pub')) continue;
			if (Object.keys(get_fun_key(ov.is(fun_def.access, 'pub')).includes(func_used) ? module.name : '', fun_def.name, module.name)) continue;
			state.errors.current_line = fun_def.line;	
			add_warning(state.errors, 'unused function: ' + module.name + '_priv::' + fun_def.name, fun_def.line, 0, fun_def.cmd.debug.end.line, fun_def.cmd.debug.end.position);
		}
	}
	return { errors: state.errors, varPositions : state.varPositions };
}

// function check_used_functions(used_functions, functions,  modules, errors) {
// 	var copy = JSON.parse(JSON.stringify(used_functions));
// 	for (const [fun_key, none] of Object.entries(copy)) {
// 		if (!Object.keys(functions).includes(fun_key)) {
// 			errors.warnings.push({message: 'public_functions dictionary key does not exist', line: 0, column: 0, module: 'public_functions.df', type: ov.mk('warning')});
// 			continue;
// 		}
// 		set_used_function(fun_key, functions, used_functions);
// 	}
// 	for (const module of modules) {
// 		for (const fun_def of module.fun_def) {
// 			var fun_name = get_fun_key(ov.is(fun_def.access, 'pub') ? module.name : '', fun_def.name, module.name);
// 			if (Object.keys(used_functions).includes(fun_name)) continue;
// 			errors.warnings.push({message: 'unused function: ' + fun_name, line: fun_def.line, column: 0, module: module.name, type: ov.mk('warning')});
// 		}
// 	}
// }

function check_types_imported(type, state) {
	if (ov.is(type, 'tct_im')) {
	} else if (ov.is(type, 'tct_arr')) {
		check_types_imported(ov.as(type, 'tct_arr'), state);
	} else if (ov.is(type, 'tct_own_arr')) {
		check_types_imported(ov.as(type, 'tct_own_arr'), state);
	} else if (ov.is(type, 'tct_hash')) {
		check_types_imported(ov.as(type, 'tct_hash'), state);
	} else if (ov.is(type, 'tct_own_hash')) {
		check_types_imported(ov.as(type, 'tct_own_hash'), state);
	} else if (ov.is(type, 'tct_rec')) {
		for (const record of Object.values(ov.as(type, 'tct_rec'))) {
			check_types_imported(record, state);
		}
	} else if (ov.is(type, 'tct_own_rec')) {
		for (const record of Object.values(ov.as(type, 'tct_own_rec'))) {
			check_types_imported(record, state);
		}
	} else if (ov.is(type, 'tct_ref')) {
		const ref_name = ov.as(type, 'tct_ref');
		var ix = ref_name.indexOf('::');
		if (ix >= 0) {
			var module = ref_name.slice(0, ix);
			var fun_name = ref_name.slice(ix + 2, ref_name.length - ix - 2);
			add_fun_used(module, fun_name, state);
		} else {
			add_error(state.errors, 'wrong type function name \'' + ref_name + '\' ');
		}
	} else if (ov.is(type, 'tct_void')) {
	} else if (ov.is(type, 'tct_int')) {
	} else if (ov.is(type, 'tct_string')) {
	} else if (ov.is(type, 'tct_bool')) {
	} else if (ov.is(type, 'tct_var')) {
		for (const from_type of Object.values(ov.as(type, 'tct_var'))) {
			if (ov.is(from_type, 'no_param')) {
			} else if (ov.is(from_type, 'with_param')) {
				const param = ov.as(from_type, 'with_param');
				check_types_imported(param, state);
			}
		}
	} else if (ov.is(type, 'tct_own_var')) {
		for (const from_type of Object.values(ov.as(type, 'tct_own_var'))) {
			if (ov.is(from_type, 'no_param')) {
			} else if (ov.is(from_type, 'with_param')) {
				const param = ov.as(from_type, 'with_param');
				check_types_imported(param, state);
			}
		}
	} else if (ov.is(type, 'tct_empty')) {
	}
}

function get_fun_key(module, name, cur_mod) {
	if (module !== '') return `${module}::${name}`;
	return `priv:${cur_mod}::${name}`;
}

function add_fun_used(module, name, state) {
	const fun_key = get_fun_key(module, name, state.current_module);
	if(Object.keys(state.called.func).includes(fun_key)) return;
	state.called.func[fun_key] = state.errors.current_line;
	if(module === '' || Object.keys(state.called.module).includes(module)) return;
	state.called.module[module] = state.errors.current_line;
}

function check_return_type(type, state) {
	if (ov.is(type, 'none')) {
		return ov.mk('none');
	} else if (ov.is(type, 'type')) {
		const value = ov.as(type, 'type');
		if (ov.is(value.value, 'fun_val')) {
			const fun_val = ov.as(value.value, 'fun_val');
			if (fun_val.module === 'ptd' && fun_val.name === 'void') {
				add_fun_used('ptd', 'void', state);
				return ov.mk('void');
			}
		}
	}
	check_type(type, state);
	return ov.mk('value');
}

function check_type(type, state) {
	if (ov.is(type, 'none')) {
	} else if (ov.is(type, 'type')) {
		const value = ov.as(type, 'type');
		if (ov.is(value.value, 'fun_val')) {
			var fun_val = ov.as(value.value, 'fun_val');
			add_fun_used(fun_val.module, fun_val.name, state);
		}
		const val = ptd_parser.try_value_to_ptd(value);
		if (ov.is(val, 'err')) {
			add_error(state.errors, ov.as(val, 'err'));
		} else if (ov.is(val, 'ok')) {
			check_types_imported(ov.as(val, 'ok'), state);
		}
	}
}

function add_var(var_dec, is_const, is_required, initialized, state) {
	if (Object.keys(state.vars).includes(var_dec.name)) {
		add_error(state.errors, 'redeclaration variable: ' + var_dec.name, var_dec.place.line, var_dec.place.position, var_dec.place.line, var_dec.place.position + var_dec.name.length);
	}
	const val = {
		write: ov.mk('none'),
		read: false,
		is_required,
		initialized,
		defPlace: var_dec.place,
		refs: {},
		name: var_dec.name,
		var_dec,
	};
	if((is_const)) val.write = ov.mk('const');
	const posKey = `${var_dec.place.line}|${var_dec.place.position}`;
	state.varPositions[posKey] = { def: val };
	state.vars[var_dec.name] = val;
}

function use_var(name, mode, state, place) {
	if (!Object.keys(state.vars).includes(name)) {
		add_error(state.errors, `unknown variable: ${name}`, place.line, place.position, place.line, place.position + name.length);
		return;
	}
	
	if (ov.is(mode, 'get')) {
		state.vars[name].read = true;
		if (!state.vars[name].initialized) {	
			add_error(state.errors, `variable ${name} can be uninitilized in some paths`, place.line, place.position, place.line, place.position + name.length); 
			state.vars[name].initialized = true;
		}
	} else if (ov.is(mode, 'set')) {
		if (ov.is(state.vars[name].write, 'const')) {
			add_error(state.errors, `can\'t change const variable: ${name}`, place.line, place.position, place.line, place.position + name.length);
			return;
		}
		state.vars[name].initialized = true;
		state.vars[name].write = ov.mk('value');
	} else if (ov.is(mode, 'mod')) {
		state.vars[name].read = true;
		if (ov.is(state.vars[name].write, 'const')) {
			add_error(state.errors, `can\'t change const variable: ${name}`, place.line, place.position, place.line, place.position + name.length);
			return;
		}
		state.vars[name].write = ov.mk('value');
	}
	const defKey = `${state.vars[name].defPlace.line}|${state.vars[name].defPlace.position}`;
	const posKey = `${place.line}|${place.position}`;
	if (posKey !== defKey) {
		state.varPositions[posKey] = { ref: state.vars[name].defPlace };
		if (!(posKey in (state.varPositions[defKey].def.refs))) state.varPositions[defKey].def.refs[posKey] = [];
		state.varPositions[defKey].def.refs[posKey].push(mode);
	}
}

function add_var_dec(var_dec, is_const, is_required, is_initialized, state) {
	add_var(var_dec, is_const, is_required, is_initialized, state);
	check_type(var_dec.type, state);
	if (ov.is(var_dec.value, 'value')) {
		const value = ov.as(var_dec.value, 'value');
		check_val(value, state);
		if(is_const) throw new Error('die');
		use_var(var_dec.name, ov.mk('set'), state, var_dec.place, var_dec.type);
	} else if (ov.is(var_dec.value, 'none')) {
	}
}

function check_cmd(cmd, state) {
	state.errors.current_line = cmd.debug.begin.line;
	if (state.return.was) {
		add_warning(state.errors, 'never used command', cmd.debug.begin.line, cmd.debug.begin.position, cmd.debug.end.line, cmd.debug.end.position);
		state.return.was = false;
	}
	if (ov.is(cmd.cmd, 'if')) {
		const as_if = ov.as(cmd.cmd, 'if');
		check_val(as_if.cond, state);
		const inits = inits_(state);
		check_cmd(as_if.if, state);
		update_inits(state, inits);
		restore_block(state, inits.prev);
		let was = state.return.was;
		for (const elsif_s of as_if.elsif) {
			state.return.was = false;
			check_val(elsif_s.cond, state);
			inits.prev = save_block(state);
			check_cmd(elsif_s.cmd, state);
			update_inits(state, inits);
			restore_block(state, inits.prev);
			if(!(state.return.was)) was = false;
		}
		inits.prev = save_block(state);
		state.return.was = false;
		check_cmd(as_if.else, state);
		update_inits(state, inits);
		flush_inits(state, inits);
		if(!(state.return.was)) was = false;
		state.return.was = was;
	} else if (ov.is(cmd.cmd, 'for')) {
		const as_for = ov.as(cmd.cmd, 'for');
		const prev = save_block(state);
		if (ov.is(as_for.start, 'value')) {
			const value = ov.as(as_for.start, 'value');
			check_val(value, state);
		} else if (ov.is(as_for.start, 'var_decl')) {
			const var_decl = ov.as(as_for.start, 'var_decl');
			add_var_dec(var_decl, false, false, ov.is(var_decl.value, 'value'), state);
		}
		check_val(as_for.cond, state);
		state.in_loop = true;
		check_cmd(as_for.cmd, state);
		check_val(as_for.iter, state);
		load_block(state, prev);
		state.return.was = false;
	} else if (ov.is(cmd.cmd, 'fora')) {
		const as_fora = ov.as(cmd.cmd, 'fora');
		const prev = save_block(state);
		check_val(as_fora.array, state);
		add_var_dec(as_fora.iter, true, true, true, state);
		state.in_loop = true;
		check_cmd(as_fora.cmd, state);
		load_block(state, prev);
		state.return.was = false;
	} else if (ov.is(cmd.cmd, 'forh')) {
		const as_forh = ov.as(cmd.cmd, 'forh');
		const prev = save_block(state);
		check_val(as_forh.hash, state);
		add_var_dec(as_forh.val, (!ov.is(as_forh.val_mod, 'ref')), true, true, state);
		add_var_dec(as_forh.key, true, true, true, state);
		state.in_loop = true;
		check_cmd(as_forh.cmd, state);
		load_block(state, prev);
		state.return.was = false;
	} else if (ov.is(cmd.cmd, 'loop')) {
		const as_loop = ov.as(cmd.cmd, 'loop');
		const prev = save_block(state);
		state.in_loop = true;
		check_cmd(as_loop, state);
		load_block(state, prev);
	} else if (ov.is(cmd.cmd, 'rep')) {
		const as_rep = ov.as(cmd.cmd, 'rep');
		const prev = save_block(state);
		check_val(as_rep.count, state);
		add_var_dec(as_rep.iter, true, true, true, state);
		state.in_loop = true;
		check_cmd(as_rep.cmd, state);
		load_block(state, prev);
		state.return.was = false;
	} else if (ov.is(cmd.cmd, 'while')) {
		const as_while = ov.as(cmd.cmd, 'while');
		const prev = save_block(state);
		check_val(as_while.cond, state);
		state.in_loop = true;
		check_cmd(as_while.cmd, state);
		load_block(state, prev);
		state.return.was = false;
	} else if (ov.is(cmd.cmd, 'if_mod')) {
		const if_mod = ov.as(cmd.cmd, 'if_mod');
		check_val(if_mod.cond, state);
		const prev = save_block(state);
		check_cmd(if_mod.cmd, state);
		restore_block(state, prev);
		state.return.was = false;
	} else if (ov.is(cmd.cmd, 'unless_mod')) {
		const unless_mod = ov.as(cmd.cmd, 'unless_mod');
		check_val(unless_mod.cond, state);
		const prev = save_block(state);
		check_cmd(unless_mod.cmd, state);
		restore_block(state, prev);
		state.return.was = false;
	} else if (ov.is(cmd.cmd, 'break')) {
		if (!state.in_loop) {
			add_error(state.errors, 'command break can be used only in cyclic block', cmd.debug.begin.line, cmd.debug.begin.position, cmd.debug.begin.line, cmd.debug.begin.position + 'break'.length);
		}
	} else if (ov.is(cmd.cmd, 'continue')) {
		if (!state.in_loop) {
			add_error(state.errors, 'command continue can be used only in cyclic block');
		}
	} else if (ov.is(cmd.cmd, 'match')) {
		const as_match = ov.as(cmd.cmd, 'match');
		check_val(as_match.val, state);
		let was = true;
		const inits = inits_(state);
		for (const branch of as_match.branch_list) {
			state.return.was = false;
			inits.prev = save_block(state);
			if (ov.is(branch.variant.value, 'none')) {
			} else if (ov.is(branch.variant.value, 'value')) {
				const value = ov.as(branch.variant.value, 'value');
				add_var_dec(value.declaration, false, true, true, state);
			}
			check_cmd(branch.cmd, state);
			if(!(state.return.was)) was = false;
			update_inits(state, inits);
			load_block(state, inits.prev);
			restore_block(state, inits.prev);
		}
		state.return.was = was;
		flush_inits(state, inits);
	} else if (ov.is(cmd.cmd, 'value')) {
		const val = ov.as(cmd.cmd, 'value');
		check_val(val, state);
	} else if (ov.is(cmd.cmd, 'return')) {
		const as_return = ov.as(cmd.cmd, 'return');
		check_val(as_return, state);
		if (ov.is(state.return.arg, 'value')) {
			if (ov.is(as_return.value, 'nop')) add_error(state.errors, 'return command without value', cmd.debug.begin.line, cmd.debug.begin.position);
		} else if (ov.is(state.return.arg, 'none')) {
			state.return.arg = ov.is(as_return.value, 'nop') ? ov.mk('was_void') : ov.mk('was_value');
		} else if (ov.is(state.return.arg, 'was_value')) {
			if (ov.is(as_return.value, 'nop')) add_error(state.errors, 'previously was return with value', cmd.debug.begin.line, cmd.debug.begin.position);
			state.return.arg = ov.is(as_return.value, 'nop') ? ov.mk('was_void') : ov.mk('was_value');
		} else if (ov.is(state.return.arg, 'was_void')) {
			if (!(ov.is(as_return.value, 'nop'))) add_error(state.errors, 'previously was empty return', cmd.debug.begin.line, cmd.debug.begin.position);
			state.return.arg = ov.is(as_return.value, 'nop') ? ov.mk('was_void') : ov.mk('was_value');
		} else if (ov.is(state.return.arg, 'void')) {
			if (!(ov.is(as_return.value, 'nop'))) add_error(state.errors, 'return value in void function', cmd.debug.begin.line, cmd.debug.begin.position);
		}
		for (const key of Object.keys(state.vars)) {
			state.vars[key].initialized = true;
		}
		state.return.was = true;
	} else if (ov.is(cmd.cmd, 'block')) {
		const prev = save_block(state);
		for (const cmd_s of ov.as(cmd.cmd, 'block').cmds) {
			check_cmd(cmd_s, state);
		}
		load_block(state, prev);
	} else if (ov.is(cmd.cmd, 'die')) {
		for (const arg of ov.as(cmd.cmd, 'die')) {
			check_val(arg, state);
		}
		for (const key of Object.keys(state.vars)) {
			state.vars[key].initialized = true;
		}
		state.return.was = true;
	} else if (ov.is(cmd.cmd, 'var_decl')) {
		const var_decl = ov.as(cmd.cmd, 'var_decl');
		add_var_dec(var_decl, false, false, ov.is(var_decl.value, 'value'), state);
	} else if (ov.is(cmd.cmd, 'try')) {
		const as_try = ov.as(cmd.cmd, 'try');
		if (ov.is(as_try, 'decl')) {
			const var_decl = ov.as(as_try, 'decl');
			add_var_dec(var_decl, false, false, ov.is(var_decl.value, 'value'), state);
		} else if (ov.is(as_try, 'lval')) {
			const lval = ov.as(as_try, 'lval');
			check_val({debug: cmd.debug, value: ov.mk('bin_op', lval), type: lval.left.type}, state);
		} else if (ov.is(as_try, 'expr')) {
			check_val(ov.as(as_try, 'expr'), state);
		}
	} else if (ov.is(cmd.cmd, 'ensure')) {
		const as_ensure = ov.as(cmd.cmd, 'ensure');
		if (ov.is(as_ensure, 'decl')) {
			const var_decl = ov.as(as_ensure, 'decl');
			add_var_dec(var_decl, false, false, ov.is(var_decl.value, 'value'), state);
		} else if (ov.is(as_ensure, 'lval')) {
			const lval = ov.as(as_ensure, 'lval');
			check_val({debug: cmd.debug, value: ov.mk('bin_op', lval), type: lval.left.type}, state);
		} else if (ov.is(as_ensure, 'expr')) {
			check_val(ov.as(as_ensure, 'expr'), state);
		}
	} else if (ov.is(cmd.cmd, 'nop')) {
	}
}

function check_lvalue(lval, state) {
	if (ov.is(lval.value, 'var')) {
		use_var(ov.as(lval.value, 'var'), ov.mk('mod'), state, lval.debug.begin);
		return;
	} else if (ov.is(lval.value, 'bin_op')) {
		const bin_op = ov.as(lval.value, 'bin_op');
		if (bin_op.op === '->' || bin_op.op === 'ARRAY_INDEX' || bin_op.op === 'HASH_INDEX' || bin_op.op === 'OV_AS') {
			check_lvalue(bin_op.left, state);
			check_val(bin_op.right, state);
			return;
		}
	} else if (ov.is(lval.value, 'parenthesis')) {
		check_lvalue(ov.as(lval.value, 'parenthesis'), state);
		return;
	}
	add_error(state.errors, 'invalid expression for lvalue', lval.debug.begin.line, lval.debug.begin.position);
}

function check_val(val, state) {
	if (ov.is(val.value, 'ternary_op')) {
		const ternary_op = ov.as(val.value, 'ternary_op');
		check_val(ternary_op.fst, state);
		check_val(ternary_op.snd, state);
		check_val(ternary_op.thrd, state);
	} else if (ov.is(val.value, 'parenthesis')) {
		check_val(ov.as(val.value, 'parenthesis'), state);
	} else if (ov.is(val.value, 'variant')) {
		check_val(ov.as(val.value, 'variant').var, state);
	} else if (ov.is(val.value, 'const')) {
	} else if (ov.is(val.value, 'string')) {
	} else if (ov.is(val.value, 'bool')) {
	} else if (ov.is(val.value, 'nop')) {
	} else if (ov.is(val.value, 'hash_key')) {
	} else if (ov.is(val.value, 'arr_decl')) {
		for (const dec of ov.as(val.value, 'arr_decl')) {
			check_val(dec, state);
		}
	} else if (ov.is(val.value, 'hash_decl')) {
		for (const el of ov.as(val.value, 'hash_decl')) {
			ov.as(el.key.value, 'hash_key');
			check_val(el.val, state);
		}
	} else if (ov.is(val.value, 'var')) {
		use_var(ov.as(val.value, 'var'), ov.mk('get'), state, val.debug.begin);
	} else if (ov.is(val.value, 'bin_op')) {
		const bin_op = ov.as(val.value, 'bin_op');
		const op = bin_op.op;
		if (op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=' || op === '.=') {
			if (ov.is(bin_op.left.value, 'var') && op === '=') {
				use_var(ov.as(bin_op.left.value, 'var'), ov.mk('set'), state, bin_op.left.debug.begin);
			} else {
				check_lvalue(bin_op.left, state);
			}
		} else {
			check_val(bin_op.left, state);
		}
		check_val(bin_op.right, state);
	} else if (ov.is(val.value, 'unary_op')) {
		check_val(ov.as(val.value, 'unary_op').val, state);
	} else if (ov.is(val.value, 'fun_label')) {
		const fun_label = ov.as(val.value, 'fun_label');
		add_fun_used(fun_label.module, fun_label.name, state);
	} else if (ov.is(val.value, 'fun_val')) {
		const fun_val = ov.as(val.value, 'fun_val');
		for (const fun_val_arg of fun_val.args) {
			if (ov.is(fun_val_arg.mod, 'none')) {
				check_val(fun_val_arg.val, state);
			} else if (ov.is(fun_val_arg.mod, 'ref')) {
				check_lvalue(fun_val_arg.val, state);
				if (ov.is(fun_val_arg.val.value, 'var') && Object.keys(ov.as(fun_val_arg.val.value, 'var')).includes(state.vars)) {
					state.vars[ov.as(fun_val_arg.val.value, 'var')].initialized = true;
				}
			}
		}
		add_fun_used(fun_val.module, fun_val.name, state);
	} else if (ov.is(val.value, 'post_inc')) {
		check_val(ov.as(val.value, 'post_inc'), state);
	} else if (ov.is(val.value, 'post_dec')) {
		check_val(ov.as(val.value, 'post_dec'), state);
	}
}

function save_block(state) {
	return JSON.parse(JSON.stringify({ in_loop: state.in_loop, vars: state.vars }));
}

function load_block(state, prev) {
	state.in_loop = prev.in_loop;
	const keys = JSON.parse(JSON.stringify(Object.keys(state.vars)));
	for (const key of keys) {
		if (!Object.keys(prev.vars).includes(key)) {
			const info = state.vars[key];
			delete state.vars[key];
			if (!info.read && !info.is_required) {
				add_warning(state.errors, 'never read variable: ' + key, info.defPlace.line, info.defPlace.position, info.defPlace.line, info.defPlace.position + info.name.length);
			}
		}
	}
}

function restore_block(state, prev) {
	for (const key of Object.keys(state.vars)) {
		state.vars[key].initialized = prev.vars[key].initialized;
	}
}

function inits_(state) {
	const res_inits = {};
	for (const key of Object.keys(state.vars)) {
		res_inits[key] = true;
	}
	return {
		prev: save_block(state),
		each_init: res_inits
	};
}

function update_inits(state, inits) {
	for (const key of Object.keys(inits.each_init)) {
		if(!(state.vars[key].initialized)) inits.each_init[key] = false;;
	}
}

function flush_inits(state, inits) {
	for (const key of Object.keys(inits.each_init)) {
		state.vars[key].initialized = inits.each_init[key];
	}
}

module.exports = {
	// search_loops,
	check_module,
	// check_used_functions,
}