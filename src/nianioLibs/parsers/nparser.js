const ov = require('../base/ov');
const ntokenizer = require('./ntokenizer');
const ptd_parser = require('./ptd_parser');
const nast = require('../base/nast');

const DC = (obj) => JSON.parse(JSON.stringify(obj));
// const DC = (obj) => structuredClone(obj);

const end_list = [';', 'if', 'unless', 'fora', 'forh', 'rep', 'while'];

function add_error(state, message, line = null, column = null, endLine = null, endColumn = null) {
	state.errors.push({
		message: message,
		type: ov.mk('error'),
		debug: {
			begin: {
				line: line ?? ntokenizer.get_line(state.state),
				position: column ?? ntokenizer.get_column(state.state)
			},
			end: {
				line: endLine ?? line ?? ntokenizer.get_line(state.state),
				position: endColumn ?? ((column ?? ntokenizer.get_column(state.state)) + 1),
			}
		}
	});
}

function add_warning(state, msg, line, position, endLine, endColumn) {
	state.warnings.push({
		message: msg,
		type: ov.mk('warning'),
		debug: { begin: { line, position }, end: { line: endLine, position: endColumn } }
	});
}

function eat(state, token) {
	if (ntokenizer.eat_token(state.state, token)) return true;
	add_error(state, 'expected: ' + token + '\n' + ntokenizer.info(state.state));
	return false;
}

function try_eat(state, token) {
	return ntokenizer.eat_token(state.state, token);
}

function parse_module(state, addMethod = null) {
	const mod = { module_name: state.module_name, imports: [], fun_def: [], stamp: '', ending_comment: [], importsMap: {} };
	mod.stamp = ntokenizer.pop_last_comment(state.state).join('\n');
	let place = ntokenizer.get_place(state.state);
	while (try_eat(state, 'use')) {
		if (ntokenizer.is_type(state.state, ov.mk('word'))) {
			const wordPlace = ntokenizer.get_place(state.state);
			const imp = {
				name: ntokenizer.eat_type(state.state, ov.mk('word')),
				line: place.line,
				column: place.position,
				endLine: ntokenizer.get_line(state.state),
				endColumn: ntokenizer.get_column(state.state),
			};
			mod.imports.push(imp);
			state.varPositions[`${wordPlace.line}|${wordPlace.position}`] = { 'use': imp.name };
			if (imp.name in state.importsMap) {
				add_warning(state, 'multiple use module:' + imp.name, imp.line, imp.column, imp.endLine, imp.endColumn);
			} else {
				state.importsMap[imp.name] = { usageCount: 0, place: imp };
			}
		} else {
			add_error(state, 'expected word as name of module');
		}
		eat(state, ';');
		place = ntokenizer.get_place(state.state);
	}
	while (ntokenizer.next_is(state.state, 'def')) {
		const try_fun_def = parse_fun_def(state);
		if (ov.is(try_fun_def, 'ok')) {
			const fun_def = ov.as(try_fun_def, 'ok');
			mod.fun_def.push(fun_def);
			if (addMethod !== null) addMethod(fun_def);
		} else {
			add_error(state, ov.as(try_fun_def, 'err'));
			while (!ntokenizer.next_is(state.state, 'def') && !ntokenizer.is_type(state.state, ov.mk('end'))) {
				ntokenizer.get_next_token(state.state);
			}
		}
	}

	for (const imp of mod.imports) {
		if (state.importsMap[imp.name].usageCount === 0) add_warning(state, 'unused module:' + imp.name, imp.line, imp.column, imp.endLine, imp.endColumn);
	}

	if (!ntokenizer.is_type(state.state, ov.mk('end'))) add_error(state, 'expected function definition');
	mod.ending_comment = ntokenizer.get_next_comment(state.state);
	mod.importsMap = state.importsMap;
	return mod;
}

function parse_fun_arg_list(state) {
	eat(state, '(');
	const ret = [];
	while (!ntokenizer.next_is(state.state, ')')) {
		const el = { mod: ov.mk('none'), type: ov.mk('none'), name: '', tct_type: ov.mk('tct_im'), place: ntokenizer.get_place(state.state) };
		if (try_eat(state, 'ref')) {
			el.mod = ov.mk('ref', el.place);
			el.place = ntokenizer.get_place(state.state);
		}
		if (ntokenizer.is_type(state.state, ov.mk('word'))) {
			el.name = ntokenizer.eat_type(state.state, ov.mk('word'));
		} else {
			add_error(state, 'word expected as fun arg name');
		}
		if (try_eat(state, ':')) {
			const try_tmp = parse_type(state);
			if (ov.is(try_tmp, 'err')) return try_tmp;
			const tmp = ov.as(try_tmp, 'ok')
			el.type = ov.mk('type', tmp);
			if (state.parse_types) {
				const try_tct_type = ptd_parser.try_value_to_ptd(tmp);
				if (ov.is(try_tct_type, 'ok')) {
					const tct_type = ov.as(try_tct_type, 'ok');
					el.tct_type = tct_type;
				}
			}
		}
		ret.push(el);
		if (!try_eat(state, ',')) break;
	}
	eat(state, ')');
	return ov.mk('ok', ret);
}

function parse_fun_def(state) {
	const ret = {
		ret_type: { type: ov.mk('none'), tct_type: ov.mk('tct_im') },
		line: ntokenizer.get_line(state.state),
		args: [],
		name: '',
		cmd: { debug: get_debug_from_begin(state), cmd: ov.mk('nop') },
		access: ov.mk('priv'),
		defines_type: ov.mk('no'),
		comment: [],
	};
	eat(state, 'def');
	const place = ntokenizer.get_place(state.state);
	const try_ret_name = eat_text(state);
	if (ov.is(try_ret_name, 'err')) return try_ret_name;
	ret.name = ov.as(try_ret_name, 'ok');
	if (try_eat(state, '::')) {
		if (ret.name !== state.module_name) {
			add_error(state, `incorrect module name: ${ret.name} of function, expected: ${state.module_name}`, place.line, place.position, place.line, place.position + ret.name.length);
		}
		const try_ret_name = eat_text(state);
		if (ov.is(try_ret_name, 'err')) return try_ret_name;
		ret.name = ov.as(try_ret_name, 'ok')
		ret.access = ov.mk('pub');
	}
	const try_ret_args = parse_fun_arg_list(state);
	if (ov.is(try_ret_args, 'err')) return try_ret_args;
	ret.args = ov.as(try_ret_args, 'ok')
	if (ntokenizer.next_is(state.state, ':')) {
		eat(state, ':');
		const try_tmp = parse_type(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret.ret_type.type = ov.mk('type', tmp);
		if (state.parse_types) {
			const try_tct_type = ptd_parser.try_value_to_ptd(tmp);
			if (ov.is(try_tct_type, 'ok')) {
				const tct_type = ov.as(try_tct_type, 'ok');
				ret.ret_type.tct_type = tct_type;
			}
		}
	}
	ret.comment = ntokenizer.pop_last_comment(state.state);
	const try_ret_cmd = parse_block(state);
	if (ov.is(try_ret_cmd, 'err')) return try_ret_cmd;
	ret.cmd = ov.as(try_ret_cmd, 'ok')
	const try_def_to_ptd = ptd_parser.fun_def_to_ptd(ret.cmd);
	if (ov.is(try_def_to_ptd, 'err')) {
		ret.defines_type = ov.mk('no');
	} else if (ov.is(try_def_to_ptd, 'ok')) {
		ret.defines_type = ov.mk('yes', ov.as(try_def_to_ptd, 'ok'));
	}
	return ov.mk('ok', ret);
}

function parse_fun_val_arg_list(state) {
	const res = [];
	while (!ntokenizer.next_is(state.state, ')')) {
		const try_tmp = parse_fun_val_arg(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		res.push(tmp);
		if (!try_eat(state, ',')) break;
	}
	eat(state, ')');
	return ov.mk('ok', res);
}

function parse_expr_list(state) {
	const res = [];
	while (!ntokenizer.next_is(state.state, ')')) {
		const try_tmp = parse_expr(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		res.push(tmp);
		if (!try_eat(state, ',')) break;
	}
	eat(state, ')');
	return ov.mk('ok', res);
}

function parse_fun_val_arg(state) {
	const el = { mod: try_eat(state, 'ref') ? ov.mk('ref') : ov.mk('none'), place: ntokenizer.get_place(state.state) };
	const try_el_val = parse_expr(state);
	if (ov.is(try_el_val, 'err')) return try_el_val;
	el.val = ov.as(try_el_val, 'ok')
	el.expected_type = ov.mk('tct_im');
	return ov.mk('ok', el);
}

function parse_fun_label(state, begin) {
	const ret = { name: '', module: '' };
	if (!ntokenizer.is_type(state.state, ov.mk('word'))) {
		add_error(state, 'after \'@\' module name of function expacted');
		return ret;
	}
	ret.module = ntokenizer.eat_type(state.state, ov.mk('word'));
	if (try_eat(state, '::') && ntokenizer.is_text(state.state)) {
		ret.name = ntokenizer.eat_text(state.state);
		state.addReference(`${ret.module}::${ret.name}`, begin);
		addModuleUsage(state, ret.module, begin);
	} else {
		add_error(state, 'reference of function can be taken only to public function');
	}
	return ret;
}

function addModuleUsage(state, module, place) {
	if (state.module_name == module) return;
	if (module in state.importsMap) {
		state.importsMap[module].usageCount++;
	} else {
		add_error(state, `module \'${module}\' not imported`, place.line, place.position, place.line, place.position + module.length);
	}
}

function parse_label(state, begin) {
	const word = ntokenizer.eat_type(state.state, ov.mk('word'));
	if (!ntokenizer.next_is(state.state, '(') && !ntokenizer.next_is(state.state, '::')) return ov.mk('ok', ov.mk('var', word));
	const fun_val = { module: '', name: '', args: [], debug: { begin, end: ntokenizer.get_place(state.state) } };
	if (try_eat(state, '::')) {
		fun_val.module = word;
		const try_fun_val_name = eat_text(state);
		if (ov.is(try_fun_val_name, 'err')) return try_fun_val_name;
		fun_val.name = ov.as(try_fun_val_name, 'ok');
		state.addReference(`${fun_val.module}::${fun_val.name}`, begin);
		addModuleUsage(state, fun_val.module, begin);
	} else {
		fun_val.name = word;
		state.addReference(`${fun_val.name}`, begin);
	}
	fun_val.debug.end = ntokenizer.get_place(state.state);
	eat(state, '(');
	const try_fun_val_args = parse_fun_val_arg_list(state);
	if (ov.is(try_fun_val_args, 'err')) return try_fun_val_args;
	fun_val.args = ov.as(try_fun_val_args, 'ok')
	return ov.mk('ok', ov.mk('fun_val', fun_val));
}

function parse_hash_key(state) {
	const begin_place = ntokenizer.get_place(state.state);
	let ret = ov.mk('hash_key', '');
	if (ntokenizer.is_text(state.state)) {
		ret = ov.mk('hash_key', ntokenizer.eat_text(state.state));
	} else if (ntokenizer.is_type(state.state, ov.mk('string'))) {
		ret = ov.mk('hash_key', ntokenizer.eat_type(state.state, ov.mk('string')));
	}
	return {
		debug: { begin: begin_place, end: ntokenizer.get_place(state.state), comment: [] },
		value: ret,
		type: ov.mk('tct_im'),
	};
}

function parse_hash(state) {
	const ret = [];
	eat(state, '{');
	while (!ntokenizer.next_is(state.state, '}')) {
		const key = parse_hash_key(state);
		eat(state, '=>');
		const try_val = parse_expr(state);
		if (ov.is(try_val, 'err')) return try_val;
		const val = ov.as(try_val, 'ok')
		ret.push({ key: key, val: val });
		if (!try_eat(state, ',')) break;
	}
	eat(state, '}');
	return ov.mk('ok', ret);
}

function parse_arr(state) {
	const ret = [];
	eat(state, '[');
	while (!ntokenizer.next_is(state.state, ']')) {
		const try_tmp = parse_expr(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret.push(tmp);
		if (!try_eat(state, ',')) break;
	}
	eat(state, ']');
	return ov.mk('ok', ret);
}

function parse_expr(state) {
	const try_left = parse_expr_rec(state, 0);
	if (ov.is(try_left, 'err')) return try_left;
	const left = ov.as(try_left, 'ok')
	return parse_expr_rec_left(state, left, 0);
}

function parse_type(state) {
	const begin = ntokenizer.get_place(state.state);
	if (try_eat(state, '@')) {
		const fun_label_begin = ntokenizer.get_place(state.state);
		const fun_label = ov.mk('fun_label', parse_fun_label(state, fun_label_begin));
		const fun_label_end = ntokenizer.get_place(state.state);
		return ov.mk('ok', {
			debug: {
				begin: begin,
				end: ntokenizer.get_place(state.state),
				comment: [],
			},
			value: ov.mk('unary_op', {
				op: '@',
				val: {
					debug: { begin: fun_label_begin, end: fun_label_end, comment: [] },
					value: fun_label,
					type: ov.mk('tct_im'),
				},
			}),
			type: ov.mk('tct_im'),
		});
	}
	if (ntokenizer.is_type(state.state, ov.mk('word'))) {
		const try_ret = parse_label(state, begin);
		if (ov.is(try_ret, 'err')) return try_ret;
		const ret = ov.as(try_ret, 'ok');
		if (ov.is(ret, 'fun_val')) {
			return ov.mk('ok', {
				debug: { begin: begin, end: ntokenizer.get_place(state.state), comment: [] },
				value: ret,
				type: ov.mk('tct_im'),
			});
		}
	}
	add_error(state, 'wrong format of type, expected \'@\' or function call');
	return ov.mk('ok', {
		debug: { begin: begin, end: ntokenizer.get_place(state.state), comment: [] },
		value: ov.mk('nop'),
		type: ov.mk('tct_im'),
	});
}

function parse_expr_rec_left(state, left, prec) {
	while (true) {
		const old_left = DC(left);
		let new_left;
		const new_begin = ntokenizer.get_place(state.state);
		const token = ntokenizer.get_token(state.state);
		let op;
		if (Object.keys(nast.ops.ternary).includes(token)) {
			const op_st = nast.ops.ternary[token];
			op = token;
			if (op === '?') {
				if (op_st.prec < prec || (op_st.prec == prec && ov.is(op_st.assoc, 'left'))) return ov.mk('ok', old_left);
				eat(state, op);
				const try_snd = parse_expr(state);
				if (ov.is(try_snd, 'err')) return try_snd;
				const snd = ov.as(try_snd, 'ok')
				eat(state, ':');
				const try_thrd = parse_expr_rec(state, op_st.prec);
				if (ov.is(try_thrd, 'err')) return try_thrd;
				const thrd = ov.as(try_thrd, 'ok')
				new_left = ov.mk('ternary_op', { fst: old_left, snd: snd, thrd: thrd, op: '?' });
			} else {
				return ov.mk('err', 'ternary op: ' + op);
			}
		} else if (Object.keys(nast.ops.bin).includes(token)) {
			op = token;
			const op_st = nast.ops.bin[token];
			if (op_st.prec < prec || (op_st.prec == prec && ov.is(op_st.assoc, 'left'))) return ov.mk('ok', old_left);
			eat(state, token);
			if (op === '->') {
				new_left = ov.mk('bin_op', { op: op, left: old_left, right: parse_hash_key(state) });
			} else if (op === 'as') {
				eat(state, ':');
				const name = parse_hash_key(state);
				new_left = ov.mk('bin_op', { op: 'OV_AS', left: old_left, right: name });
			} else if (op === 'is') {
				eat(state, ':');
				const name = parse_hash_key(state);
				new_left = ov.mk('bin_op', { op: 'OV_IS', left: old_left, right: name });
			} else {
				if (op === '=') check_lvalue(state, old_left);
				const try_tmp = parse_expr_rec(state, nast.ops.bin[op].prec);
				if (ov.is(try_tmp, 'err')) return try_tmp;
				const tmp = ov.as(try_tmp, 'ok')
				new_left = ov.mk('bin_op', { left: old_left, op: op, right: tmp });
			}
		} else if (try_eat(state, '[')) {
			op = 'ARRAY_INDEX';
			const try_right = parse_expr(state);
			if (ov.is(try_right, 'err')) return try_right;
			const right = ov.as(try_right, 'ok')
			eat(state, ']');
			new_left = ov.mk('bin_op', { op: op, left: old_left, right: right });
		} else if (try_eat(state, '{')) {
			op = 'HASH_INDEX';
			const try_right = parse_expr(state);
			if (ov.is(try_right, 'err')) return try_right;
			const right = ov.as(try_right, 'ok')
			eat(state, '}');
			new_left = ov.mk('bin_op', { op: op, left: old_left, right: right });
		} else if (try_eat(state, '++')) {
			new_left = ov.mk('post_inc', old_left);
		} else if (try_eat(state, '--')) {
			new_left = ov.mk('post_dec', old_left);
		} else {
			return ov.mk('ok', old_left);
		}
		left.debug = DC({ begin: new_begin, end: ntokenizer.get_place(state.state), comment: [] });
		left.value = DC(new_left);
		left.type = ov.mk('tct_im');
	}
}

function parse_expr_rec(state, prec) {
	let expr;
	const begin = ntokenizer.get_place(state.state);
	if (try_eat(state, '(')) {
		const try_tmp = parse_expr(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		expr = ov.mk('parenthesis', tmp);
		eat(state, ')');
	} else if (ntokenizer.next_is(state.state, '{')) {
		const try_tmp = parse_hash(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		expr = ov.mk('hash_decl', tmp);
	} else if (ntokenizer.next_is(state.state, '[')) {
		const try_tmp = parse_arr(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		expr = ov.mk('arr_decl', tmp);
	} else if (ntokenizer.next_is(state.state, ':')) {
		const try_tmp = parse_variant(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		expr = ov.mk('variant', tmp);
	} else if (ntokenizer.is_type(state.state, ov.mk('number'))) {
		const const_str = ntokenizer.eat_type(state.state, ov.mk('number'));
		if (/^-?(\d+|0x[0-9a-fA-F]+)$/.test(const_str)) {
			expr = ov.mk('const', Number.parseInt(const_str));
		} else {
			return ov.mk('err', 'Invalid number: ' + const_str);
		}
	} else if (ntokenizer.is_type(state.state, ov.mk('multi_string')) || ntokenizer.is_type(state.state, ov.mk('string'))) {
		const ret = { arr: [] };
		while (ntokenizer.is_type(state.state, ov.mk('multi_string'))) {
			ret.arr.push(ntokenizer.eat_type(state.state, ov.mk('multi_string')));
		}
		if (ntokenizer.is_type(state.state, ov.mk('string'))) {
			ret.arr.push(ntokenizer.eat_type(state.state, ov.mk('string')));
			ret.last = ov.mk('end');
		} else {
			ret.last = ov.mk('new_line');
		}
		expr = ov.mk('string', ret);
	} else if (ntokenizer.is_type(state.state, ov.mk('word'))) {
		const try_expr = parse_label(state, begin);
		if (ov.is(try_expr, 'err')) return try_expr;
		expr = ov.as(try_expr, 'ok')
	} else if (ntokenizer.is_type(state.state, ov.mk('operator')) && ntokenizer.get_token(state.state) in nast.ops.unary) {
		const op = ntokenizer.eat_type(state.state, ov.mk('operator'));
		let value;
		if (op === '@') {
			const fun_label_begin = ntokenizer.get_place(state.state);
			const fun_label = ov.mk('fun_label', parse_fun_label(state, fun_label_begin));
			const fun_label_end = ntokenizer.get_place(state.state);
			value = {
				debug: {
					begin: fun_label_begin,
					end: fun_label_end,
					comment: [],
				},
				value: fun_label,
				type: ov.mk('tct_im'),
			};
		} else {
			const try_value = parse_expr_rec(state, nast.ops.unary[op].prec);
			if (ov.is(try_value, 'err')) return try_value;
			value = ov.as(try_value, 'ok')
			if (ov.is(value.value, 'unary_op')) add_error(state, 'unary operator after unary operator');
		}
		expr = ov.mk('unary_op', { op: op, val: value });
	} else if (ntokenizer.is_type(state.state, ov.mk('keyword'))) {
		if (try_eat(state, 'true')) {
			expr = ov.mk('bool', true);
		} else if (try_eat(state, 'false')) {
			expr = ov.mk('bool', false);
		} else {
			const err = 'use keyword in wrong context:' + '\n' + ntokenizer.info(state.state);
			add_error(state, err);
			return ov.mk('err', err);
		}
	} else {
		const err = 'error in parse_expr:' + '\n' + ntokenizer.info(state.state);
		return ov.mk('err', err);
	}
	const left = {
		debug: { begin: begin, end: ntokenizer.get_place(state.state), comment: [] },
		value: expr,
		type: ov.mk('tct_im'),
	};
	return parse_expr_rec_left(state, left, prec);
}

function get_value_nop(state) {
	return {
		debug: {
			begin: ntokenizer.get_place(state.state),
			end: ntokenizer.get_place(state.state),
			comment: [],
		},
		value: ov.mk('nop'),
		type: ov.mk('tct_im'),
	};
}

function eat_text(state) {
	if (ntokenizer.is_text(state.state)) {
		return ov.mk('ok', ntokenizer.eat_text(state.state));
	} else {
		return ov.mk('err', 'word expected');
	}
}

function parse_variant_label(state) {
	if (ntokenizer.is_text(state.state)) {
		return ntokenizer.eat_text(state.state);
	} else {
		add_error(state, 'word expected');
		return '';
	}
}

function parse_variant(state) {
	eat(state, ':');
	const name = parse_variant_label(state);
	let decl = get_value_nop(state);
	if (try_eat(state, '(')) {
		const try_decl = parse_expr(state);
		if (ov.is(try_decl, 'err')) return try_decl;
		decl = ov.as(try_decl, 'ok')
		eat(state, ')');
	} else {
		decl = get_value_nop(state);
	}
	return ov.mk('ok', { name: name, var: decl });
}

function check_lvalue(state, lval) {
	if (ov.is(lval.value, 'var')) {
		return;
	} else if (ov.is(lval.value, 'bin_op')) {
		const bin_op = ov.as(lval.value, 'bin_op');
		if (bin_op.op === '->' || bin_op.op === 'ARRAY_INDEX' || bin_op.op === 'HASH_INDEX' || bin_op.op === 'OV_AS') {
			check_lvalue(state, bin_op.left);
			return;
		}
	} else if (ov.is(lval.value, 'parenthesis')) {
		check_lvalue(state, ov.as(lval.value, 'parenthesis'));
		return;
	}
	add_error(state, 'invalid expr for lvalue');
}

function parse_variant_decl(state) {
	eat(state, ':');
	const ret = { name: parse_variant_label(state), value: ov.mk('none') };
	if (try_eat(state, '(')) {
		if (ntokenizer.next_is(state.state, 'var')) {
			ret.value = ov.mk('value', { declaration: parse_var_decl_sim(state), mod: ov.mk('none') });
		} else {
			ret.value = ov.mk('value', { declaration: parse_ref_var_decl_sim(state), mod: ov.mk('ref') });
		}
		eat(state, ')');
	}
	return ret;
}

function parse_var_decl(state) {
	eat(state, 'var');
	const ret = { name: '', type: ov.mk('none'), tct_type: ov.mk('tct_im'), value: ov.mk('none'), place: ntokenizer.get_place(state.state), mod: ov.mk('none') };
	if (ntokenizer.is_type(state.state, ov.mk('word'))) {
		ret.name = ntokenizer.eat_type(state.state, ov.mk('word'));
	} else {
		add_error(state, 'variable name expected');
	}
	if (try_eat(state, ':')) {
		const try_tmp = parse_type(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret.type = ov.mk('type', tmp);
		if (state.parse_types) {
			const try_tct_type = ptd_parser.try_value_to_ptd(tmp);
			if (ov.is(try_tct_type, 'err')) return try_tct_type;
			const tct_type = ov.as(try_tct_type, 'ok')
			ret.tct_type = tct_type;
		}
	}
	if (try_eat(state, '=')) {
		const try_tmp = parse_expr(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret.value = ov.mk('value', tmp);
	}
	return ov.mk('ok', ret);
}

function parse_var_decl_sim(state) {
	eat(state, 'var');
	const ret = { name: '', type: ov.mk('none'), tct_type: ov.mk('tct_im'), value: ov.mk('none'), place: ntokenizer.get_place(state.state), mod: ov.mk('none') };
	if (ntokenizer.is_type(state.state, ov.mk('word'))) {
		ret.name = ntokenizer.eat_type(state.state, ov.mk('word'));
	} else {
		add_error(state, 'variable name expected');
	}
	return ret;
}

function parse_ref_var_decl_sim(state) {
	eat(state, 'ref');
	const ret = { name: '', type: ov.mk('none'), tct_type: ov.mk('tct_im'), value: ov.mk('none'), place: ntokenizer.get_place(state.state), mod: ov.mk('ref') };
	if (ntokenizer.is_type(state.state, ov.mk('word'))) {
		ret.name = ntokenizer.eat_type(state.state, ov.mk('word'));
	} else {
		add_error(state, 'variable name expected');
	}
	return ret;
}

function parse_cond(state) {
	eat(state, '(');
	const try_tmp = parse_expr(state);
	if (ov.is(try_tmp, 'err')) return try_tmp;
	const tmp = ov.as(try_tmp, 'ok')
	eat(state, ')');
	return ov.mk('ok', tmp);
}

function parse_block(state) {
	const begin_place = ntokenizer.get_place(state.state);
	eat(state, '{');
	const cmds = [];
	while (!try_eat(state, '}')) {
		if (try_eat(state, ';')) continue;
		const try_tmp = parse_cmd(state);
		if (ov.is(try_tmp, 'err')) {
			add_error(state, ov.as(try_tmp, 'err'));
			const line = ntokenizer.get_line(state.state);
			while (!ntokenizer.next_is(state.state, ';') 
				&& line === ntokenizer.get_line(state.state) 
				&& !ntokenizer.is_type(state.state, ov.mk('end'))) {
				ntokenizer.get_next_token(state.state);
			}
		} else {
			const tmp = ov.as(try_tmp, 'ok')
			cmds.push(tmp);
		}
	}
	const end_place = ntokenizer.get_place_ws(state.state);
	const debug = { begin: begin_place, end: end_place, comment: [] };
	const ending_comment = ntokenizer.pop_last_comment(state.state);
	return ov.mk('ok', { debug: debug, cmd: ov.mk('block', { cmds: cmds, ending_comment: ending_comment }) });
}

function parse_try_ensure(state) {
	if (ntokenizer.next_is(state.state, 'var')) {
		const try_tmp = parse_var_decl(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		return ov.mk('ok', ov.mk('decl', tmp));
	} else {
		const try_expr = parse_expr(state);
		if (ov.is(try_expr, 'err')) return try_expr;
		const expr = ov.as(try_expr, 'ok')
		if (ov.is(expr.value, 'bin_op') && (ov.as(expr.value, 'bin_op')).op === '=') {
			return ov.mk('ok', ov.mk('lval', ov.as(expr.value, 'bin_op')));
		} else {
			return ov.mk('ok', ov.mk('expr', expr));
		}
	}
}

function get_debug_from_begin(state) {
	return {
		begin: ntokenizer.get_place(state.state),
		end: ntokenizer.get_place(state.state),
		comment: ntokenizer.pop_last_comment(state.state),
	};
}

function parse_cmd(state) {
	const begin_place = ntokenizer.get_place(state.state);
	let ret;
	let comment;
	if (try_eat(state, 'if')) {
		const tmp = {};
		const try_tmp_cond = parse_cond(state);
		if (ov.is(try_tmp_cond, 'err')) return try_tmp_cond;
		tmp.cond = ov.as(try_tmp_cond, 'ok')
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp_if = parse_block(state);
		if (ov.is(try_tmp_if, 'err')) return try_tmp_if;
		tmp.if = ov.as(try_tmp_if, 'ok')
		const elseif = [];
		tmp.elsif = [];
		while (try_eat(state, 'elsif')) {
			const tmp2 = {};
			const begin_place2 = ntokenizer.get_place(state.state);
			const try_tmp2_cond = parse_cond(state);
			if (ov.is(try_tmp2_cond, 'err')) return try_tmp2_cond;
			tmp2.cond = ov.as(try_tmp2_cond, 'ok')
			const end_place2 = ntokenizer.get_place_ws(state.state);
			tmp2.debug = {
				begin: begin_place2,
				end: end_place2,
				comment: ntokenizer.pop_last_comment(state.state),
			};
			const try_tmp2_cmd = parse_block(state);
			if (ov.is(try_tmp2_cmd, 'err')) return try_tmp2_cmd;
			tmp2.cmd = ov.as(try_tmp2_cmd, 'ok')
			elseif.push(tmp2);
		}
		tmp.elsif = elseif;
		if (try_eat(state, 'else')) {
			const try_tmp_else = parse_block(state);
			if (ov.is(try_tmp_else, 'err')) return try_tmp_else;
			tmp.else = ov.as(try_tmp_else, 'ok')
		} else {
			tmp.else = { debug: get_debug_from_begin(state), cmd: ov.mk('nop') };
		}
		ret = ov.mk('if', tmp);
	} else if (try_eat(state, 'fora')) {
		const tmp = {};
		tmp.short = false;
		tmp.iter = parse_var_decl_sim(state);
		const try_tmp_array = parse_cond(state);
		if (ov.is(try_tmp_array, 'err')) return try_tmp_array;
		tmp.array = ov.as(try_tmp_array, 'ok')
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp_cmd = parse_block(state);
		if (ov.is(try_tmp_cmd, 'err')) return try_tmp_cmd;
		tmp.cmd = ov.as(try_tmp_cmd, 'ok')
		ret = ov.mk('fora', tmp);
	} else if (try_eat(state, 'rep')) {
		const tmp = {};
		tmp.short = false;
		tmp.iter = parse_var_decl_sim(state);
		const try_tmp_count = parse_cond(state);
		if (ov.is(try_tmp_count, 'err')) return try_tmp_count;
		tmp.count = ov.as(try_tmp_count, 'ok')
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp_cmd = parse_block(state);
		if (ov.is(try_tmp_cmd, 'err')) return try_tmp_cmd;
		tmp.cmd = ov.as(try_tmp_cmd, 'ok')
		ret = ov.mk('rep', tmp);
	} else if (try_eat(state, 'loop')) {
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp = parse_block(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret = ov.mk('loop', tmp);
	} else if (try_eat(state, 'forh')) {
		const tmp = {};
		tmp.short = false;
		tmp.key = parse_var_decl_sim(state);
		eat(state, ',');
		if (ntokenizer.next_is(state.state, 'var')) {
			tmp.val = parse_var_decl_sim(state);
			tmp.val_mod = ov.mk('none');
		} else {
			tmp.val = parse_ref_var_decl_sim(state);
			tmp.val_mod = ov.mk('ref');
		}
		const try_tmp_hash = parse_cond(state);
		if (ov.is(try_tmp_hash, 'err')) return try_tmp_hash;
		tmp.hash = ov.as(try_tmp_hash, 'ok')
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp_cmd = parse_block(state);
		if (ov.is(try_tmp_cmd, 'err')) return try_tmp_cmd;
		tmp.cmd = ov.as(try_tmp_cmd, 'ok')
		ret = ov.mk('forh', tmp);
	} else if (try_eat(state, 'while')) {
		const tmp = {};
		tmp.short = false;
		const try_tmp_cond = parse_cond(state);
		if (ov.is(try_tmp_cond, 'err')) return try_tmp_cond;
		tmp.cond = ov.as(try_tmp_cond, 'ok')
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp_cmd = parse_block(state);
		if (ov.is(try_tmp_cmd, 'err')) return try_tmp_cmd;
		tmp.cmd = ov.as(try_tmp_cmd, 'ok')
		ret = ov.mk('while', tmp);
	} else if (try_eat(state, 'for')) {
		const tmp = {};
		eat(state, '(');
		if (ntokenizer.next_is(state.state, 'var')) {
			const try_tmp2 = parse_var_decl(state);
			if (ov.is(try_tmp2, 'err')) return try_tmp2;
			const tmp2 = ov.as(try_tmp2, 'ok')
			tmp.start = ov.mk('var_decl', tmp2);
		} else if (ntokenizer.next_is(state.state, ';')) {
			tmp.start = ov.mk('value', get_value_nop(state));
		} else {
			const try_tmp2 = parse_expr(state);
			if (ov.is(try_tmp2, 'err')) return try_tmp2;
			const tmp2 = ov.as(try_tmp2, 'ok')
			tmp.start = ov.mk('value', tmp2);
		}
		eat(state, ';');
		tmp.cond = get_value_nop(state);
		if (!ntokenizer.next_is(state.state, ';')) {
			const try_tmp_cond = parse_expr(state);
			if (ov.is(try_tmp_cond, 'err')) return try_tmp_cond;
			tmp.cond = ov.as(try_tmp_cond, 'ok');
		}
		eat(state, ';');
		tmp.iter = get_value_nop(state);
		if (!ntokenizer.next_is(state.state, ')')) {
			const try_tmp_iter = parse_expr(state)
			if (ov.is(try_tmp_iter, 'err')) return try_tmp_iter;
			tmp.iter = ov.as(try_tmp_iter, 'ok');
		}
		eat(state, ')');
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp_cmd = parse_block(state);
		if (ov.is(try_tmp_cmd, 'err')) return try_tmp_cmd;
		tmp.cmd = ov.as(try_tmp_cmd, 'ok')
		ret = ov.mk('for', tmp);
	} else if (ntokenizer.next_is(state.state, '{')) {
		comment = ntokenizer.pop_last_comment(state.state);
		const try_tmp = parse_block(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret = tmp.cmd;
	} else if (try_eat(state, 'break')) {
		comment = ntokenizer.pop_last_comment(state.state);
		ret = ov.mk('break');
	} else if (try_eat(state, 'continue')) {
		comment = ntokenizer.pop_last_comment(state.state);
		ret = ov.mk('continue');
	} else if (try_eat(state, 'return')) {
		const tok = ntokenizer.get_token(state.state);
		if (end_list.includes(tok)) {
			ret = ov.mk('return', get_value_nop(state));
		} else {
			const try_tmp = parse_expr(state);
			if (ov.is(try_tmp, 'err')) return try_tmp;
			const tmp = ov.as(try_tmp, 'ok')
			ret = ov.mk('return', tmp);
		}
		comment = ntokenizer.pop_last_comment(state.state);
	} else if (try_eat(state, 'match')) {
		eat(state, '(');
		const try_tmp = parse_expr(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		const ret2 = { val: tmp, branch_list: [] };
		eat(state, ')');
		let begin_case = ntokenizer.get_place(state.state);
		comment = ntokenizer.pop_last_comment(state.state);
		while (try_eat(state, 'case')) {
			const elem = { variant: parse_variant_decl(state) };
			elem.debug = { begin: begin_case, end: ntokenizer.get_place_ws(state.state), comment: [] };
			const try_elem_cmd = parse_block(state);
			if (ov.is(try_elem_cmd, 'err')) return try_elem_cmd;
			elem.cmd = ov.as(try_elem_cmd, 'ok')
			ret2.branch_list.push(elem);
			begin_case = ntokenizer.get_place(state.state);
		}
		ret = ov.mk('match', ret2);
	} else if (try_eat(state, 'die')) {
		let args = [];
		if (try_eat(state, '(')) {
			const try_args = parse_expr_list(state);
			if (ov.is(try_args, 'err')) return try_args;
			args = ov.as(try_args, 'ok')
		}
		ret = ov.mk('die', args);
		comment = ntokenizer.pop_last_comment(state.state);
	} else if (ntokenizer.next_is(state.state, 'var')) {
		const try_tmp = parse_var_decl(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret = ov.mk('var_decl', tmp);
		eat(state, ';');
		comment = ntokenizer.pop_last_comment(state.state);
	} else if (ntokenizer.next_is(state.state, 'try')) {
		eat(state, 'try');
		const try_tmp = parse_try_ensure(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret = ov.mk('try', tmp);
		comment = ntokenizer.pop_last_comment(state.state);
	} else if (ntokenizer.next_is(state.state, 'ensure')) {
		eat(state, 'ensure');
		const try_tmp = parse_try_ensure(state);
		if (ov.is(try_tmp, 'err')) return try_tmp;
		const tmp = ov.as(try_tmp, 'ok')
		ret = ov.mk('ensure', tmp);
		comment = ntokenizer.pop_last_comment(state.state);
	} else {
		const try_expr = parse_expr(state);
		if (ov.is(try_expr, 'err')) return try_expr;
		const expr = ov.as(try_expr, 'ok')
		ret = ov.mk('value', expr);
		comment = ntokenizer.pop_last_comment(state.state);
	}
	if (ov.is(ret, 'break') || ov.is(ret, 'continue') || ov.is(ret, 'value') || ov.is(ret, 'return') || ov.is(ret, 'die') || ov.is(ret, 'ensure') || ov.is(ret, 'try')) {
		const cmd_debug = {
			begin: begin_place,
			end: ntokenizer.get_place_ws(state.state),
			comment: [],
		};
		const el = { cmd: { debug: cmd_debug, cmd: ret } };
		if (try_eat(state, 'fora')) {
			el.short = true;
			el.iter = parse_var_decl_sim(state);
			eat(state, '(');
			const try_el_array = parse_expr(state);
			if (ov.is(try_el_array, 'err')) return try_el_array;
			el.array = ov.as(try_el_array, 'ok')
			eat(state, ')');
			ret = ov.mk('fora', el);
		} else if (try_eat(state, 'rep')) {
			el.short = true;
			el.iter = parse_var_decl_sim(state);
			eat(state, '(');
			const try_el_array = parse_expr(state);
			if (ov.is(try_el_array, 'err')) return try_el_array;
			el.count = ov.as(try_el_array, 'ok')
			eat(state, ')');
			ret = ov.mk('rep', el);
		} else if (try_eat(state, 'forh')) {
			el.short = true;
			el.key = parse_var_decl_sim(state);
			eat(state, ',');
			if (ntokenizer.next_is(state.state, 'var')) {
				el.val = parse_var_decl_sim(state);
				el.val_mod = ov.mk('none');
			} else {
				el.val = parse_ref_var_decl_sim(state);
				el.val_mod = ov.mk('ref');
			}
			eat(state, '(');
			const try_el_hash = parse_expr(state);
			if (ov.is(try_el_hash, 'err')) return try_el_hash;
			el.hash = ov.as(try_el_hash, 'ok')
			eat(state, ')');
			ret = ov.mk('forh', el);
		} else if (try_eat(state, 'if')) {
			const try_el_cond = parse_expr(state);
			if (ov.is(try_el_cond, 'err')) return try_el_cond;
			el.cond = ov.as(try_el_cond, 'ok')
			ret = ov.mk('if_mod', el);
		} else if (try_eat(state, 'unless')) {
			const try_el_cond = parse_expr(state);
			if (ov.is(try_el_cond, 'err')) return try_el_cond;
			el.cond = ov.as(try_el_cond, 'ok')
			ret = ov.mk('unless_mod', el);
		} else if (try_eat(state, 'while')) {
			el.short = true;
			const try_el_cond = parse_expr(state);
			if (ov.is(try_el_cond, 'err')) return try_el_cond;
			el.cond = ov.as(try_el_cond, 'ok')
			ret = ov.mk('while', el);
		}
		eat(state, ';');
	}
	const end_place = ntokenizer.get_place_ws(state.state);
	const debug = { begin: begin_place, end: end_place, comment: comment };
	return ov.mk('ok', { cmd: ret, debug: debug });
}

function sparse(s, module_name, addReference = null, addMethod = null) {
	const state = {
		errors: [],
		warnings: [],
		state: {
			text: s,
			len: s.length,
			pos: 0,
			type: ov.mk('end'),
			next_token: '',
			ln_nr: 1,
			ln_pos: 1,
			place: { line: 1, position: 0 },
			place_ws: { line: 1, position: 0 },
			last_comment: [],
			next_comment: [],
		},
		module_name: module_name,
		parse_types: true,
		addReference: addReference ?? ((_, __) => {}),
		varPositions: {},
		importsMap: {}
	};
	ntokenizer.init(state.state);
	const ret = parse_module(state, addMethod);
	ret.errors = state.errors;
	ret.warnings = state.warnings;
	ret.varPositions = state.varPositions;
	return ret;
}

module.exports = { sparse }