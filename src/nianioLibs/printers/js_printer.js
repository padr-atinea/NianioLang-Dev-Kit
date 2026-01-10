const ov = require('../base/ov');
const wprinter = require('./wprinter');

const useDC = false;

function state_print(state, str) {
	state.out += str;
}

function print_imports(state, imports) {
	let imps = [];
	imps.push(`const ov = require('./base/ov');`);
	for (const imp of imports.filter(i => i.name !== 'ov')) {
		imps.push(`const ${imp.name} = require('./${['array', 'string', 'hash', 'nast'].includes(imp.name) ? `base/` : ''}${imp.name}');`);
	}
	state_print(state, imps.join('\n'));
	state_print(state, `\n\n`);
}

function print_module_to_str(mod, varPositions) {
	wprinter.set_line_width(500);
	let state = { out: '', removeMod: true, printNewStamp: true, exports: [] };
	print_imports(state, mod.imports);
	state_print(state, `// const DC = (obj) => JSON.parse(JSON.stringify(obj));
const DC = (obj) => structuredClone(obj);

const ObjectAssignInPlace = (objA, objB) => 
	Object.keys(objA).forEach(key => delete objA[key]) ??
	Object.keys(objB).forEach(key => objA[key] = objB[key]);

const ArrayAssignInPlace = (objA, arrB) => { while (objA.pop()); objA.push(...arrB); };

`);
	for (const function_ of mod.fun_def) {
		if (ov.is(function_.defines_type, 'yes')) continue;
		try {
			print_fun_def(state, function_, mod.module_name, varPositions);
			state_print(state, `\n\n`);
		} catch (e) {
			console.log(e.message);
			console.log(e.stack);
		}
	}
	print_comment(state, mod.ending_comment, 0, 0);

	state_print(state, `\n\nmodule.exports = {\n\t${state.exports.join(',\n\t')}\n}`)

	state.out = state.out
		.replaceAll(`${mod.module_name}.`, '')
		.replaceAll('ov.mk_val(', 'ov.mk(')
		.replaceAll('DC(true)', 'true')
		.replaceAll('DC({})', '{}')
		.replaceAll('DC([])', '[]')
		.replaceAll('DC(false)', 'false')
		// .replaceAll('\\', '\\\\')
		// .replaceAll('\\\\\'\'', '\\\'\'')
		.replaceAll(/DC\((\d+)\)/g, '$1')
		.replaceAll(/DC\(('[a-z_\\"\dA-Z:;\{\}\[\\.,?]` -\|]*')\)/g, '$1')
		.replaceAll(/DC\((:[a-z_\dA-Z]+)\)/g, '$1');

	wprinter.set_line_width(120);
	return state.out;
}

function print_fun_def(state, function_, module_name, varPositions) {
	print_comment(state, function_.comment, 0, 0);
	const refs = print_fun_def_head(state, function_, module_name);
	print_st(state, function_.cmd, 0, refs, varPositions);
}

function print_fun_def_head(state, function_, module_name) {
	let name = '';
	if (ov.is(function_.access, 'pub')) {
		state.exports.push(function_.name);
		// name += `${module_name}::`;
	} else if (ov.is(function_.access, 'priv')) {
	}
	name += function_.name;
	let ret = [
			wprinter.build_sim('function'),
			wprinter.get_sep(),
			wprinter.build_sim(name),
			wprinter.build_sim('(')
		];

	let refs = {};
	for (let i = 0; i < function_.args.length; i++) {
		let el = function_.args[i];
		if (ov.is(el.mod, 'ref')) {
			ret.push(...[wprinter.build_sim('/*ref*/ ref_')]);
			refs[escape_special_keywords(el.name)] = true;
		} else if (ov.is(el.mod, 'none')) {
		}
		ret.push(wprinter.build_sim(escape_special_keywords(el.name)));
		// if (ov.is(el.type, 'type')) {
		// 	const type = ov.as(el.type, 'type');
		// 	ret.push(...[wprinter.get_sep(), wprinter.build_sim(':'), wprinter.get_sep(), print_val(type, refs, varPositions)]);
		// } else if (ov.is(el.type, 'none')) {
		// }
		if (i != function_.args.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	ret.push(wprinter.build_sim(')'));
	// if (ov.is(function_.ret_type.type, 'type')) {
	// 	const type = ov.as(function_.ret_type.type, 'type');
	// 	ret.push(...[
	// 			wprinter.get_sep(),
	// 			wprinter.build_sim(':'),
	// 			wprinter.get_sep(),
	// 			print_sim_value(type)
	// 		]);
	// } else if (ov.is(function_.ret_type.type, 'none')) {
	// }
	wprinter.print_t(state, wprinter.build_pretty_l(ret), 0);
	return refs;
}

function join_print_var_decl(aval, refs, varPositions) {
	let ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_var_decl(aval[i], refs, varPositions));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function print_var_decl(var_decl, refs, varPositions) {
	let list = [wprinter.build_sim((var_decl.isConst ?? false) ? 'const' : 'let'), wprinter.get_sep()];
	// if (ov.is(var_decl.type, 'type')) {
	// 	const type = ov.as(var_decl.type, 'type');
	// 	list.push(...[
	// 			wprinter.build_sim(var_decl.name),
	// 			wprinter.get_sep(),
	// 			wprinter.build_sim(':'),
	// 			wprinter.get_sep(),
	// 			print_val(type, refs, varPositions)
	// 		]);
	// } else if (ov.is(var_decl.type, 'none')) {
	// }
	list.push(wprinter.build_sim(escape_special_keywords(var_decl.name)));
	if (ov.is(var_decl.value, 'value')) {
		const value = ov.as(var_decl.value, 'value');
		list.push(...[
			wprinter.get_sep(),
			wprinter.build_sim('='),
			wprinter.get_sep(),
			wprinter.build_sim((var_decl.disableDC ?? false) || !useDC ? '' : 'DC('),
			print_val(value, refs, varPositions),
			wprinter.build_sim((var_decl.disableDC ?? false) || !useDC ? '' : ')'),
		]);
	} else if (ov.is(var_decl.type, 'none')) {
	}
	return wprinter.build_pretty_l(list);
}

function pind(ind) {
	let r = '';
	for (let i = 0; i < ind; i++) r += '\t';
	return r;
}

function join_print_hash_elem(aval, refs, varPositions) {
	let ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_hash_elem(aval[i], refs, varPositions));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function print_hash_elem(elem, refs, varPositions) {
	if (ov.is(elem.val.value, 'hash_decl') || ov.is(elem.val.value, 'arr_decl')) {
		let key = ov.as(elem.key.value, 'hash_key');
		if (!(is_proper_hash_key(key))) key = `\'${key}\'`;
		return get_compressed_fun_val(elem.val, `${key}: `, '', refs, varPositions);
	}
	return wprinter.build_pretty_l([
			print_val(elem.key, refs, varPositions),
			wprinter.build_sim(':'),
			wprinter.get_sep(),
			print_val(elem.val, refs, varPositions)
		]);
}

function print_variant(variant, refs, varPositions) {
	if (variant.name === 'TRUE' && ov.is(variant.var.value, 'nop')) {
		return wprinter.build_sim('true');
	} else if (variant.name === 'FALSE' && ov.is(variant.var.value, 'nop')) {
		return wprinter.build_sim('false');
	}
	if (ov.is(variant.var.value, 'arr_decl') || ov.is(variant.var.value, 'hash_decl')) {
		return get_compressed_fun_val(variant.var, `ov.mk('${variant.name}', `, ')', refs, varPositions);
	}
	let ret = [];
	ret.push(...[wprinter.build_sim(`ov.mk('${variant.name}'`)]);
	if (!ov.is(variant.var.value, 'nop')) {
		ret.push(...[wprinter.build_sim(', '), print_val(variant.var, refs, varPositions)]);
	}
	ret.push(wprinter.build_sim(`)`));
	return wprinter.build_pretty_op_l(ret);
}

function join_print_fun_arg(aval, isConstArgs, refs, varPositions) {
	let ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_fun_arg(aval[i], isConstArgs, refs, varPositions));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function print_fun_arg(arg, isConstArg, refs, varPositions) {
	let ret = [];
	let isConst = isConstArg || !useDC
		|| ov.is(arg.val.value, 'const')
		|| ov.is(arg.val.value, 'string')
		|| ov.is(arg.val.value, 'bool')
		|| ov.is(arg.val.value, 'nop')
		|| ov.is(arg.val.value, 'arr_decl')
		|| ov.is(arg.val.value, 'hash_decl')
		|| ov.is(arg.val.value, 'hash_key');
	if (ov.is(arg.mod, 'ref')) {
		// ret.push(...[wprinter.build_sim('{ val: ')]);
		ret.push(...[wprinter.build_sim('/*ref*/ ')]);
	} else if (ov.is(arg.mod, 'none')) {
		if (!isConst) ret.push(...[wprinter.build_sim('DC(')]);
	}
	ret.push(print_val(arg.val, refs, varPositions));

	if (ov.is(arg.mod, 'ref')) {
		// ret.push(...[wprinter.build_sim(' }')]);
	} else if (ov.is(arg.mod, 'none')) {
		if (!isConst) ret.push(...[wprinter.build_sim(')')]);
	}
	return wprinter.build_pretty_op_l(ret);
}

function count_structs(struct) {
	let ret = 0;
	for (const el of struct) {
		if (ov.is(el.val.value, 'arr_decl') || ov.is(el.val.value, 'hash_decl')) ++ret;
	}
	return ret;
}

function get_compressed_fun_val(arg, open, close, refs, varPositions) {
	let pprint = [];
	let begin = open;
	let end = close;
	while (true) {
		if (ov.is(arg.value, 'arr_decl')) {
			let a_arg = ov.as(arg.value, 'arr_decl');
			begin += '[';
			end = `]${end}`;
			if (a_arg.length != 1) {
				pprint = join_print_val(a_arg, refs, varPositions);
				break;
			}
			arg = a_arg[0];
		} else if (ov.is(arg.value, 'hash_decl')) {
			let h_arg = ov.as(arg.value, 'hash_decl');
			begin += '{';
			end = `}${end}`;
			pprint = join_print_hash_elem(h_arg, refs, varPositions);
			break;
		} else {
			pprint = [print_val(arg, refs, varPositions)];
			break;
		}
	}
	return wprinter.build_pretty_arr_decl(pprint, begin, end);
}

function print_st(state, cmd, ind, refs, varPositions) {
	state_print(state, ' ');
	print_cmd(state, cmd, ind, refs, varPositions);
}

function get_fun_label(fun_name, fun_module) {
	return fun_module === '' ? fun_name : (`${fun_module === 'enum' ? 'ov' : fun_module}.${fun_name}`);
}

function string_to_nl(str) {
	return str.replaceAll('\'', '\\\'');
	// return str;
}

function join_print_val(aval, refs, varPositions) {
	let ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_val(aval[i], refs, varPositions));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function is_to_change_ov(val) {
	if (!(ov.is(val.value, 'fun_val'))) return false;
	let fun_val = ov.as(val.value, 'fun_val');
	if (fun_val.args.length == 2 && (fun_val.module === 'ov' || fun_val.module === 'c_ov')) {
		if ((fun_val.name === 'as' || fun_val.name === 'is') && ov.is(fun_val.args[1].val.value, 'string')) {
			let ov_case = ov.as(fun_val.args[1].val.value, 'string');
			if (ov_case.arr.length == 1 && ov_case.arr[0].indexOf(' ') < 0) {
				return true;
			}
		}
	}
	return false;
}

function print_val(val, refs, varPositions) {
	if (ov.is(val.value, 'const')) {
		const const_ = ov.as(val.value, 'const');
		return wprinter.build_sim(parseInt(const_));
	} else if (ov.is(val.value, 'string')) {
		const str_arr = ov.as(val.value, 'string');
		let arr  = [];
		for (const el of str_arr.arr) {
			arr.push(`'${string_to_nl(el)}'+`);
		}
		if (ov.is(str_arr.last, 'new_line')) {
		} else if (ov.is(str_arr.last, 'end')) {
			arr[arr.length - 1] = arr[arr.length - 1].slice(0, -1);
		}
		return wprinter.build_str_arr(arr, str_arr.last);
	} else if (ov.is(val.value, 'bool')) {
		const bool = ov.as(val.value, 'bool');
		return wprinter.build_sim(bool ? 'true' : 'false');
	} else if (ov.is(val.value, 'hash_key')) {
		const hash_key = ov.as(val.value, 'hash_key');
		if (!(is_proper_hash_key(hash_key))) hash_key = `\'${hash_key}\'`;
		return wprinter.build_sim(hash_key);
	} else if (ov.is(val.value, 'variant')) {
		const variant = ov.as(val.value, 'variant');
		return print_variant(variant, refs, varPositions);
	} else if (ov.is(val.value, 'var')) {
		const variable = escape_special_keywords(ov.as(val.value, 'var'));
		return wprinter.build_sim(refs[variable] ? `ref_${variable}` : variable);
	} else if (ov.is(val.value, 'parenthesis')) {
		const parenthesis = ov.as(val.value, 'parenthesis');
		return wprinter.build_pretty_a([wprinter.build_sim('('), print_val(parenthesis, refs, varPositions), wprinter.build_sim(')')]);
	} else if (ov.is(val.value, 'ternary_op')) {
		const ternary_op = ov.as(val.value, 'ternary_op');
		return wprinter.build_pretty_a([
				print_val(ternary_op.fst, refs, varPositions),
				wprinter.get_sep(),
				wprinter.build_pretty_op_l([wprinter.build_sim('? '), print_val(ternary_op.snd, refs, varPositions)]),
				wprinter.get_sep(),
				wprinter.build_pretty_op_l([wprinter.build_sim(': '), print_val(ternary_op.thrd, refs, varPositions)])
			]);
	} else if (ov.is(val.value, 'bin_op')) {
		const bin_op = ov.as(val.value, 'bin_op');
		let op = bin_op.op;
		if (op === 'ARRAY_INDEX') {
			return wprinter.build_pretty_a([
				wprinter.build_pretty_l([print_val(bin_op.left, refs, varPositions), wprinter.build_sim('[')]),
				print_val(bin_op.right, refs, varPositions),
				wprinter.build_sim(']')
			]);
		} else if (op === 'HASH_INDEX') {
			return wprinter.build_pretty_a([
				wprinter.build_pretty_l([print_val(bin_op.left, refs, varPositions), wprinter.build_sim('[')]),
				print_val(bin_op.right, refs, varPositions),
				wprinter.build_sim(']')
			]);
		} else if (op === '->') {
			let left;
			if (is_to_change_ov(bin_op.left)) {
				left = wprinter.build_pretty_a([
						wprinter.build_sim('('),
						print_val(bin_op.left, refs, varPositions),
						wprinter.build_sim(')')
					]);
			} else {
				left = print_val(bin_op.left, refs, varPositions);
			}
			return wprinter.build_pretty_op_l([left, wprinter.build_sim('.'), print_val(bin_op.right, refs, varPositions)]);
		} else if (op === 'OV_AS') {
			return wprinter.build_pretty_a([
				wprinter.build_sim('ov.as'),
				wprinter.build_sim('('),
				print_val(bin_op.left, refs, varPositions),
				wprinter.build_sim(','),
				wprinter.get_sep(),
				wprinter.build_sim('\''),
				wprinter.build_sim(ov.as(bin_op.right.value, 'hash_key')),
				wprinter.build_sim('\''),
				wprinter.build_sim(')'),
			]);
		} else if (op === 'OV_IS') {
			try {
				return wprinter.build_pretty_a([
					wprinter.build_sim('ov.is'),
					wprinter.build_sim('('),
					print_val(bin_op.left, refs, varPositions),
					wprinter.build_sim(','),
					wprinter.get_sep(),
					wprinter.build_sim('\''),
					wprinter.build_sim(ov.as(bin_op.right.value, 'hash_key')),
					wprinter.build_sim('\''),
					wprinter.build_sim(')'),
				]);
			} catch (e) {
				console.log(e.message);
				console.log(e.stack);
			}
		} else if (op === '[]=') {
			return wprinter.build_pretty_a([
				print_val(bin_op.left, refs, varPositions),
				wprinter.build_sim('.push'),
				wprinter.build_sim(useDC ? '(DC(' : '('),
				print_val(bin_op.right, refs, varPositions),
				wprinter.build_sim(useDC ? '))' : ')'),
			]);
		} else {
			op = {
				'eq': '===',
				'ne': '!==',
				'.=': '+=',
				'.': '+',
			}[op] ?? op;

			const is_bad_ref = op == '=' && ov.is(bin_op.left.value, 'var') && refs[escape_special_keywords(ov.as(bin_op.left.value, 'var'))];

			return wprinter.build_pretty_op_l([
					wprinter.build_pretty_op_l([
						wprinter.build_sim(is_bad_ref ? `/* TODO REF*/ ObjectAssignInPlace(` : ''),
						print_val(bin_op.left, refs, varPositions),
						wprinter.get_sep(),
						wprinter.build_sim(is_bad_ref ? (useDC ? ', DC(' : ', ') : op),
					]),
					wprinter.get_sep(),
					print_val(bin_op.right, refs, varPositions),
					wprinter.build_sim(is_bad_ref ? (useDC ? '))' : ')') : ''),
				]);
		}
	} else if (ov.is(val.value, 'post_dec')) {
		const dec = ov.as(val.value, 'post_dec');
		return wprinter.build_pretty_op_l([print_val(dec, refs, varPositions), wprinter.build_sim('--')]);
	} else if (ov.is(val.value, 'post_inc')) {
		const inc = ov.as(val.value, 'post_inc');
		return wprinter.build_pretty_op_l([print_val(inc, refs, varPositions), wprinter.build_sim('++')]);
	} else if (ov.is(val.value, 'unary_op')) {
		const unary_op = ov.as(val.value, 'unary_op');
		return wprinter.build_pretty_bind(wprinter.build_sim(unary_op.op), print_val(unary_op.val, refs, varPositions));
	} else if (ov.is(val.value, 'fun_val')) {
		const fun_val = ov.as(val.value, 'fun_val');
		if (fun_val.module == 'ptd' && (fun_val.name == 'ensure' || fun_val.name == 'ensure_only_static_do_not_touch_without_permission')) {
			return wprinter.build_pretty_l([print_fun_arg(fun_val.args[1], true, refs, varPositions)]);
		}
		const isConstArgs = ['ptd', 'hash', 'ov', 'string', 'array'].includes(fun_val.module); 

		let fun_name = `${get_fun_label(fun_val.name, fun_val.module)}(`;
		if (fun_val.args.length == 1) {
			let arg = fun_val.args[0].val;
			if (ov.is(arg.value, 'hash_decl') || ov.is(arg.value, 'arr_decl')) {
				return get_compressed_fun_val(arg, fun_name, ')', refs, varPositions);
			}
		} else if (is_to_change_ov(val)) {
			return wprinter.build_pretty_op_l([
					print_val(fun_val.args[0].val, refs, varPositions),
					wprinter.get_sep(),
					wprinter.build_sim(fun_val.name),
					wprinter.get_sep(),
					wprinter.build_sim(`:${(ov.as(fun_val.args[1].val.value, 'string')).arr[0]}`),
				]);
		}
		let ret = [wprinter.build_sim(fun_name)];
		ret.push(...join_print_fun_arg(fun_val.args, isConstArgs, refs, varPositions));
		ret.push(wprinter.build_sim(')'));
		if (((count_structs(fun_val.args) == fun_val.args.length) && fun_val.args.length > 0) || 
			(fun_val.args.length == 1 && ov.is(fun_val.args[0].val.value, 'fun_val'))) {
			return wprinter.build_pretty_op_l(ret)
		}
		return wprinter.build_pretty_l(ret);
	} else if (ov.is(val.value, 'nop')) {
		return {len: 0, el: ov.mk('sim', '')};
	} else if (ov.is(val.value, 'arr_decl')) {
		const arr_decl = ov.as(val.value, 'arr_decl');
		return get_compressed_fun_val(val, '', '', refs, varPositions);
	} else if (ov.is(val.value, 'hash_decl')) {
		const hash_decl = ov.as(val.value, 'hash_decl');
		return wprinter.build_pretty_arr_decl(join_print_hash_elem(hash_decl, refs, varPositions), '{', '}');
	} else if (ov.is(val.value, 'fun_label')) {
		const fun_label = ov.as(val.value, 'fun_label');
		return wprinter.build_sim(get_fun_label(fun_label.name, fun_label.module));
	}
}

function escape_special_keywords(word) {
	return {
		'function': 'function_',
		'var': 'var_',
		'void': 'void_',
		'import': 'import_',
	}[word] ?? word;
}

function print_loop(state, header, cmd, arg_list, cond, ind, refs, varPositions) {
	let pprint = [wprinter.build_sim(header), wprinter.get_sep()];
	pprint.push(...join_print_var_decl(arg_list, refs, varPositions));
	if (arg_list.length > 0) pprint.push(wprinter.build_sim(' '));
	pprint.push(wprinter.build_sim('('));
	let cond_p = print_val(cond, refs, varPositions);
	if (ov.is(cond_p.el, 'arr')) {
		pprint.push(...(ov.as(cond_p.el, 'arr')).arr);
	} else {
		pprint.push(cond_p);
	}
	pprint.push(wprinter.build_sim(')'));
	wprinter.print_t(state, wprinter.build_pretty_l(pprint), ind);
	print_st(state, cmd, ind, refs, varPositions);
}

function print_loop_or_mod(state, short, header, cmd, arg_list, cond, ind, refs, varPositions) {
	if (short) {
		if (state.removeMod) {
			const block = { debug: cmd.debug, cmd: { block: { cmds: [cmd], ending_comment: [] } } };
			print_loop(state, header, block, arg_list, cond, ind, refs, varPositions);
		} else {
			// print_cond_mod(state, header, cmd, arg_list, cond, ind, refs, varPositions);
		}
	} else {
		print_loop(state, header, cmd, arg_list, cond, ind, refs, varPositions);
	}
}

function print_try_ensure(state, value, type, ind, refs, varPositions) {
	const print_if_err_cmd = (var_decl_name, value) => {
		const var_decl = create_var_decl(var_decl_name, value, { none: null }, true);
		const if_err = cmd_({ if: {
			cond: create_is_cond({ var: var_decl_name }, { hash_key: 'err' }),
			if: cmd_(type === 'ensure' ? ({ die: [] }) : ({ return: vt_({ var: var_decl_name })})),
			elsif: [],
			else: cmd_({ nop: null }),
		}})
		flush_sim_statement(state, print_var_decl(ov.as(var_decl.cmd, 'var_decl'), refs, varPositions), ind, refs, varPositions);
		state_print(state, '\n' + pind(ind));
		print_cmd(state, if_err, ind, refs, varPositions);
		state_print(state, '\n' + pind(ind));
	}

	if (ov.is(value, 'decl')) {
		const decl = ov.as(value, 'decl');
		const var_decl_name = `${type}_${decl.name}`;
		print_if_err_cmd(var_decl_name, decl.value);
		decl.value = create_ov_as(var_decl_name, 'ok');
		flush_sim_statement(state, print_var_decl(decl, refs, varPositions), ind, refs, varPositions);
		state_print(state, '\n' + pind(ind));
	} else if (ov.is(value, 'expr')) {
		const expr = ov.as(value, 'expr');
		print_if_err_cmd(get_var_name(expr, refs, varPositions, type), { value: expr });
	} else if (ov.is(value, 'lval')) {
		const bin_op = ov.as(value, 'lval');
		const var_decl_name = get_var_name(bin_op.left, refs, varPositions, type);
		print_if_err_cmd(var_decl_name, { value: bin_op.right });
		flush_sim_statement(state, wprinter.build_pretty_l([
			print_val(vt_({ var: var_decl_name }), refs, varPositions),
			wprinter.get_sep(),
			wprinter.build_sim(bin_op.op),
			wprinter.get_sep(),
			print_val(create_ov_as(var_decl_name, 'ok').value, refs, varPositions)
		]), ind, refs, varPositions);
	}
}

function print_return(as_return, refs, varPositions) {
	let pprint = [wprinter.build_sim('return')];
	if (!ov.is(as_return.value, 'nop')) {
		pprint.push(...[wprinter.get_sep(), print_val(as_return, refs, varPositions)]);
	}
	return wprinter.build_pretty_l(pprint);
}

function print_sim_value(value, refs, varPositions) {
	let val = print_val(value, refs, varPositions);
	if (ov.is(val.el, 'arr')) {
		val = wprinter.build_pretty_l((ov.as(val.el, 'arr')).arr);
	}
	return val;
}

function print_break() {
	return wprinter.build_sim('break');
}

function print_continue() {
	return wprinter.build_sim('continue');
}

function print_die(as_die, refs, varPositions) {
	let pprint = [wprinter.build_sim('throw new Error')];
	pprint.push(wprinter.build_sim('('));
	if (as_die.length > 0) pprint.push(...[
		wprinter.build_sim('{'),
		wprinter.build_pretty_l(join_print_val(as_die, refs, varPositions)),
		wprinter.build_sim('}'),
	]);
	pprint.push(wprinter.build_sim(')'));
	return wprinter.build_pretty_a(pprint);
}

// function print_simple_statement(cmd) {
// 	if (ov.is(cmd.cmd, 'value')) {
// 		return print_sim_value(ov.as(cmd.cmd, 'value'));
// 	} else if (ov.is(cmd.cmd, 'return')) {
// 		return print_return(ov.as(cmd.cmd, 'return'), refs, varPositions);
// 	} else if (ov.is(cmd.cmd, 'break')) {
// 		return print_break();
// 	} else if (ov.is(cmd.cmd, 'continue')) {
// 		return print_continue();
// 	} else if (ov.is(cmd.cmd, 'die')) {
// 		return print_die(ov.as(cmd.cmd, 'die'));
// 	} else if (ov.is(cmd.cmd, 'try')) {
// 		return print_try_ensure(ov.as(cmd.cmd, 'try'), 'try');
// 	} else if (ov.is(cmd.cmd, 'ensure')) {
// 		return print_try_ensure(ov.as(cmd.cmd, 'ensure'), 'ensure');
// 	} else {
// 		die(cmd);
// 	}
// }

function flush_sim_statement(state, st, ind) {
	wprinter.print_t(state, st, ind);
	state_print(state, ';');
}

function print_cmd(state, cmd, ind, refs, varPositions) {
	print_comment(state, cmd.debug.comment, ind, ind, refs, varPositions);
	if (ov.is(cmd.cmd, 'if')) {
		const as_if = ov.as(cmd.cmd, 'if');
		print_loop(state, 'if', as_if.if, [], as_if.cond, ind, refs, varPositions);
		for (const elseif of as_if.elsif) {
			state_print(state, ' ');
			print_loop(state, 'else if', elseif.cmd, [], elseif.cond, ind, refs, varPositions);
		}
		if (!ov.is(as_if.else.cmd, 'nop')) {
			state_print(state, ' else');
			print_st(state, as_if.else, ind, refs, varPositions);
		}
	} else if (ov.is(cmd.cmd, 'while')) {
		const as_while = ov.as(cmd.cmd, 'while');
		print_loop_or_mod(state, as_while.short, 'while', as_while.cmd, [], as_while.cond, ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'for')) {
		const as_for = ov.as(cmd.cmd, 'for');
		let start;
		if (ov.is(as_for.start, 'value')) {
			const value = ov.as(as_for.start, 'value');
			start = print_val(value, refs, varPositions);
		} else if (ov.is(as_for.start, 'var_decl')) {
			const var_decl = ov.as(as_for.start, 'var_decl');
			start = print_var_decl(var_decl, refs, varPositions);
		}
		wprinter.print_t(state, wprinter.build_pretty_a([
				wprinter.build_sim('for('),
				start,
				wprinter.build_sim(';'),
				wprinter.get_sep(),
				print_val(as_for.cond, refs, varPositions),
				wprinter.build_sim(';'),
				wprinter.get_sep(),
				print_val(as_for.iter, refs, varPositions),
				wprinter.build_sim(') ')
			]), ind);
		print_cmd(state, as_for.cmd, ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'block')) {
		const block = ov.as(cmd.cmd, 'block');
		state_print(state, '{');
		for (const c of block.cmds) {
			state_print(state, `\n${pind(ind + 1)}`);
			print_cmd(state, c, ind + 1, refs, varPositions);
		}
		state_print(state, `\n${pind(ind)}`);
		if (block.ending_comment.length > 0) {
			state_print(state, pind(1));
			print_comment(state, block.ending_comment, ind + 1, ind, refs, varPositions);
		}
		state_print(state, '}');
	} else if (ov.is(cmd.cmd, 'nop')) {
		state_print(state, ';');
	} else if (ov.is(cmd.cmd, 'match')) {
		const as_match = ov.as(cmd.cmd, 'match');
		const { var_decl, new_if } = convert_match_to_if(as_match, refs, varPositions);
		// print_cmd(state, var_decl, ind, refs, varPositions);
		flush_sim_statement(state, print_var_decl(ov.as(var_decl.cmd, 'var_decl'), refs, varPositions), ind);
		state_print(state, '\n' + pind(ind));
		print_cmd(state, new_if, ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'fora')) {
		const as_fora = ov.as(cmd.cmd, 'fora');
		// print_loop_or_mod(state, as_fora.short, 'fora', as_fora.cmd, [as_fora.iter], as_fora.array, ind, refs, varPositions);
		const arr = print_val_no_context(as_fora.array, refs, varPositions);
		state_print(state, `for (const ${as_fora.iter.name} of ${arr})`);
		print_st(state, as_fora.cmd, ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'forh')) {
		const as_forh = ov.as(cmd.cmd, 'forh');
		// print_loop_or_mod(state, as_forh.short, 'forh', as_forh.cmd, [as_forh.key, as_forh.val], as_forh.hash, ind, refs, varPositions);
		const hash = print_val_no_context(as_forh.hash, refs, varPositions);
		state_print(state, `for (const [${as_forh.key.name}, ${as_forh.val.name}] of Object.entries(${hash}))`);
		print_st(state, as_forh.cmd, ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'rep')) {
		const as_rep = ov.as(cmd.cmd, 'rep');
		// print_loop_or_mod(state, as_rep.short, 'rep', as_rep.cmd, [as_rep.iter], as_rep.count, ind, refs, varPositions);
		const i = as_rep.iter.name;
		const length = print_val_no_context(as_rep.count, refs, varPositions);
		state_print(state, `for (let ${i} = 0; ${i} < ${length}; ${i}++)`);
		print_st(state, as_rep.cmd, ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'loop')) {
		const as_loop = ov.as(cmd.cmd, 'loop');
		state_print(state, 'while (true)');
		print_st(state, as_loop, ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'if_mod')) {
		const if_mod = ov.as(cmd.cmd, 'if_mod');
		if (state.removeMod) {
			const block = { debug: cmd.debug, cmd: { block: { cmds: [if_mod.cmd], ending_comment: [] } } };
			print_loop(state, 'if', block, [], if_mod.cond, ind, refs, varPositions);
		} else {
			// print_cond_mod(state, 'if', if_mod.cmd, [], if_mod.cond, ind, refs, varPositions);
		}
	} else if (ov.is(cmd.cmd, 'unless_mod')) {
		const unless_mod = ov.as(cmd.cmd, 'unless_mod');
		if (state.removeMod) {
			const parenthesis = { debug: unless_mod.cond.debug, type: { tct_im: null }, value: { parenthesis: unless_mod.cond } };
			let final_cond = { debug: unless_mod.cond.debug, type: { tct_im: null }, value: { unary_op: { op: '!', val: parenthesis } } };
			if (ov.is(unless_mod.cond.value, 'bin_op')) {
				const op = ov.as(unless_mod.cond.value, 'bin_op').op;
				const opposites = {
					'==': '!=',
					'>=': '<',
					'<=': '>',
					'eq': 'ne',
				};
				if (Object.keys(opposites).includes(op)) {
					unless_mod.cond.value.bin_op.op = opposites[op];
					final_cond = unless_mod.cond;
				} else if (Object.values(opposites).includes(op)) {
					unless_mod.cond.value.bin_op.op = Object.entries(opposites).find(([_, val]) => val == op)[0];
					final_cond = unless_mod.cond;
				}
			}
			const block = { debug: cmd.debug, cmd: { block: { cmds: [unless_mod.cmd], ending_comment: [] } } };
			print_loop(state, 'if', block, [], final_cond, ind, refs, varPositions);
		} else {
			// print_cond_mod(state, 'unless', unless_mod.cmd, [], unless_mod.cond, ind, refs, varPositions);
		}
	} else if (ov.is(cmd.cmd, 'value')) {
		const value = ov.as(cmd.cmd, 'value');
		flush_sim_statement(state, print_sim_value(value, refs, varPositions), ind);
	} else if (ov.is(cmd.cmd, 'try')) {
		print_try_ensure(state, ov.as(cmd.cmd, 'try'), 'try', ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'ensure')) {
		print_try_ensure(state, ov.as(cmd.cmd, 'ensure'), 'ensure', ind, refs, varPositions);
	} else if (ov.is(cmd.cmd, 'return')) {
		const as_return = ov.as(cmd.cmd, 'return');
		flush_sim_statement(state, print_return(as_return, refs, varPositions), ind);
	} else if (ov.is(cmd.cmd, 'break')) {
		flush_sim_statement(state, print_break(), ind);
	} else if (ov.is(cmd.cmd, 'continue')) {
		flush_sim_statement(state, print_continue(), ind);
	} else if (ov.is(cmd.cmd, 'die')) {
		const as_die = ov.as(cmd.cmd, 'die');
		flush_sim_statement(state, print_die(as_die, refs, varPositions), ind);
	} else if (ov.is(cmd.cmd, 'var_decl')) {
		const var_decl = ov.as(cmd.cmd, 'var_decl');
		flush_sim_statement(state, print_var_decl(var_decl, refs, varPositions), ind);
	}
}

function print_val_no_context(val, refs, varPositions) {
	const state = { out: '' };
	wprinter.print_t(state, wprinter.build_pretty_l([print_val(val, refs, varPositions)]), 0);
	return state.out;
}

function value_only_to_string(val, refs, varPositions) {
	return print_val_no_context(val, refs, varPositions)
		.replace(/\(|\[|\{|\)|\]|\}|\.|::| |,|'|-|\*|\//g, '_')
		.replace(/__+/g, '_')
		.replace(/_DC_/g, '_')
		.replace(/_ref_/g, '_')
		.replace(/_ref_/g, '_')
		.replace(/_$/g, '');
}

function create_var_decl(name, value, type, isConst = false, disableDC = false) {
	return cmd_({ var_decl: {
		name: name,
		type: type,
		tct_type: ov.mk('tct_im'),
		value: value,
		place: { line: 16, position: 7 },
		mod: { none: null },
		isConst,
		disableDC,
	}});
}

const cmd_ = (cmd) => ({ debug: emptyDebug, cmd });
// const v_ = (cmd) => ({ debug: emptyDebug, cmd });
const vt_ = (value) => ({ debug: emptyDebug, value, type: { tct_im: null } });

function create_ov_as(left_var, right_as) {
	return { value: vt_({ bin_op: { left: vt_({ var: left_var }), op: "OV_AS", right: vt_({ hash_key: right_as }) }})};
}

function get_var_from_case(variant_decl, match_var) {
	return create_var_decl(
		variant_decl.value.value.declaration.name,
		create_ov_as(match_var, variant_decl.name),
		{ none: null },
		true,
		true
	);
}

const emptyDebug = { begin: { line: 0, position: 0 }, end: { line: 0, position: 0 }, comment: [] }

function create_is_cond(left_val, right_val) {
	return vt_({ bin_op: { left: vt_(left_val), op: 'OV_IS', right: vt_(right_val), }});
}

const used_match_names = {};

function get_var_name(val, refs, varPositions, prefix = 'match') {
	let value = value_only_to_string(val, refs, varPositions);
	if (value in used_match_names) {
		value = `${value}_${used_match_names[value]++}`;
	} else used_match_names[value] = 0;
	return `${prefix}_${value}`;
}

function convert_match_to_if(match, refs, varPositions) {
	const var_decl = create_var_decl(get_var_name(match.val, refs, varPositions), { value: match.val }, match.val.type, true);
	const ret = cmd_({ if: {
		cond: create_is_cond({ var: var_decl.cmd.var_decl.name }, { hash_key: match.branch_list[0].variant.name }),
		if: match.branch_list[0].cmd,
		elsif: match.branch_list.filter((_, i) => i > 0).map(v => {
			if (ov.is(v.variant.value, 'value') && v.cmd.cmd.block.cmds.length > 0) {
				v.cmd.cmd.block.cmds.unshift(get_var_from_case(v.variant, var_decl.cmd.var_decl.name));
			}
			return {
				cond: create_is_cond({ var: var_decl.cmd.var_decl.name }, { hash_key: v.variant.name }),
				cmd: v.cmd,
				debug: emptyDebug,
			};
		}),
		else: cmd_({ nop: null }),
	}});

	if (ov.is(match.branch_list[0].variant.value, 'value') && ret.cmd.if.if.cmd.block.cmds.length > 0) {
		ret.cmd.if.if.cmd.block.cmds.unshift(get_var_from_case(match.branch_list[0].variant, var_decl.cmd.var_decl.name));
	}

	return { var_decl, new_if: ret };
}

function print_comment(state, comments, ind_comment, ind_after) {
	if (comments.length > 0) {
		for (let i = 0; i < comments.length; i++) {
			state_print(state, `// ${comments[i].slice(2)}`);
			state_print(state, '\n');
			if (i + 1 < comments.length) {
				state_print(state, pind(ind_comment));
			}
		}
		state_print(state, pind(ind_after));
	}
}

const is_letter = (char) => /^[a-zA-Z]$/.test(char);
const is_digit = (char) => /^[0-9]$/.test(char);

function is_proper_hash_key(string) {
	if (string.length == 0) return false;
	if (!(is_letter(string[0]))) return false;
	for (const char of string.split("")) {
		if (!(is_letter(char) || is_digit(char) || char === '_')) return false;
	}
	return true;
}


module.exports = {
	print_module_to_str,
} 