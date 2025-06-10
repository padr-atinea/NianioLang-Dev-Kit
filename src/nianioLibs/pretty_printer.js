const ov = require('./ov');
const wprinter = require('./wprinter');

function state_print(state, str) {
	state.out += str;
}

// function print_module_to_struct(mod) {
// 	var struct = {imports: [], function_s: []};
// 	for (const imp of mod.import) {
// 		struct.imports.push('use ' + imp.name + ';' + '\n');
// 	}
// 	for (const function_ of mod.fun_def) {
// 		var state = {out: ''};
// 		state_print(state, '\n');
// 		print_fun_def_head(state, function_, mod.name);
// 		var head = state.out;
// 		state.out = '';
// 		for (const c of ov.as(function_.cmd.cmd, 'block').cmds) {
// 			state_print(state, '\n' + pind(1));
// 			print_cmd(state, c, 1);
// 		}
// 		struct.function_s.push({
// 				name: (ov.is(function_.access, 'priv') ? '::' : '') + function_.name,
// 				head: head,
// 				body: state.out
// 			});
// 	}
// 	return struct;
// }

function print_stamp(state, stamp) {
	if (stamp !== '') {
		state_print(state, `${stamp}\n\n\n`);
	} else if (state.printNewStamp) {
		state_print(state, `###\n# (c) Atinea Sp. z o.o.\n###\n\n\n`);
	}
}

function print_imports(state, imports) {
	var imps = [];
	for (const imp of imports) {
		imps.push(`use ${imp.name};`);
	}
	state_print(state, imps.join('\n'));
	state_print(state, `\n\n`);
}

function print_module_to_str(mod, removeMod = false, printNewStamp = false) {
	var state = { out: '', removeMod, printNewStamp };
	print_stamp(state, mod.stamp);
	print_imports(state, mod.import);
	for (const function_ of mod.fun_def) {
		print_fun_def(state, function_, mod.name);
		state_print(state, `\n\n`);
	}
	print_comment(state, mod.ending_comment, 0, 0);
	return state.out;
}

function print_fun_def(state, function_, module) {
	print_comment(state, function_.comment, 0, 0);
	print_fun_def_head(state, function_, module);
	print_st(state, function_.cmd, 0);
}

function print_fun_def_head(state, function_, module) {
	var name = '';
	if (ov.is(function_.access, 'pub')) {
		name += `${module}::`;
	} else if (ov.is(function_.access, 'priv')) {
	}
	name += function_.name;
	var ret = [
			wprinter.build_sim('def'),
			wprinter.get_sep(),
			wprinter.build_sim(name),
			wprinter.build_sim('(')
		];
	for (let i = 0; i < function_.args.length; i++) {
		var el = function_.args[i];
		if (ov.is(el.mod, 'ref')) {
			ret.push(...[wprinter.build_sim('ref'), wprinter.get_sep()]);
		} else if (ov.is(el.mod, 'none')) {
		}
		ret.push(wprinter.build_sim(el.name));
		if (ov.is(el.type, 'type')) {
			const type = ov.as(el.type, 'type');
			ret.push(...[wprinter.get_sep(), wprinter.build_sim(':'), wprinter.get_sep(), print_val(type)]);
		} else if (ov.is(el.type, 'none')) {
		}
		if (i != function_.args.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	ret.push(wprinter.build_sim(')'));
	if (ov.is(function_.ret_type.type, 'type')) {
		const type = ov.as(function_.ret_type.type, 'type');
		ret.push(...[
				wprinter.get_sep(),
				wprinter.build_sim(':'),
				wprinter.get_sep(),
				print_sim_value(type)
			]);
	} else if (ov.is(function_.ret_type.type, 'none')) {
	}
	wprinter.print_t(state, wprinter.build_pretty_l(ret), 0);
}

function join_print_var_decl(aval) {
	var ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_var_decl(aval[i]));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function print_var_decl(var_decl) {
	var list = [wprinter.build_sim('var'), wprinter.get_sep()];
	if (ov.is(var_decl.type, 'type')) {
		const type = ov.as(var_decl.type, 'type');
		list.push(...[
				wprinter.build_sim(var_decl.name),
				wprinter.get_sep(),
				wprinter.build_sim(':'),
				wprinter.get_sep(),
				print_val(type)
			]);
	} else if (ov.is(var_decl.type, 'none')) {
		list.push(wprinter.build_sim(var_decl.name));
	}
	if (ov.is(var_decl.value, 'value')) {
		const value = ov.as(var_decl.value, 'value');
		list.push(...[wprinter.get_sep(), wprinter.build_sim('='), wprinter.get_sep(), print_val(value)]);
	} else if (ov.is(var_decl.type, 'none')) {
	}
	return wprinter.build_pretty_l(list);
}

function pind(ind) {
	var r = '';
	for (let i = 0; i < ind; i++) r += '\t';
	return r;
}

function join_print_hash_elem(aval) {
	var ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_hash_elem(aval[i]));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function print_hash_elem(elem) {
	if (ov.is(elem.val.value, 'hash_decl') || ov.is(elem.val.value, 'arr_decl')) {
		var key = ov.as(elem.key.value, 'hash_key');
		if (!(is_proper_hash_key(key))) key = `\'${key}\'`;
		return get_compressed_fun_val(elem.val, `${key}: `, '');
	}
	return wprinter.build_pretty_l([
			print_val(elem.key),
			wprinter.get_sep(),
			wprinter.build_sim('=>'),
			wprinter.get_sep(),
			print_val(elem.val)
		]);
}

function print_variant(variant) {
	if (variant.name === 'TRUE' && ov.is(variant.var.value, 'nop')) {
		return wprinter.build_sim('true');
	} else if (variant.name === 'FALSE' && ov.is(variant.var.value, 'nop')) {
		return wprinter.build_sim('false');
	}
	if (ov.is(variant.var.value, 'arr_decl') || ov.is(variant.var.value, 'hash_decl')) {
		return get_compressed_fun_val(variant.var, `:${variant.name}(`, ')');
	}
	var ret = [];
	ret.push(wprinter.build_sim(`:${variant.name}`));
	if (!ov.is(variant.var.value, 'nop')) ret.push(...[wprinter.build_sim('('), print_val(variant.var), wprinter.build_sim(')')]);
	return wprinter.build_pretty_op_l(ret);
}

function print_variant_case_decl(variant) {
	var ret = [wprinter.build_sim(`:${variant.name}`)];
	if (ov.is(variant.value, 'value')) {
		const value = ov.as(variant.value, 'value');
		ret.push(...[wprinter.build_sim('('), print_var_decl(value.declaration), wprinter.build_sim(')')]);
	} else if (ov.is(variant.value, 'none')) {
	}
	return wprinter.build_pretty_op_l(ret);
}

function join_print_fun_arg(aval) {
	var ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_fun_arg(aval[i]));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function print_fun_arg(arg) {
	var ret = [];
	if (ov.is(arg.mod, 'ref')) {
		ret.push(...[wprinter.build_sim('ref'), wprinter.get_sep()]);
	} else if (ov.is(arg.mod, 'none')) {
	}
	ret.push(print_val(arg.val));
	return wprinter.build_pretty_op_l(ret);
}

function count_structs(struct) {
	var ret = 0;
	for (const el of struct) {
		if (ov.is(el.val.value, 'arr_decl') || ov.is(el.val.value, 'hash_decl')) ++ret;
	}
	return ret;
}

function get_compressed_fun_val(arg, open, close) {
	var pprint = [];
	var begin = open;
	var end = close;
	while (true) {
		if (ov.is(arg.value, 'arr_decl')) {
			var a_arg = ov.as(arg.value, 'arr_decl');
			begin += '[';
			end = `]${end}`;
			if (a_arg.length != 1) {
				pprint = join_print_val(a_arg);
				break;
			}
			arg = a_arg[0];
		} else if (ov.is(arg.value, 'hash_decl')) {
			var h_arg = ov.as(arg.value, 'hash_decl');
			begin += '{';
			end = `}${end}`;
			pprint = join_print_hash_elem(h_arg);
			break;
		} else {
			pprint = [print_val(arg)];
			break;
		}
	}
	return wprinter.build_pretty_arr_decl(pprint, begin, end);
}

function print_st(state, cmd, ind) {
	state_print(state, ' ');
	print_cmd(state, cmd, ind);
}

function get_fun_label(fun_name, fun_module) {
	return fun_module === '' ? fun_name : (`${fun_module}::${fun_name}`);
}

function string_to_nl(str) {
	return str.replace('\'', '\'\'');
}

function join_print_val(aval) {
	var ret = [];
	for (let i = 0; i < aval.length; i++) {
		ret.push(print_val(aval[i]));
		if (i != aval.length - 1) ret.push(...[wprinter.build_sim(','), wprinter.get_sep()]);
	}
	return ret;
}

function is_to_change_ov(val) {
	if (!(ov.is(val.value, 'fun_val'))) return false;
	var fun_val = ov.as(val.value, 'fun_val');
	if (fun_val.args.length == 2 && (fun_val.module === 'ov' || fun_val.module === 'c_ov')) {
		if ((fun_val.name === 'as' || fun_val.name === 'is') && ov.is(fun_val.args[1].val.value, 'string')) {
			var ov_case = ov.as(fun_val.args[1].val.value, 'string');
			if (ov_case.arr.length == 1 && ov_case.arr[0].indexOf(' ') < 0) {
				return true;
			}
		}
	}
	return false;
}

function print_val(val) {
	if (ov.is(val.value, 'const')) {
		const const_ = ov.as(val.value, 'const');
		return wprinter.build_sim(parseInt(const_));
	} else if (ov.is(val.value, 'string')) {
		const str_arr = ov.as(val.value, 'string');
		var arr  = [];
		for (const el of str_arr.arr) {
			arr.push(`\'${string_to_nl(el)}`);
		}
		if (ov.is(str_arr.last, 'new_line')) {
		} else if (ov.is(str_arr.last, 'end')) {
			arr[arr.length - 1] = `${arr[arr.length - 1]}\'`;
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
		return print_variant(variant);
	} else if (ov.is(val.value, 'var')) {
		const variable = ov.as(val.value, 'var');
		return wprinter.build_sim(variable);
	} else if (ov.is(val.value, 'parenthesis')) {
		const parenthesis = ov.as(val.value, 'parenthesis');
		return wprinter.build_pretty_a([wprinter.build_sim('('), print_val(parenthesis), wprinter.build_sim(')')]);
	} else if (ov.is(val.value, 'ternary_op')) {
		const ternary_op = ov.as(val.value, 'ternary_op');
		return wprinter.build_pretty_a([
				print_val(ternary_op.fst),
				wprinter.get_sep(),
				wprinter.build_pretty_op_l([wprinter.build_sim('? '), print_val(ternary_op.snd)]),
				wprinter.get_sep(),
				wprinter.build_pretty_op_l([wprinter.build_sim(': '), print_val(ternary_op.thrd)])
			]);
	} else if (ov.is(val.value, 'bin_op')) {
		const bin_op = ov.as(val.value, 'bin_op');
		var op = bin_op.op;
		if (op === 'ARRAY_INDEX') {
			return wprinter.build_pretty_a([
					wprinter.build_pretty_l([print_val(bin_op.left), wprinter.build_sim('[')]),
					print_val(bin_op.right),
					wprinter.build_sim(']')
				]);
		} else if (op === 'HASH_INDEX') {
			return wprinter.build_pretty_a([
					wprinter.build_pretty_l([print_val(bin_op.left), wprinter.build_sim('{')]),
					print_val(bin_op.right),
					wprinter.build_sim('}')
				]);
		} else if (op === '->') {
			var left;
			if (is_to_change_ov(bin_op.left)) {
				left = wprinter.build_pretty_a([
						wprinter.build_sim('('),
						print_val(bin_op.left),
						wprinter.build_sim(')')
					]);
			} else {
				left = print_val(bin_op.left);
			}
			return wprinter.build_pretty_op_l([left, wprinter.build_sim(op), print_val(bin_op.right)]);
		} else if (op === 'OV_AS') {
			return wprinter.build_pretty_op_l([
					print_val(bin_op.left),
					wprinter.get_sep(),
					wprinter.build_sim('as'),
					wprinter.get_sep(),
					wprinter.build_sim(':'),
					wprinter.build_sim(ov.as(bin_op.right.value, 'hash_key'))
				]);
		} else if (op === 'OV_IS') {
			return wprinter.build_pretty_op_l([
					print_val(bin_op.left),
					wprinter.get_sep(),
					wprinter.build_sim('is'),
					wprinter.get_sep(),
					wprinter.build_sim(':'),
					wprinter.build_sim(ov.as(bin_op.right.value, 'hash_key'))
				]);
		} else {
			return wprinter.build_pretty_op_l([
					wprinter.build_pretty_op_l([print_val(bin_op.left), wprinter.get_sep(), wprinter.build_sim(op)]),
					wprinter.get_sep(),
					print_val(bin_op.right)
				]);
		}
	} else if (ov.is(val.value, 'post_dec')) {
		const dec = ov.as(val.value, 'post_dec');
		return wprinter.build_pretty_op_l([print_val(dec), wprinter.build_sim('--')]);
	} else if (ov.is(val.value, 'post_inc')) {
		const inc = ov.as(val.value, 'post_inc');
		return wprinter.build_pretty_op_l([print_val(inc), wprinter.build_sim('++')]);
	} else if (ov.is(val.value, 'unary_op')) {
		const unary_op = ov.as(val.value, 'unary_op');
		return wprinter.build_pretty_bind(wprinter.build_sim(unary_op.op), print_val(unary_op.val));
	} else if (ov.is(val.value, 'fun_val')) {
		const fun_val = ov.as(val.value, 'fun_val');
		var fun_name = `${get_fun_label(fun_val.name, fun_val.module)}(`;
		if (fun_val.args.length == 1) {
			var arg = fun_val.args[0].val;
			if (ov.is(arg.value, 'hash_decl') || ov.is(arg.value, 'arr_decl')) {
				return get_compressed_fun_val(arg, fun_name, ')');
			}
		} else if (is_to_change_ov(val)) {
			return wprinter.build_pretty_op_l([
					print_val(fun_val.args[0].val),
					wprinter.get_sep(),
					wprinter.build_sim(fun_val.name),
					wprinter.get_sep(),
					wprinter.build_sim(`:${(ov.as(fun_val.args[1].val.value, 'string')).arr[0]}`),
				]);
		}
		var ret = [wprinter.build_sim(fun_name)];
		ret.push(...join_print_fun_arg(fun_val.args));
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
		return get_compressed_fun_val(val, '', '');
	} else if (ov.is(val.value, 'hash_decl')) {
		const hash_decl = ov.as(val.value, 'hash_decl');
		return wprinter.build_pretty_arr_decl(join_print_hash_elem(hash_decl), '{', '}');
	} else if (ov.is(val.value, 'fun_label')) {
		const fun_label = ov.as(val.value, 'fun_label');
		return wprinter.build_sim(get_fun_label(fun_label.name, fun_label.module));
	}
}

function print_cond_mod(state, header, cmd, arg_list, cond, ind) {
	var ret = [
			wprinter.build_sim(header),
			wprinter.get_sep(),
			wprinter.build_pretty_l(join_print_var_decl(arg_list))
		];
	if (arg_list.length > 0) ret.push(wprinter.build_sim(' '));
	if (arg_list.length > 0) ret.push(wprinter.build_sim('('));
	ret.push(print_val(cond));
	if (arg_list.length > 0) ret.push(wprinter.build_sim(')'));
	wprinter.print_t(state, wprinter.build_pretty_a([
			print_simple_statement(cmd),
			wprinter.get_sep(),
			wprinter.build_pretty_op_l(ret)
		]), ind);
	state_print(state, ';');
}

function print_loop(state, header, cmd, arg_list, cond, ind) {
	var pprint = [wprinter.build_sim(header), wprinter.get_sep()];
	pprint.push(...join_print_var_decl(arg_list));
	if (arg_list.length > 0) pprint.push(wprinter.build_sim(' '));
	pprint.push(wprinter.build_sim('('));
	var cond_p = print_val(cond);
	if (ov.is(cond_p.el, 'arr')) {
		pprint.push(...(ov.as(cond_p.el, 'arr')).arr);
	} else {
		pprint.push(cond_p);
	}
	pprint.push(wprinter.build_sim(')'));
	wprinter.print_t(state, wprinter.build_pretty_l(pprint), ind);
	print_st(state, cmd, ind);
}

function print_loop_or_mod(state, short, header, cmd, arg_list, cond, ind) {
	if (short) {
		if (state.removeMod) {
			const block = { debug: cmd.debug, cmd: { block: { cmds: [cmd], ending_comment: [] } } };
			print_loop(state, header, block, arg_list, cond, ind);
		} else {
			print_cond_mod(state, header, cmd, arg_list, cond, ind);
		}
	} else {
		print_loop(state, header, cmd, arg_list, cond, ind);
	}
}

function print_try_ensure(value, typ) {
	var pprint = [wprinter.build_sim(typ)];
	if (ov.is(value, 'decl')) {
		const decl = ov.as(value, 'decl');
		pprint.push(...[wprinter.get_sep(), print_var_decl(decl)]);
	} else if (ov.is(value, 'expr')) {
		const expr = ov.as(value, 'expr');
		pprint.push(...[wprinter.get_sep(), print_val(expr)]);
	} else if (ov.is(value, 'lval')) {
		const bin_op = ov.as(value, 'lval');
		pprint.push(...[
				wprinter.get_sep(),
				print_val(bin_op.left),
				wprinter.get_sep(),
				wprinter.build_sim(bin_op.op),
				wprinter.get_sep(),
				print_val(bin_op.right)
			]);
	}
	return wprinter.build_pretty_l(pprint);
}

function print_return(as_return) {
	var pprint = [wprinter.build_sim('return')];
	if (!ov.is(as_return.value, 'nop')) {
		pprint.push(...[wprinter.get_sep(), print_val(as_return)]);
	}
	return wprinter.build_pretty_l(pprint);
}

function print_sim_value(value) {
	var val = print_val(value);
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

function print_die(as_die) {
	var pprint = [wprinter.build_sim('die')];
	if (as_die.length > 0) pprint.push(...[
		wprinter.build_sim('('),
		wprinter.build_pretty_l(join_print_val(as_die)),
		wprinter.build_sim(')')
	]);
	return wprinter.build_pretty_a(pprint);
}

function print_simple_statement(cmd) {
	if (ov.is(cmd.cmd, 'value')) {
		return print_sim_value(ov.as(cmd.cmd, 'value'));
	} else if (ov.is(cmd.cmd, 'return')) {
		return print_return(ov.as(cmd.cmd, 'return'));
	} else if (ov.is(cmd.cmd, 'break')) {
		return print_break();
	} else if (ov.is(cmd.cmd, 'continue')) {
		return print_continue();
	} else if (ov.is(cmd.cmd, 'die')) {
		return print_die(ov.as(cmd.cmd, 'die'));
	} else if (ov.is(cmd.cmd, 'try')) {
		return print_try_ensure(ov.as(cmd.cmd, 'try'), 'try');
	} else if (ov.is(cmd.cmd, 'ensure')) {
		return print_try_ensure(ov.as(cmd.cmd, 'ensure'), 'ensure');
	} else {
		die(cmd);
	}
}

function flush_sim_statement(state, st, ind) {
	wprinter.print_t(state, st, ind);
	state_print(state, ';');
}

function print_cmd(state, cmd, ind) {
	print_comment(state, cmd.debug.comment, ind, ind);
	if (ov.is(cmd.cmd, 'if')) {
		const as_if = ov.as(cmd.cmd, 'if');
		print_loop(state, 'if', as_if.if, [], as_if.cond, ind);
		for (const elseif of as_if.elsif) {
			state_print(state, ' ');
			print_loop(state, 'elsif', elseif.cmd, [], elseif.cond, ind);
		}
		if (!ov.is(as_if.else.cmd, 'nop')) {
			state_print(state, ' else');
			print_st(state, as_if.else, ind);
		}
	} else if (ov.is(cmd.cmd, 'while')) {
		const as_while = ov.as(cmd.cmd, 'while');
		print_loop_or_mod(state, as_while.short, 'while', as_while.cmd, [], as_while.cond, ind);
	} else if (ov.is(cmd.cmd, 'for')) {
		const as_for = ov.as(cmd.cmd, 'for');
		var start;
		if (ov.is(as_for.start, 'value')) {
			const value = ov.as(as_for.start, 'value');
			start = print_val(value);
		} else if (ov.is(as_for.start, 'var_decl')) {
			const var_decl = ov.as(as_for.start, 'var_decl');
			start = print_var_decl(var_decl);
		}
		wprinter.print_t(state, wprinter.build_pretty_a([
				wprinter.build_sim('for('),
				start,
				wprinter.build_sim(';'),
				wprinter.get_sep(),
				print_val(as_for.cond),
				wprinter.build_sim(';'),
				wprinter.get_sep(),
				print_val(as_for.iter),
				wprinter.build_sim(') ')
			]), ind);
		print_cmd(state, as_for.cmd, ind);
	} else if (ov.is(cmd.cmd, 'block')) {
		const block = ov.as(cmd.cmd, 'block');
		state_print(state, '{');
		for (const c of block.cmds) {
			state_print(state, `\n${pind(ind + 1)}`);
			print_cmd(state, c, ind + 1);
		}
		state_print(state, `\n${pind(ind)}`);
		if (block.ending_comment.length > 0) {
			state_print(state, pind(1));
			print_comment(state, block.ending_comment, ind + 1, ind);
		}
		state_print(state, '}');
	} else if (ov.is(cmd.cmd, 'nop')) {
		state_print(state, ';');
	} else if (ov.is(cmd.cmd, 'match')) {
		const as_match = ov.as(cmd.cmd, 'match');
		wprinter.print_t(state, wprinter.build_pretty_a([
				wprinter.build_sim('match ('),
				print_val(as_match.val),
				wprinter.build_sim(')')
			]), ind);
		for (const case_el of as_match.branch_list) {
			state_print(state, ' case ');
			wprinter.print_t(state, print_variant_case_decl(case_el.variant), ind + 1);
			print_st(state, case_el.cmd, ind);
		}
	} else if (ov.is(cmd.cmd, 'fora')) {
		const as_fora = ov.as(cmd.cmd, 'fora');
		print_loop_or_mod(state, as_fora.short, 'fora', as_fora.cmd, [as_fora.iter], as_fora.array, ind);
	} else if (ov.is(cmd.cmd, 'forh')) {
		const as_forh = ov.as(cmd.cmd, 'forh');
		print_loop_or_mod(state, as_forh.short, 'forh', as_forh.cmd, [as_forh.key, as_forh.val], as_forh.hash, 
			ind);
	} else if (ov.is(cmd.cmd, 'rep')) {
		const as_rep = ov.as(cmd.cmd, 'rep');
		print_loop_or_mod(state, as_rep.short, 'rep', as_rep.cmd, [as_rep.iter], as_rep.count, ind);
	} else if (ov.is(cmd.cmd, 'loop')) {
		const as_loop = ov.as(cmd.cmd, 'loop');
		state_print(state, 'loop');
		print_st(state, as_loop, ind);
	} else if (ov.is(cmd.cmd, 'if_mod')) {
		const if_mod = ov.as(cmd.cmd, 'if_mod');
		if (state.removeMod) {
			const block = { debug: cmd.debug, cmd: { block: { cmds: [if_mod.cmd], ending_comment: [] } } };
			print_loop(state, 'if', block, [], if_mod.cond, ind);
		} else {
			print_cond_mod(state, 'if', if_mod.cmd, [], if_mod.cond, ind);
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
			print_loop(state, 'if', block, [], final_cond, ind);
		} else {
			print_cond_mod(state, 'unless', unless_mod.cmd, [], unless_mod.cond, ind);
		}
	} else if (ov.is(cmd.cmd, 'value')) {
		const value = ov.as(cmd.cmd, 'value');
		flush_sim_statement(state, print_sim_value(value), ind);
	} else if (ov.is(cmd.cmd, 'try')) {
		const astry = ov.as(cmd.cmd, 'try');
		flush_sim_statement(state, print_try_ensure(astry, 'try'), ind);
	} else if (ov.is(cmd.cmd, 'ensure')) {
		const asensure = ov.as(cmd.cmd, 'ensure');
		flush_sim_statement(state, print_try_ensure(asensure, 'ensure'), ind);
	} else if (ov.is(cmd.cmd, 'return')) {
		const as_return = ov.as(cmd.cmd, 'return');
		flush_sim_statement(state, print_return(as_return), ind);
	} else if (ov.is(cmd.cmd, 'break')) {
		flush_sim_statement(state, print_break(), ind);
	} else if (ov.is(cmd.cmd, 'continue')) {
		flush_sim_statement(state, print_continue(), ind);
	} else if (ov.is(cmd.cmd, 'die')) {
		const as_die = ov.as(cmd.cmd, 'die');
		flush_sim_statement(state, print_die(as_die), ind);
	} else if (ov.is(cmd.cmd, 'var_decl')) {
		const var_decl = ov.as(cmd.cmd, 'var_decl');
		flush_sim_statement(state, print_var_decl(var_decl), ind);
	}
}

function print_comment(state, comments ,
		ind_comment, ind_after) {
	if (comments.length > 0) {
		for (let i = 0; i < comments.length; i++) {
			state_print(state, comments[i]);
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

function print_function(fun_def, moduleName, removeMod = false) {
	const state = { out: '', removeMod };
	print_fun_def(state, fun_def, moduleName);
	return state.out;
}

module.exports = {
	// print_module_to_struct,
	print_function,
	print_module_to_str,
} 