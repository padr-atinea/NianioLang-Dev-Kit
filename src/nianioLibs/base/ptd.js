const ov = require('./ov');
const _hash = require('./hash');
const array = require('./array');
const _string = require('./string');
// const c_std_lib = require('./c_std_lib');

function arr(arr_type) {
	return ov.mk('ptd_arr', arr_type);
}

function rec(h) {
	return ov.mk('ptd_rec', h);
}

function int() {
	return ov.mk('ptd_int');
}

function string() {
	return ov.mk('ptd_string');
}

function bool() {
	return ov.mk('ptd_bool');
}

function none() {
	return ov.mk('ptd_var_none');
}

function _void () {
	return ov.mk('ptd_void');
}

function hash(h) {
	return ov.mk('ptd_hash', h);
}

function ptd_im() {
	return ov.mk('ptd_im');
}

function _var(h) {
	let types = {};
	for (const [item, value] of Object.entries(h)) {
		let et;
		if (ov.is(value, 'ptd_var_none')) {
			et = ov.mk('no_param');
		} else {
			et = ov.mk('with_param', value);
		}
		_hash.set_value(types, item, et);
	}
	return ov.mk('ptd_var', types);
}

function ensure(type, value) {
	let path = [];
	let ensure_ptd_ensure_dyn_type_value_path = ensure_dyn(type, value, path);
	if (ov.is(ensure_ptd_ensure_dyn_type_value_path, 'err')) throw new Error();

	return value;
}

function ensure_with_cast(type, value) {
	let path = [];
	let ensure_value = ensure_dyn(type, value, true, path);
	if (ov.is(ensure_value, 'err')) throw new Error();
	ensure_value = ov.as(ensure_value, 'ok');
	return value;
}

function try_ensure(type, value) {
	let path = [];
	let try_ptd_ensure_dyn_type, _value, _path_0 = ensure_dyn(type, value, path);
	if (ov.is(try_ptd_ensure_dyn_type, _value, _path_0, 'err')) return try_ptd_ensure_dyn_type, _value, _path_0;

	return ov.mk('ok', value);
}

function ensure_only_dynamic(type, value) {
	let path = [];
	let ensure_ptd_ensure_dyn_type_value_path_1 = ensure_dyn(type, value, path);
	if (ov.is(ensure_ptd_ensure_dyn_type_value_path_1, 'err')) throw new Error();

	return value;
}

function ensure_only_dynamic_with_cast(type, value) {
	let path = [];
	let ensure_ensure_dyn_type, _value, _true, _path = ensure_dyn(type, value, true, path);
	if (ov.is(ensure_ensure_dyn_type, _value, _true, _path, 'err')) throw new Error();

	return value;
}

function ensure_only_static_do_not_touch_without_permission(type, value) {
	type;
	return value;
}

function ensure_dyn(type, value, path) {
	return ensure_dyn(type, value, false, path);
}

function ensure_dyn(type, value, cast, path) {
	if (!(ov.is_variant(type))) {
		return ov.mk('err', { err: '1 Not ov reference in ensure', path: path });
	}
	let new_value;
	let match_type = type;
	if (ov.is(match_type, 'ptd_hash')) {
		let ptd_hash = ov.as(match_type, 'ptd_hash');
		if (!(_hash.is_hash(value))) {
			return ov.mk('err', { err: '2 HASH ref expected ', path: path });
		}
		new_value = {};
		for (const [key, val] of Object.entries(value)) {
			path.push(key);
			let try_new_value_key = ensure_dyn(ptd_hash, val, cast, path);
			if (ov.is(try_new_value_key, 'err')) return try_new_value_key;
			try_new_value_key = ov.as(try_new_value_key, 'ok');
			array.pop(path);
		}
		value = new_value;
	} else if (ov.is(match_type, 'ptd_arr')) {
		let ptd_arr = ov.as(match_type, 'ptd_arr');
		if (!(array.is_array(value))) {
			return ov.mk('err', { err: '3 ARRAY ref expected ', path: path });
		}
		new_value = [];
		for (const item of value) {
			path.push(':arr');
			let try_el = ensure_dyn(ptd_arr, item, cast, path);
			if (ov.is(try_el, 'err')) return try_el;
			let el = ov.as(try_el, 'ok');

			new_value.push(el);
			array.pop(path);
		}
	} else if (ov.is(match_type, 'ptd_rec')) {
		let ptd_rec = ov.as(match_type, 'ptd_rec');
		if (!(_hash.is_hash(value))) {
			return ov.mk('err', { err: '4 HASH ref expected ', path: path });
		}
		if (_hash.size(ptd_rec) != _hash.size(value)) {
			return ov.mk('err', { err: '5 keys amount mismatch in ptd_rec', path: path });
		}
		path.push(':hash');
		new_value = {};
		for (const [key, val] of Object.entries(ptd_rec)) {
			path.push(key);
			if (!(_hash.has_key(value, key))) {
				return ov.mk('err', { err: '6 key ' + key + ' not exists in hash', path: path });
			}
			let try_new_value_key_0 = ensure_dyn(val, _hash.get_value(value, key), cast, path);
			if (ov.is(try_new_value_key_0, 'err')) return try_new_value_key_0;
			try_new_value_key_0 = ov.as(try_new_value_key_0, 'ok');
			array.pop(path);
		}
		array.pop(path);
	} else if (ov.is(match_type, 'ptd_string')) {
		if ((cast && Number.isInteger(value))) {
			value = parseInt(value);
		}
		if (!(_string.is_string(value))) {
			return ov.mk('err', { err: '8 wrong string ref ', path: path });
		}
		new_value = value;
	} else if (ov.is(match_type, 'ptd_var')) {
		let ptd_var = ov.as(match_type, 'ptd_var');
		if (!(ov.is_variant(value))) {
			return ov.mk('err', { err: '9 not ov ref', path: path });
		}
		let name = ov.get_element(value);
		if (!(_hash.has_key(ptd_var, name))) {
			return ov.mk('err', { err: '10 Case ' + name + ' not allowed in variant. ', path: path });
		}
		path.push(name);
		let variant = _hash.get_value(ptd_var, name);
		let match_variant = variant;
		if (ov.is(match_variant, 'with_param')) {
			let par = ov.as(match_variant, 'with_param');
			if (!(ov.has_value(value))) {
				return ov.mk('err', { err: '12 with_param ov has no value', path: path });
			}
			let try_inner = ensure_dyn(par, ov.get_value(value), cast, path);
			if (ov.is(try_inner, 'err')) return try_inner;
			let inner = ov.as(try_inner, 'ok');

			new_value = ov.mk(name, inner);
		} else if (ov.is(match_variant, 'no_param')) {
			if (ov.has_value(value)) {
				return ov.mk('err', { err: '11 no_param ov has value', path: path });
			}
			new_value = ov.mk(name);
		}
		array.pop(path);
	} else if (ov.is(match_type, 'ptd_int')) {
		if ((cast && _string.is_string(value))) {
			value = string_to_int(value);
		}
		if (!(Number.isInteger(value))) {
			return ov.mk('err', { err: '13 wrong int ', path: path });
		}
		new_value = value;
	} else if (ov.is(match_type, 'ptd_im')) {
		new_value = value;
	} else if (ov.is(match_type, 'ref')) {
		let ptd_ref = ov.as(match_type, 'ref');
		path.push(ptd_ref);
		let try_new_value = ensure_dyn(exec(type, []), value, cast, path);
		if (ov.is(try_new_value, 'err')) return try_new_value;
		try_new_value = ov.as(try_new_value, 'ok');
		array.pop(path);
	} else if (ov.is(match_type, 'ptd_bool')) {
		if (!(ov.is_variant(value))) {
			return ov.mk('err', { err: '14 not bool ref', path: path });
		}
		let name = ov.get_element(value);
		if (name !== 'TRUE' && name !== 'FALSE') {
			return ov.mk('err', { err: '15 Case ' + name + ' not allowed in bool', path: path });
		}
		new_value = value;
	}
	return ov.mk('ok', new_value);
}

function is_ref_type(ptd, type_name) {
	let match_ptd = ptd;
	if (ov.is(match_ptd, 'ref')) {
		let ref_name = ov.as(match_ptd, 'ref');
		if (!((ov.is(type_name, 'ref')))) {
			return false;
		}
		let ref_name2 = ov.as(type_name, 'ref');
		if (_hash.is_hash(ref_name2)) {
			if (!((ref_name2.module === ref_name.module))) {
				return false;
			}
			if (!((ref_name2.name === ref_name.name))) {
				return false;
			}
		} else {
			return ref_name2 === ref_name;
		}
		return true;
	} else if (ov.is(match_ptd, 'ptd_im')) {
	} else if (ov.is(match_ptd, 'ptd_arr')) {
	} else if (ov.is(match_ptd, 'ptd_var')) {
	} else if (ov.is(match_ptd, 'ptd_rec')) {
	} else if (ov.is(match_ptd, 'ptd_hash')) {
	}
	return false;
}

function try_cast(type, value) {
	return try_dynamic_cast(type, value);
}

function try_dynamic_cast(type, value) {
	let tmp = try_dynamic_cast(type, value);
	if (array.len(tmp) == 0) {
		return ov.mk('ok', value);
	}
	return ov.mk('err', tmp);
}

function get_imm_kind(imm) {
	if (Number.isInteger(imm)) {
		return ov.mk('int');
	}
	if (_string.is_string(imm)) {
		return ov.mk('string');
	}
	if (ov.is_variant(imm)) {
		return ov.mk('variant');
	}
	if (_hash.is_hash(imm)) {
		return ov.mk('hash');
	}
	if (array.is_array(imm)) {
		return ov.mk('array');
	}
	throw new Error();
}

function try_dynamic_cast(type, value) {
	if (!(ov.is_variant(type))) {
		return [ov.mk('error', ov.mk('is_not_type', get_imm_kind(type)))];
	}
	let match_type_0 = type;
	if (ov.is(match_type_0, 'ptd_hash')) {
		let ptd_hash = ov.as(match_type_0, 'ptd_hash');
		if (!(_hash.is_hash(value))) {
			return [ov.mk('error', ov.mk('hash_expected', get_imm_kind(type)))];
		}
		for (const [key, val] of Object.entries(value)) {
			let tmp = try_dynamic_cast(ptd_hash, val);
			if (array.len(tmp) > 0) {
				array.push(tmp, ov.mk('path', ov.mk('hash_key', key)));
				return tmp;
			}
		}
	} else if (ov.is(match_type_0, 'ptd_arr')) {
		let ptd_arr = ov.as(match_type_0, 'ptd_arr');
		if (!(array.is_array(value))) {
			return [ov.mk('error', ov.mk('array_expected', get_imm_kind(type)))];
		}
		for (let i = 0; i < array.len(value); i++) {
			let tmp = try_dynamic_cast(ptd_arr, value[i]);
			if (array.len(tmp) > 0) {
				array.push(tmp, ov.mk('path', ov.mk('array_index', i)));
				return tmp;
			}
		}
	} else if (ov.is(match_type_0, 'ptd_rec')) {
		let ptd_rec = ov.as(match_type_0, 'ptd_rec');
		if (!(_hash.is_hash(value))) {
			return [ov.mk('error', ov.mk('rec_expected', get_imm_kind(type)))];
		}
		if (_hash.size(ptd_rec) != _hash.size(value)) {
			return [ov.mk('error', ov.mk('rec_size', _hash.size(value)))];
		}
		for (const [key, val] of Object.entries(ptd_rec)) {
			if (!(_hash.has_key(value, key))) {
				return [ov.mk('error', ov.mk('no_key', key))];
			}
			let tmp = try_dynamic_cast(val, _hash.get_value(value, key));
			if (array.len(tmp) > 0) {
				array.push(tmp, ov.mk('path', ov.mk('rec_key', key)));
				return tmp;
			}
		}
	} else if (ov.is(match_type_0, 'ptd_int')) {
		if (!(Number.isInteger(value))) {
			return [ov.mk('error', ov.mk('int_expected', get_imm_kind(type)))];
		}
	} else if (ov.is(match_type_0, 'ptd_string')) {
		if (!(_string.is_string(value))) {
			return [ov.mk('error', ov.mk('string_expected', get_imm_kind(type)))];
		}
	} else if (ov.is(match_type_0, 'ptd_var')) {
		let ptd_var = ov.as(match_type_0, 'ptd_var');
		if (!(ov.is_variant(value))) {
			return [ov.mk('error', ov.mk('variant_expected', get_imm_kind(type)))];
		}
		let name = ov.get_element(value);
		if (!(_hash.has_key(ptd_var, name))) {
			return [ov.mk('error', ov.mk('unknown_case', name + ''))];
		}
		let variant = _hash.get_value(ptd_var, name);
		let match_variant_0 = variant;
		if (ov.is(match_variant_0, 'with_param')) {
			let par = ov.as(match_variant_0, 'with_param');
			if (!ov.has_value(value)) {
				return [ov.mk('error', ov.mk('no_value', name + ''))];
			}
			let tmp = try_dynamic_cast(par, ov.get_value(value));
			if (array.len(tmp) > 0) {
				array.push(tmp, ov.mk('path', ov.mk('variant_value', name + '')));
				return tmp;
			}
		} else if (ov.is(match_variant_0, 'no_param')) {
			if (ov.has_value(value)) {
				return [ov.mk('error', ov.mk('has_value', name + ''))];
			}
		}
	} else if (ov.is(match_type_0, 'ptd_im')) {
	} else if (ov.is(match_type_0, 'ref')) {
		let ptd_ref = ov.as(match_type_0, 'ref');
		let tmp = try_dynamic_cast(type, value);
		if (array.len(tmp) > 0) {
			array.push(tmp, ov.mk('path', ov.mk('type_ref', ptd_ref)));
			return tmp;
		}
	}
	return [];
}

function int_to_string(i) {
	return i.toString();
}

function string_to_int(s) {
	let ensure_ret = try_string_to_int(s);
	if (ov.is(ensure_ret, 'err')) throw new Error();
	let ret = ov.as(ensure_ret, 'ok');

	return ret;
}

function try_string_to_int(s) {
	return Number.isInteger(s) ? ov.mk('ok', parseInt(s)) : ov.mk('err');
}



module.exports = {
	arr,
	rec,
	int,
	string,
	bool,
	none,
	_void,
	hash,
	ptd_im,
	_var,
	ensure,
	ensure_with_cast,
	try_ensure,
	ensure_only_dynamic,
	ensure_only_dynamic_with_cast,
	ensure_only_static_do_not_touch_without_permission,
	ensure_dyn,
	is_ref_type,
	try_cast,
	try_dynamic_cast,
	get_imm_kind,
	int_to_string,
	string_to_int,
	try_string_to_int
}