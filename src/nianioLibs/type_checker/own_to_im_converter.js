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

function get_type_constructor(type, remove_owns, refs_depth, known_types, format = false, tabs = 0) {
	if (!remove_owns) {
		refs_depth = 0;
		format = false;
	}
	return _get_type_constructor(type, remove_owns ? 'ptd' : 'own', refs_depth, known_types, format, tabs).res;
}

function _get_type_constructor(type, own, refs_depth, known_types, format, tabs) {
	const max_line_length = 40;
	const max_line_count = 3;
	if (ov.is(type, 'tct_rec') || ov.is(type, 'tct_own_rec')) {
		let local_format = false;
		const entries = Object.entries(ov.get_value(type)).map(([name, p_type]) => {
			const r = _get_type_constructor(p_type, own, refs_depth, known_types, format, tabs + 1);
			local_format |= r.break_line;
			local_format |= r.res.length > max_line_length;
			return `${name} => ${r.res}`;
		});
		local_format |= entries.length > max_line_count || entries.join(', ').length > max_line_length * 2;
		local_format &= format;
		let res = `${ov.is(type, 'tct_rec') ? 'ptd' : own}::rec({${local_format ? `\n${'\t'.repeat(tabs + 1)}` : ''}`;
		res += entries.join(local_format ? `,\n${'\t'.repeat(tabs + 1)}` : ', ');
		res += `${local_format ? `\n${'\t'.repeat(tabs)}` : ''}})`;
		return { break_line: local_format, res: res };
	} else if (ov.is(type, 'tct_hash') || ov.is(type, 'tct_own_hash')) {
		const r = _get_type_constructor(ov.get_value(type), own, refs_depth, known_types, format, tabs);
		return { break_line: r.break_line, res: `${ov.is(type, 'tct_hash') ? 'ptd' : own}::hash(${r.res})` };
	} else if (ov.is(type, 'tct_arr') || ov.is(type, 'tct_own_arr')) {
		const r = _get_type_constructor(ov.get_value(type), own, refs_depth, known_types, format, tabs);
		return { break_line: r.break_line, res: `${ov.is(type, 'tct_arr') ? 'ptd' : own}::arr(${r.res})` };
	} else if (ov.is(type, 'tct_var') || ov.is(type, 'tct_own_var')) {
		let local_format = false;
		const entries = Object.entries(ov.get_value(type)).map(([name, p_type]) => {
			if (ov.is(p_type, 'with_param')) {
				const r = _get_type_constructor(ov.as(p_type, 'with_param'), own, refs_depth, known_types, format, tabs + 1);
				local_format |= r.break_line;
				local_format |= max_line_length;
				return `${name} => ${r.res}`;
			}
			return `${name} => ptd::none()`;
		});
		local_format |= entries.length > max_line_count || entries.join(', ').length > max_line_length * 2;
		local_format &= format;
		let res = `${ov.is(type, 'tct_var') ? 'ptd' : own}::var({${local_format ? `\n${'\t'.repeat(tabs + 1)}` : ''}`;
		res += entries.join(local_format ? `,\n${'\t'.repeat(tabs + 1)}` : ', ');
		res += `${local_format ? `\n${'\t'.repeat(tabs)}` : ''}})`;
		return { break_line: local_format, res: res };
	} else if (ov.is(type, 'tct_ref')) {
		let p = ov.as(type, 'tct_ref');
		if (refs_depth > 0 && format) {
			const res = _get_type_constructor(known_types[p], own, refs_depth - 1, known_types, format, tabs);
			return { break_line: res.break_line, res: `(@${p}) ${res.res}` };
		}
		else return { break_line: false, res: `@${p}` };
	} else if (ov.is(type, 'tct_int')) return { break_line: false, res: 'ptd::ptd_int()' };
	else if (ov.is(type, 'tct_string')) return { break_line: false, res: 'ptd::ptd_string()' };
	else if (ov.is(type, 'tct_bool')) return { break_line: false, res: 'ptd::ptd_bool()' };
	else if (ov.is(type, 'tct_im')) return { break_line: false, res: 'ptd::ptd_im()' };
	else if (ov.is(type, 'tct_empty')) {
		if (format) return { break_line: false, res: 'ptd::ptd_empty()' };
		else throw new Error();
	} else if (ov.is(type, 'tct_void')){
		if (format) return { break_line: false, res: 'ptd::ptd_void()' };
		else throw new Error();
	}
	
}

function get_function(type, known_types) {
	let body = 'def ' + get_function_name(type, known_types) + '(ref arg : ' +
		get_type_constructor(type, false, 0, known_types) + ') {';
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
	get_type_constructor,
	get_function_name,
	get_required_arg_type,
	get_function
}