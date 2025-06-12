const ov = require('../base/ov');
const string = require('../base/string');

function get_anon_name_loop(type) {
	let match_type = type;
	if (ov.is(match_type, 'tct_im')) {
		return '0im';
	} else if (ov.is(match_type, 'tct_arr')) {
		let arr_type = ov.as(match_type, 'tct_arr');
		return '0im';
	} else if (ov.is(match_type, 'tct_own_arr')) {
		let arr_type = ov.as(match_type, 'tct_own_arr');
		return '0ownarr' + get_anon_name(arr_type);
	} else if (ov.is(match_type, 'tct_hash')) {
		let hash_type = ov.as(match_type, 'tct_hash');
		return '0im';
	} else if (ov.is(match_type, 'tct_own_hash')) {
		let hash_type = ov.as(match_type, 'tct_own_hash');
		return '0ownhash' + get_anon_name(hash_type);
	} else if (ov.is(match_type, 'tct_rec')) {
		let records = ov.as(match_type, 'tct_rec');
		return '0im';
	} else if (ov.is(match_type, 'tct_own_rec')) {
		let records = ov.as(match_type, 'tct_own_rec');
		let ret = '0RB';
		for (const [r_name, r_type] of Object.entries(records)) {
			ret += get_anon_name(r_type) + '0' + r_name + '0';
		}
		ret += 'RE';
		return ret;
	} else if (ov.is(match_type, 'tct_ref')) {
		let ref_name = ov.as(match_type, 'tct_ref');
		return '0ref' + func_ref_to_struct_name(ref_name);
	} else if (ov.is(match_type, 'tct_void')) {
		return '0void';
	} else if (ov.is(match_type, 'tct_int')) {
		return '0int';
	} else if (ov.is(match_type, 'tct_string')) {
		return '0im';
	} else if (ov.is(match_type, 'tct_bool')) {
		return '0bool';
	} else if (ov.is(match_type, 'tct_var')) {
		let vars = ov.as(match_type, 'tct_var');
		return '0im';
	} else if (ov.is(match_type, 'tct_own_var')) {
		let vars = ov.as(match_type, 'tct_own_var');
		let ret = '0VB';
		for (const [v_name, v_type] of Object.entries(vars)) {
			let match_v_type = v_type;
			if (ov.is(match_v_type, 'with_param')) {
				let param_type = ov.as(match_v_type, 'with_param');
				ret += get_anon_name(param_type) + '0' + v_name + '0';
			} else if (ov.is(match_v_type, 'no_param')) {
				ret += 'none0' + v_name + '0';
			}
		}
		ret += 'VE';
		return ret;
	} else if (ov.is(match_type, 'tct_empty')) {
		return '0im';
	}
}

function get_anon_name(type) {
	return 'anon_type0' + get_anon_name_loop(type);
}

function func_ref_to_struct_name(f) {
	if (f === 'boolean_t::type') {
		return 'bool';
	}
	return string.replace(f, '::', '0') + '0type';
}



module.exports = {
	get_anon_name_loop,
	get_anon_name,
	func_ref_to_struct_name
}