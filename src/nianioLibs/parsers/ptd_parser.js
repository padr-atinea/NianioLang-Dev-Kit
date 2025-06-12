const ov = require('../base/ov');
const tct = require('../type_checker/tct');

function parse_hash(fun_arg) {
	var hash_decl = ov.as(fun_arg.value, 'hash_decl');
	var elems = {};
	for (const hash_elem of hash_decl) {
		const try_ret = try_value_to_ptd(hash_elem.val);
		if (ov.is(try_ret, 'err')) return try_ret;
		const ret = ov.as(try_ret, 'ok');
		elems[ov.as(hash_elem.key.value, 'hash_key')] = ret;
	}
	return ov.mk('ok', elems);
}

function fun_def_to_ptd(ast) {
	var cmd = ov.as(ast.cmd, 'block').cmds;
	if (!(cmd.length == 1 && ov.is(cmd[0].cmd, 'return'))) return ov.mk('err', 'type function should have only a return command');
	return try_value_to_ptd(ov.as(cmd[0].cmd, 'return'));
}

function try_value_to_ptd(ast_arg) {
	var ast = ast_arg.value;
	if (ov.is(ast, 'unary_op')) {
		var op = ov.as(ast, 'unary_op');
		if (op.op !== '@') return ov.mk('err', 'ptd function argument can be other ptd function or reference type start witch @: ' + op.op);
		var fun_str = ov.as(op.val.value, 'fun_label');
		return ov.mk('ok', tct.ref(fun_str.module + '::' + fun_str.name));
	}
	if (!ov.is(ast, 'fun_val')) return ov.mk('err', 'can parse only function: ' + ov.get_element(ast));
	var fun_val = ov.as(ast, 'fun_val');
	if (fun_val.module !== 'ptd' && fun_val.module !== 'own') return ov.mk('err', 'can parse only ptd function: ' + fun_val.module + '::' + fun_val.name);
	var args_size = fun_val.args.length;
	var args_size_str = args_size.toString();
	var mod_name = fun_val.module;
	var fun_name = fun_val.name;
	if (mod_name === 'ptd') {
		if (fun_name === 'ptd_im') {
			if (args_size > 0) return ov.mk('err', 'im can\'t have arguments: ' + args_size_str);
			return ov.mk('ok', tct.tct_im());
		} else if (fun_name === 'void') {
			return ov.mk('err', 'Void type can be used only as a return type of function');
		} else if (fun_name === 'int') {
			if (args_size > 0) return ov.mk('err', 'int can\'t have arguments: ' + args_size_str);
			return ov.mk('ok', tct.int());
		} else if (fun_name === 'string') {
			if (args_size > 0) return ov.mk('err', 'string can\'t have arguments: ' + args_size_str);
			return ov.mk('ok', tct.string());
		} else if (fun_name === 'bool') {
			if (args_size > 0) return ov.mk('err', 'sim can\'t have arguments: ' + args_size_str);
			return ov.mk('ok', tct.bool());
		}
	}
	if (fun_name === 'none') return ov.mk('err', '\'none\' type can be used only in \'var\' type');
	if (fun_val.args.length !== 1) return ov.mk('err', 'expected one argument in ' + fun_name + ' function call');
	var fun_arg = fun_val.args[0].val;
	if (fun_name === 'rec') {
		if (!ov.is(fun_arg.value, 'hash_decl')) return ov.mk('err', 'rec must have hash: ' + ov.get_element(fun_arg));
		const try_ret = parse_hash(fun_arg);
		if (ov.is(try_ret, 'err')) return try_ret;
		const ret = ov.as(try_ret, 'ok');
		if (mod_name === 'ptd') {
			return ov.mk('ok', tct.rec(ret));
		} else {
			return ov.mk('ok', tct.own_rec(ret));
		}
	} else if (fun_name === 'hash') {
		const try_ret = try_value_to_ptd(fun_arg);
		if (ov.is(try_ret, 'err')) return try_ret;
		const ret = ov.as(try_ret, 'ok');
		if (mod_name === 'ptd') {
			return ov.mk('ok', tct.hash(ret));
		} else {
			return ov.mk('ok', tct.own_hash(ret));
		}
	} else if (fun_name === 'arr') {
		const try_ret = try_value_to_ptd(fun_arg);
		if (ov.is(try_ret, 'err')) return try_ret;
		const ret = ov.as(try_ret, 'ok');
		if (mod_name === 'ptd') {
			return ov.mk('ok', tct.arr(ret));
		} else {
			return ov.mk('ok', tct.own_arr(ret));
		}
	} else if (fun_name === 'var') {
		if (args_size !== 1) return ov.mk('err', 'var must have hash' + args_size_str);
		if (!ov.is(fun_arg.value, 'hash_decl')) return ov.mk('err', 'var must have hash: ' + ov.get_element(fun_arg));
		var hash_decl = ov.as(fun_arg.value, 'hash_decl');
		var elems = {};
		for (const hash_elem of hash_decl) {
			if (ov.is(hash_elem.val.value, 'fun_val')) {
				fun_val = ov.as(hash_elem.val.value, 'fun_val');
				if (fun_val.module === 'ptd' && fun_val.name === 'none') {
					elems[ov.as(hash_elem.key.value, 'hash_key')] = tct.none();
					continue;
				}
			}
			const try_ret = try_value_to_ptd(hash_elem.val);
			if (ov.is(try_ret, 'err')) return try_ret;
			const ret = ov.as(try_ret, 'ok');
			elems[ov.as(hash_elem.key.value, 'hash_key')] = ret;
		}
		if (mod_name === 'ptd') {
			return ov.mk('ok', tct.var_(elems));
		} else {
			return ov.mk('ok', tct.own_var(elems));
		}
	} else {
		return ov.mk('err', 'it is not type function : ' + fun_name);
	}
}

module.exports = { fun_def_to_ptd, try_value_to_ptd }