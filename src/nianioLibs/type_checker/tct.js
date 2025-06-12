const ov = require('../base/ov');
const hash_ = require('../base/hash');

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
	return rec({ module: string(), name: string() });
}

function var_(h) {
	let types = {};
	for (const [item, value] of Object.entries(h)) {
		let et;
		if (ov.is(value, 'tct_var_none')) {
			et = ov.mk('no_param');
		} else {
			et = ov.mk('with_param', value);
		}
		hash_.set_value(types, item, et);
	}
	return ov.mk('tct_var', types);
}

function own_var(h) {
	let types = {};
	for (const [item, value] of Object.entries(h)) {
		let et;
		if (ov.is(value, 'tct_var_none')) {
			et = ov.mk('no_param');
		} else {
			et = ov.mk('with_param', value);
		}
		hash_.set_value(types, item, et);
	}
	return ov.mk('tct_own_var', types);
}

function try_var_as_case(variant, str_case) {
	if (!(ov.is(variant, 'tct_var'))) {
		return ov.mk('err', '');
	}
	if (!(hash_.has_key(ov.as(variant, 'tct_var'), str_case))) {
		return ov.mk('err', '');
	}
	let sub = hash_.get_value(ov.as(variant, 'tct_var'), str_case);
	if (!(ov.is(sub, 'with_param'))) {
		return ov.mk('err', '');
	}
	return ov.mk('ok', ov.as(sub, 'with_param'));
}

function own_type_to_ptd(type, defined_types) {
	let match_type = type;
	if (ov.is(match_type, 'tct_rec')) {
		let p = ov.as(match_type, 'tct_rec');
		return ov.mk('tct_rec', p);
	} else if (ov.is(match_type, 'tct_own_rec')) {
		let p = ov.as(match_type, 'tct_own_rec');
		let h = {};
		for (const [name, t] of Object.entries(p)) {
			hash_.set_value(h, name, own_type_to_ptd(t, defined_types));
		}
		return ov.mk('tct_rec', h);
	} else if (ov.is(match_type, 'tct_hash')) {
		let p = ov.as(match_type, 'tct_hash');
		return ov.mk('tct_hash', p);
	} else if (ov.is(match_type, 'tct_own_hash')) {
		let p = ov.as(match_type, 'tct_own_hash');
		return ov.mk('tct_hash', own_type_to_ptd(p, defined_types));
	} else if (ov.is(match_type, 'tct_arr')) {
		let p = ov.as(match_type, 'tct_arr');
		return ov.mk('tct_arr', p);
	} else if (ov.is(match_type, 'tct_own_arr')) {
		let p = ov.as(match_type, 'tct_own_arr');
		return ov.mk('tct_arr', own_type_to_ptd(p, defined_types));
	} else if (ov.is(match_type, 'tct_var')) {
		let p = ov.as(match_type, 'tct_var');
		return ov.mk('tct_var', p);
	} else if (ov.is(match_type, 'tct_own_var')) {
		let p = ov.as(match_type, 'tct_own_var');
		let h = {};
		for (const [name, t] of Object.entries(p)) {
			let match_t = t;
			if (ov.is(match_t, 'no_param')) {
				hash_.set_value(h, name, ov.mk('no_param'));
			} else if (ov.is(match_t, 'with_param')) {
				let param = ov.as(match_t, 'with_param');
				hash_.set_value(h, name, ov.mk('with_param', own_type_to_ptd(param, defined_types)));
			}
		}
		return ov.mk('tct_var', h);
	} else if (ov.is(match_type, 'tct_ref')) {
		let p = ov.as(match_type, 'tct_ref');
		if (!(hash_.has_key(defined_types, p))) {
			return ov.mk('tct_ref', p);
		}
		return own_type_to_ptd(defined_types[p], defined_types);
	} else if (ov.is(match_type, 'tct_int')) {
		return ov.mk('tct_int');
	} else if (ov.is(match_type, 'tct_string')) {
		return ov.mk('tct_string');
	} else if (ov.is(match_type, 'tct_bool')) {
		return ov.mk('tct_bool');
	} else if (ov.is(match_type, 'tct_empty')) {
		return ov.mk('tct_empty');
	} else if (ov.is(match_type, 'tct_void')) {
		return ov.mk('tct_void');
	} else if (ov.is(match_type, 'tct_im')) {
		return ov.mk('tct_im');
	}
}

function get_fun_name(fun) {
	return (fun.split('::'))[1];
}

function is_own_type(type, defined_types) {
	let match_type_0 = type;
	if (ov.is(match_type_0, 'tct_rec')) {
		let p = ov.as(match_type_0, 'tct_rec');
		return false;
	} else if (ov.is(match_type_0, 'tct_own_rec')) {
		let p = ov.as(match_type_0, 'tct_own_rec');
		return true;
	} else if (ov.is(match_type_0, 'tct_hash')) {
		let p = ov.as(match_type_0, 'tct_hash');
		return false;
	} else if (ov.is(match_type_0, 'tct_own_hash')) {
		let p = ov.as(match_type_0, 'tct_own_hash');
		return true;
	} else if (ov.is(match_type_0, 'tct_arr')) {
		let p = ov.as(match_type_0, 'tct_arr');
		return false;
	} else if (ov.is(match_type_0, 'tct_own_arr')) {
		let p = ov.as(match_type_0, 'tct_own_arr');
		return true;
	} else if (ov.is(match_type_0, 'tct_var')) {
		let p = ov.as(match_type_0, 'tct_var');
		return false;
	} else if (ov.is(match_type_0, 'tct_own_var')) {
		let p = ov.as(match_type_0, 'tct_own_var');
		return true;
	} else if (ov.is(match_type_0, 'tct_ref')) {
		let p = ov.as(match_type_0, 'tct_ref');
		if (hash_.has_key(defined_types, p)) {
			return is_own_type(defined_types[p], defined_types);
		} else if (hash_.has_key(defined_types, get_fun_name(p))) {
			return is_own_type(defined_types[get_fun_name(p)], defined_types);
		}
		return false;
		// ssume somebody else handles the problem
	} else if (ov.is(match_type_0, 'tct_int')) {
		return false;
	} else if (ov.is(match_type_0, 'tct_string')) {
		return false;
	} else if (ov.is(match_type_0, 'tct_bool')) {
		return false;
	} else if (ov.is(match_type_0, 'tct_empty')) {
		return false;
	} else if (ov.is(match_type_0, 'tct_void')) {
		return false;
	} else if (ov.is(match_type_0, 'tct_im')) {
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
	own_type_to_ptd,
	is_own_type
}