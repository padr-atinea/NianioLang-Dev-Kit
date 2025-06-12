const ov = require('../base/ov');
const tct = require('./tct');
const anon_naming = require('./anon_naming');
const hash = require('../base/hash');
const array = require('../base/array');
const string = require('../base/string');

function conv_priv_prefix() {
	return 'conv_to_im';
}

function get_function_name(type, known_types) {
	if (ov.is(type, 'tct_ref')) {
		if (!tct.is_own_type(type, known_types)) {
			return '';
		}
		let ref_name = ov.as(type, 'tct_ref');
		let [module_name, fun_name] = ref_name.split('::');
		return module_name + '::' + conv_priv_prefix() + '0' + fun_name;
	}
	if (tct.is_own_type(type, {})) {
		return conv_priv_prefix() + anon_naming.get_anon_name_loop(type);
	}
	return '';
}

function get_required_arg_type(type, known_types) {
	let match_type_19 = type;
	if (ov.is(match_type_19, 'tct_rec')) {
		let p = ov.as(match_type_19, 'tct_rec');
		return '';
	} else if (ov.is(match_type_19, 'tct_own_rec')) {
		let p = ov.as(match_type_19, 'tct_own_rec');
		return 'ref';
	} else if (ov.is(match_type_19, 'tct_hash')) {
		let p = ov.as(match_type_19, 'tct_hash');
		return '';
	} else if (ov.is(match_type_19, 'tct_own_hash')) {
		let p = ov.as(match_type_19, 'tct_own_hash');
		return 'ref';
	} else if (ov.is(match_type_19, 'tct_arr')) {
		let p = ov.as(match_type_19, 'tct_arr');
		return '';
	} else if (ov.is(match_type_19, 'tct_own_arr')) {
		let p = ov.as(match_type_19, 'tct_own_arr');
		return 'ref';
	} else if (ov.is(match_type_19, 'tct_var')) {
		let p = ov.as(match_type_19, 'tct_var');
		return '';
	} else if (ov.is(match_type_19, 'tct_own_var')) {
		let p = ov.as(match_type_19, 'tct_own_var');
		return 'ref';
	} else if (ov.is(match_type_19, 'tct_ref')) {
		let p = ov.as(match_type_19, 'tct_ref');
		return get_required_arg_type(known_types[p], known_types);
	} else if (ov.is(match_type_19, 'tct_int')) {
		return '';
	} else if (ov.is(match_type_19, 'tct_string')) {
		return '';
	} else if (ov.is(match_type_19, 'tct_bool')) {
		return '';
	} else if (ov.is(match_type_19, 'tct_empty')) {
		throw new Error();
	} else if (ov.is(match_type_19, 'tct_void')) {
		throw new Error();
	} else if (ov.is(match_type_19, 'tct_im')) {
		return '';
	}
}

function get_type_constructor(type, remove_owns, known_types) {
	let res = '';
	let own = 'own';
	if (remove_owns) {
		own = 'ptd';
	}
	let match_type_20 = type;
	if (ov.is(match_type_20, 'tct_rec')) {
		let p = ov.as(match_type_20, 'tct_rec');
		res = 'ptd::rec({';
		for (const [name, p_type] of Object.entries(p)) {
			res += name + ' => ' + get_type_constructor(p_type, remove_owns, known_types) + ', ';
		}
		res += '})';
	} else if (ov.is(match_type_20, 'tct_own_rec')) {
		let p = ov.as(match_type_20, 'tct_own_rec');
		res = own + '::rec({';
		for (const [name, p_type] of Object.entries(p)) {
			res += name + ' => ' + get_type_constructor(p_type, remove_owns, known_types) + ', ';
		}
		res += '})';
	} else if (ov.is(match_type_20, 'tct_hash')) {
		let p = ov.as(match_type_20, 'tct_hash');
		res = 'ptd::hash(' + get_type_constructor(p, remove_owns, known_types) + ')';
	} else if (ov.is(match_type_20, 'tct_own_hash')) {
		let p = ov.as(match_type_20, 'tct_own_hash');
		res = own + '::hash(' + get_type_constructor(p, remove_owns, known_types) + ')';
	} else if (ov.is(match_type_20, 'tct_arr')) {
		let p = ov.as(match_type_20, 'tct_arr');
		res = 'ptd::arr(' + get_type_constructor(p, remove_owns, known_types) + ')';
	} else if (ov.is(match_type_20, 'tct_own_arr')) {
		let p = ov.as(match_type_20, 'tct_own_arr');
		res = own + '::arr(' + get_type_constructor(p, remove_owns, known_types) + ')';
	} else if (ov.is(match_type_20, 'tct_var')) {
		let p = ov.as(match_type_20, 'tct_var');
		res = 'ptd::var({';
		for (const [name, p_type] of Object.entries(p)) {
			let match_p_type = p_type;
			if (ov.is(match_p_type, 'with_param')) {
				let v = ov.as(match_p_type, 'with_param');
				res += name + ' => ' + get_type_constructor(v, remove_owns, known_types) + ', ';
			} else if (ov.is(match_p_type, 'no_param')) {
				res += name + ' => ptd::none(), ';
			}
		}
		res += '})';
	} else if (ov.is(match_type_20, 'tct_own_var')) {
		let p = ov.as(match_type_20, 'tct_own_var');
		res = own + '::var({';
		for (const [name, p_type] of Object.entries(p)) {
			let match_p_type_0 = p_type;
			if (ov.is(match_p_type_0, 'with_param')) {
				let v = ov.as(match_p_type_0, 'with_param');
				res += name + ' => ' + get_type_constructor(v, remove_owns, known_types) + ', ';
			} else if (ov.is(match_p_type_0, 'no_param')) {
				res += name + ' => ptd::none(), ';
			}
		}
		res += '})';
	} else if (ov.is(match_type_20, 'tct_ref')) {
		let p = ov.as(match_type_20, 'tct_ref');
		if (remove_owns) {
			res = get_type_constructor(known_types[p], remove_owns, known_types);
		} else {
			res = '@' + p;
		}
	} else if (ov.is(match_type_20, 'tct_int')) {
		res = 'ptd::int()';
	} else if (ov.is(match_type_20, 'tct_string')) {
		res = 'ptd::string()';
	} else if (ov.is(match_type_20, 'tct_bool')) {
		res = 'ptd::bool()';
	} else if (ov.is(match_type_20, 'tct_empty')) {
		throw new Error();
	} else if (ov.is(match_type_20, 'tct_void')) {
		throw new Error();
	} else if (ov.is(match_type_20, 'tct_im')) {
		res = 'ptd::ptd_im()';
	}
	return res;
}

function get_function(type, known_types) {
	let body = 'def ' + get_function_name(type, known_types) + '(ref arg : ' +
		get_type_constructor(type, false, known_types) + ') {';
	if (ov.is(type, 'tct_ref')) {
		type = known_types[ov.as(type, 'tct_ref')];
	}
	let required_functions = {};
	let conv_fun_name = '';
	let match_type_21 = type;
	if (ov.is(match_type_21, 'tct_rec')) {
		let p = ov.as(match_type_21, 'tct_rec');
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_own_rec')) {
		let p = ov.as(match_type_21, 'tct_own_rec');
		body += 'var r = {';
		for (const [name, p_type] of Object.entries(p)) {
			conv_fun_name = get_function_name(p_type, known_types);
			body += name + ' => ' + conv_fun_name + '(' + get_required_arg_type(p_type, known_types)
				+ ' arg->' + name + '), ';
			hash.set_value(required_functions, conv_fun_name, p_type);
		}
		body += '}; return r;';
	} else if (ov.is(match_type_21, 'tct_hash')) {
		let p = ov.as(match_type_21, 'tct_hash');
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_own_hash')) {
		let p = ov.as(match_type_21, 'tct_own_hash');
		conv_fun_name = get_function_name(p, known_types);
		body += 'var h = {};';
		body += 'forh var key, ref value (arg) {';
		body += 'h{key} = ' + conv_fun_name + '(' + get_required_arg_type(p, known_types) +
			' value);';
		body += '} return h;';
		hash.set_value(required_functions, conv_fun_name, p);
	} else if (ov.is(match_type_21, 'tct_arr')) {
		let p = ov.as(match_type_21, 'tct_arr');
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_own_arr')) {
		let p = ov.as(match_type_21, 'tct_own_arr');
		conv_fun_name = get_function_name(p, known_types);
		hash.set_value(required_functions, conv_fun_name, p);
		body += 'var a = [];';
		body += 'fora var elem (arg) {';
		body += 'a []= ' + conv_fun_name + '(' + get_required_arg_type(p, known_types) + ' elem);';
		body += '} return a;';
	} else if (ov.is(match_type_21, 'tct_var')) {
		let p = ov.as(match_type_21, 'tct_var');
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_own_var')) {
		let p = ov.as(match_type_21, 'tct_own_var');
		body += 'match (arg) ';
		for (const [name, p_type] of Object.entries(p)) {
			let match_p_type_1 = p_type;
			if (ov.is(match_p_type_1, 'with_param')) {
				let v = ov.as(match_p_type_1, 'with_param');
				conv_fun_name = get_function_name(v, known_types);
				hash.set_value(required_functions, conv_fun_name, v);
				body += 'case :' + name + '(ref v_p){return :' + name + '(' +
					get_function_name(v, known_types) + '(' +
					get_required_arg_type(v, known_types) + ' v_p));} ';
			} else if (ov.is(match_p_type_1, 'no_param')) {
				body += 'case :' + name + '{return :' + name + ';} ';
			}
		}
	} else if (ov.is(match_type_21, 'tct_ref')) {
		let p = ov.as(match_type_21, 'tct_ref');
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_int')) {
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_string')) {
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_bool')) {
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_empty')) {
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_void')) {
		throw new Error();
	} else if (ov.is(match_type_21, 'tct_im')) {
		throw new Error();
	}
	body += '}';
	let funs_to_remove = [];
	for (const [r_name, r_type] of Object.entries(required_functions)) {
		if (!tct.is_own_type(r_type, {})) {
			array.push(funs_to_remove, r_name);
		}
	}
	for (const r_f of funs_to_remove) {
		hash.delete(required_functions, r_f);
	}
	let result = { body: body, required_functions: required_functions };
	return result;
}



module.exports = {
	get_function_name,
	get_required_arg_type,
	get_function
}