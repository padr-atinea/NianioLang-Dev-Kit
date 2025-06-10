const ov = require('./ov');

function get_fun_name(fun) {
	return (fun.split('::'))[1];
}

function arr(arr_type) {
	return ov.mk('tct_arr', arr_type);
}

function own_arr(arr_type) {
	return ov.mk('tct_own_arr', arr_type);
}

function rec(h) {
	return ov.mk('tct_rec', h);
}

function own_rec(h) {
	return ov.mk('tct_own_rec', h);
}

function ref(name) {
	return ov.mk('tct_ref', name);
}

function int() {
	return ov.mk('tct_int');
}

function string() {
	return ov.mk('tct_string');
}

function none() {
	return ov.mk('tct_var_none');
}

function void_() {
	return ov.mk('tct_void');
}

function empty() {
	return ov.mk('tct_empty');
}

function hash(h) {
	return ov.mk('tct_hash', h);
}

function own_hash(h) {
	return ov.mk('tct_own_hash', h);
}

function tct_im() {
	return ov.mk('tct_im');
}

function bool() {
	return ov.mk('tct_bool');
}

function func() {
	return rec({module: string(), name: string()});
}

function var_(h) {
	var types = {};
	for (const [item, value] of Object.entries(h)) {
		var et;
		if (ov.is(value, 'tct_var_none')) {
			et = ov.mk('no_param');
		} else {
			et = ov.mk('with_param', value);
		}
		types[item] = et;
	}
	return ov.mk('tct_var', types);
}

function own_var(h) {
	var types = {};
	for (const [item, value] of Object.entries(h)) {
		var et;
		if (ov.is(value, 'tct_var_none')) {
			et = ov.mk('no_param');
		} else {
			et = ov.mk('with_param', value);
		}
		types[item] = et;
	}
	return ov.mk('tct_own_var', types);
}

function try_var_as_case(variant, str_case) {
	if (!ov.is(unless, 'tct_var')) return ov.mk('err', '');
	if (!ov.as(variant, 'tct_var')[str_case]) return ov.mk('err', '');
	var sub = ov.as(variant, 'tct_var')[str_case];
	if (!ov.is(sub, 'with_param')) return ov.mk('err', '');
	return ov.mk('ok', ov.as(sub, 'with_param'));
}

// function meta_type() {
// 	return ptd::var({
// 			tct_rec: ptd::hash(@meta_type),
// 			tct_own_rec: ptd::hash(@meta_type),
// 			tct_hash: @meta_type,
// 			tct_own_hash: @meta_type,
// 			tct_arr: @meta_type,
// 			tct_own_arr: @meta_type,
// 			tct_var: ptd::hash(ptd::var({with_param: @meta_type, no_param: ptd::none()})),
// 			tct_own_var: ptd::hash(ptd::var({with_param: @meta_type, no_param: ptd::none()})),
// 			tct_ref: ptd::string(),
// 			tct_int: ptd::none(),
// 			tct_string: ptd::none(),
// 			tct_bool: ptd::none(),
// 			tct_empty: ptd::none(),
// 			tct_void: ptd::none(),
// 			tct_im: ptd::none()
// 		});
// }

function own_type_to_ptd(type, defined_types) {
	if (ov.is(type, 'tct_rec')) {
		const p = ov.as(type, 'tct_rec');
		return ov.mk('tct_rec', p);
	} else if (ov.is(type, 'tct_own_rec')) {
		const p = ov.as(type, 'tct_rec');
		var h = {};
		for (const [name, t] of Object.entries(p)) {
			h[name] = own_type_to_ptd(t, defined_types);
		}
		return ov.mk('tct_rec', h);
	} else if (ov.is(type, 'tct_hash')) {
		const p = ov.as(type, 'tct_rec');
		return ov.mk('tct_hash', p);
	} else if (ov.is(type, 'tct_own_hash')) {
		const p = ov.as(type, 'tct_rec');
		return ov.mk('tct_hash', own_type_to_ptd(p, defined_types));
	} else if (ov.is(type, 'tct_arr')) {
		const p = ov.as(type, 'tct_rec');
		return ov.mk('tct_arr', p);
	} else if (ov.is(type, 'tct_own_arr')) {
		const p = ov.as(type, 'tct_rec');
		return ov.mk('tct_arr', own_type_to_ptd(p, defined_types));
	} else if (ov.is(type, 'tct_var')) {
		const p = ov.as(type, 'tct_rec');
		return ov.mk('tct_var', p);
	} else if (ov.is(type, 'tct_own_var')) {
		const p = ov.as(type, 'tct_rec');
		var h = {};
		for (const [name, t] of Object.entries(p)) {
			if (ov.is(t, 'no_param')) {
				h[name] = ov.mk('no_param');
			} else if (ov.is(t, 'with_param')) {
				const param = ov.as(type, 'with_param');
				h[name] = ov.mk('with_param', own_type_to_ptd(param, defined_types));
			}
		}
		return ov.mk('tct_var', h);
	} else if (ov.is(type, 'tct_ref')) {
		const p = ov.as(type, 'tct_rec');
		if (!(Object.keys(defined_types).includes(p))) return ov.mk('tct_ref', p);
		return own_type_to_ptd(defined_types[p], defined_types);
	} else if (ov.is(type, 'tct_int')) {
		return ov.mk('tct_int');
	} else if (ov.is(type, 'tct_string')) {
		return ov.mk('tct_string');
	} else if (ov.is(type, 'tct_bool')) {
		return ov.mk('tct_bool');
	} else if (ov.is(type, 'tct_empty')) {
		return ov.mk('tct_empty');
	} else if (ov.is(type, 'tct_void')) {
		return ov.mk('tct_void');
	} else if (ov.is(type, 'tct_im')) {
		return ov.mk('tct_im');
	}
}

function is_own_type(type, defined_types) {
	if (ov.is(type, 'tct_rec')) {
		return false;
	} else if (ov.is(type, 'tct_own_rec')) {
		return true;
	} else if (ov.is(type, 'tct_hash')) {
		return false;
	} else if (ov.is(type, 'tct_own_hash')) {
		return true;
	} else if (ov.is(type, 'tct_arr')) {
		return false;
	} else if (ov.is(type, 'tct_own_arr')) {
		return true;
	} else if (ov.is(type, 'tct_var')) {
		return false;
	} else if (ov.is(type, 'tct_own_var')) {
		return true;
	} else if (ov.is(type, 'tct_ref')) {
		const p = ov.as(type, 'tct_rec');
		if (Object.keys(defined_types).includes(p)) {
			return is_own_type(defined_types[p], defined_types);
		} else if (get_fun_name(p)  in defined_types) {
			return is_own_type(defined_types[get_fun_name(p)], defined_types);
		}
		return false;
	} else if (ov.is(type, 'tct_int')) {
		return false;
	} else if (ov.is(type, 'tct_string')) {
		return false;
	} else if (ov.is(type, 'tct_bool')) {
		return false;
	} else if (ov.is(type, 'tct_empty')) {
		return false;
	} else if (ov.is(type, 'tct_void')) {
		return false;
	} else if (ov.is(type, 'tct_im')) {
		return false;
	}
}

module.exports = {
	arr,
	own_arr,
	rec,
	own_rec,
	ref,
	int,
	string,
	none,
	void_,
	empty,
	hash,
	own_hash,
	tct_im,
	bool,
	func,
	var_,
	own_var,
	try_var_as_case,
	// meta_type,
	own_type_to_ptd,
	is_own_type,
}