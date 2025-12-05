const ov = require('../base/ov');
const string = require('../base/string');
const hash = require('../base/hash');
const array = require('../base/array');
const ptd = require('../base/ptd');
const string_utils = require('../base/string_utils');

function ssave(obj) {
	let state = { str: '', objects: {} };
	sprint(state, obj, 0, false);
	return state.str;
}

function debug(obj) {
	let state = { str: '', objects: {} };
	sprint(state, obj, 0, true);
	return state.str;
}

// function ssave_net_format(obj) {
// 	let state = { str: '', objects: {} };
// 	print_net_format(state, obj);
// 	return state.str;
// }

function eat_ws(state) {
	while (true) {
		if ((state.pos == state.len)) {
			return;
		}
		let char = string.ord(get_char(state));
		if (char == 9 || char == 10 || char == 13 || char == 32) {
			state.pos++;
		} else {
			return;
		}
	}
}

function get_char(state) {
	return string.substr(state.str, state.pos, 1);
}

function is_ov(state) {
	return string.substr(state.str, state.pos, 7) === 'ov::mk(';
}

function eat_non_ws(state, error) {
	let ret = '';
	let l = state.len;
	if (state.pos >= l) {
		error.val = true;
		return 'pos ' + state.pos + ': expected scalar';
	}
	while (true) {
		let char = get_char(state);
		if (!(string.is_letter(char) || string.is_digit(char) || char === '_')) {
			break;
		}
		++state.pos;
		ret += char;
		if ((state.pos >= l)) {
			break;
		}
	}
	if (ret === '') {
		error.val = true;
		return 'pos ' + state.pos + ': expected scalar';
	}
	return ret;
}

function parse_scalar(state, error, type) {
	eat_ws(state);
	let ret;
	if (get_char(state) === '"') {
		++state.pos;
		ret = finish_quoted_scalar(state, error);
	} else {
		ret = eat_non_ws(state, error);
	}
	if (ov.is(type, 'ptd_string') || ov.is(type, 'ptd_im')) {
		return ret;
	} else if (ov.is(type, 'ptd_int')) {
		let match_string_utils_get_integer_ret = string_utils.get_integer(ret);
		if (ov.is(match_string_utils_get_integer_ret, 'ok')) {
			let n = ov.as(match_string_utils_get_integer_ret, 'ok');
			return n;
		} else if (ov.is(match_string_utils_get_integer_ret, 'err')) {;
			error.val = true;
			return 'incorrect number';
		}
	} else {
		error.val = true;
		return 'expected ' + ssave(type) + ', got scalar';
	}
}

function finish_quoted_scalar(state, error) {
	let str = '';
	while (true) {
		if (state.pos >= state.len) {
			error.val = true;
			return 'pos ' + state.pos + ': expected "';
		}
		let char = get_char(state);
		++state.pos;
		if (char === '"') {
			break;
		} else if (char === '\\') {
			let escaped_char = finish_escape_seq(state, error);
		if (error.val) {
			return escaped_char;
		}
		str += escaped_char;
	} else {
		str += char;
	}
}
return str;
}

function finish_escape_seq(state, error) {
	if (state.pos >= state.len) {
		error.val = true;
		return 'pos ' + state.pos + ': expected escape sequence';
	}
	let char = get_char(state);
	++state.pos;
	if (char === 'n') {
		return string.lf();
	} else if (char === 'r') {
		return string.r();
	} else if (char === 't') {
		return string.tab();
	} else if (char === '\\' || char === '"' || char === '@' || char === '$') {
	return char;
} else if (char === 'x') {
	let hex_digit1 = eat_hex_digit(state, error);
	if (error.val) {
		return hex_digit1;
	}
	let hex_digit2 = eat_hex_digit(state, error);
	if (error.val) {
		return hex_digit2;
	}
	return ptd.ensure(ptd.string(), string_utils.hex2char(string.ord(hex_digit1), string.ord(hex_digit2)));
} else {
	error.val = true;
	return 'pos ' + (state.pos - 1) + ': expected escape sequence';
}
}

function eat_hex_digit(state, error) {
	let char = get_char(state);
	if (!string.is_hex_digit(char)) {
		error.val = true;
		return 'pos ' + state.pos + ': expected hexadecimal digit';
	}
	++state.pos;
	return char;
}

function match_s(state, pattern) {
	let len = string.length(pattern);
	if (string.substr(state.str, state.pos, len) === pattern) {
		state.pos += len;
		return true;
	} else {
		return false;
	}
}

function parse(state, error, type) {
	eat_ws(state);
	let char = get_char(state);
	while (ov.is(type, 'ref')) {
		let args = [];
		// type = ptd.ensure_only_static_do_not_touch_without_permission(@ptd.meta_type, c_std_lib.exec(type, args));
	}
	if (char === '{') {
		state.pos += 1;
		let _hash = {};
		eat_ws(state);
		while (!match_s(state, '}')) {
			let key = parse_scalar(state, error, ptd.string());
			if (error.val) {
				return key;
			}
			eat_ws(state);
			if (!match_s(state, '=>')) {
				error.val = true;
				return 'pos ' + state.pos + ': expected =>';
			}
			let field_type;
			if (ov.is(type, 'ptd_rec')) {
				if (_hash.has_key(ov.as(type, 'ptd_rec'), key)) {
					field_type = (ov.as(type, 'ptd_rec'))[key];
				} else {
					error.val = true;
					return 'unexpected hash key ' + key;
				}
			} else if (ov.is(type, 'ptd_hash')) {
				field_type = ov.as(type, 'ptd_hash');
			} else if (ov.is(type, 'ptd_im')) {
				field_type = ov.mk('ptd_im');
			} else {
				error.val = true;
				return 'expected ' + ssave(type) + ', got ' + ssave(ov.mk('ptd_hash'));
			}
			let value = parse(state, error, field_type);
			if (error.val) {
				return value;
			}
			hash.set_value(_hash, key, value);
			eat_ws(state);
			if (!match_s(state, ',')) {
				error.val = true;
				return 'pos ' + state.pos + ': expected ,';
			}
			eat_ws(state);
		}
		eat_ws(state);
		return _hash;
	} else if (char === '[') {
		state.pos += 1;
		let arr = [];
		eat_ws(state);
		while (!match_s(state, ']')) {
			let field_type;
			if (ov.is(type, 'ptd_arr')) {
				field_type = ov.as(type, 'ptd_arr');
			} else if (ov.is(type, 'ptd_im')) {
				field_type = ov.mk('ptd_im');
			} else {
				error.val = true;
				return 'expected ' + ssave(type) + ', got ' + ssave(ov.mk('ptd_hash'));
			}
			let value = parse(state, error, field_type);
			if (error.val) {
				return value;
			}
			array.push(arr, value);
			eat_ws(state);
			if (!match_s(state, ',')) {
				error.val = true;
				return 'pos ' + state.pos + ': expected ,';
			}
			eat_ws(state);
		}
		return arr;
	} else if (char === 'o' && is_ov(state)) {
		state.pos += 7;
		let key = parse_scalar(state, error, ptd.string());
		if (error.val) {
			return key;
		}
		eat_ws(state);
		if (match_s(state, ',')) {
			let inner_type;
			if (ov.is(type, 'ptd_var')) {
				if (hash.has_key(ov.as(type, 'ptd_var'), key)) {
					let match__ov_as_type_ptd_var_key = (ov.as(type, 'ptd_var'))[key];
					if (ov.is(match__ov_as_type_ptd_var_key, 'with_param')) {
						let param_type = ov.as(match__ov_as_type_ptd_var_key, 'with_param');
						inner_type = param_type;
					} else if (ov.is(match__ov_as_type_ptd_var_key, 'no_param')) {
						error.val = true;
						return 'unexpected variant value';
					}
				} else {
					error.val = true;
					return 'unexpected variant label ' + key;
				}
			} else if (ov.is(type, 'ptd_im')) {
				inner_type = ov.mk('ptd_im');
			} else {
				error.val = true;
				return 'expected ' + ssave(type) + ', got ' + ssave(ov.mk('ptd_hash'));
			}
			let val = parse(state, error, inner_type);
			if (error.val) {
				return val;
			}
			eat_ws(state);
			if (!match_s(state, ')')) {
				error.val = true;
				return 'pos ' + state.pos + ': expected )';
			}
			return ov.mk(key, val);
		}
		eat_ws(state);
		if (!match_s(state, ')')) {
			error.val = true;
			return 'pos ' + state.pos + ': expected )';
		}
		eat_ws(state);
		return ov.mk(key);
	} else {
		return parse_scalar(state, error, type);
	}
}

function sload(str_im) {
	let ensure_result = try_sload(str_im);
	if (ov.is(ensure_result, 'err')) throw new Error();
	let result = ov.as(ensure_result, 'ok');

	return result;
}

function sload_with_type(type, str_im) {
	let ensure_result = try_sload_with_type(type, str_im);
	if (ov.is(ensure_result, 'err')) throw new Error();
	let result = ov.as(ensure_result, 'ok');

	return result;
}

function sload_with_type_only_dynamic(type, str_im) {
	let ensure_result = try_sload_with_type(type, str_im);
	if (ov.is(ensure_result, 'err')) throw new Error();
	let result = ov.as(ensure_result, 'ok');

	return result;
}

function try_sload(str_im) {
	return try_sload_with_type(ptd.ptd_im(), str_im);
}

function try_sload_with_type(type, str_im) {
	let str = ptd.ensure(ptd.string(), str_im);
	let state = { str: str, pos: 0, len: string.length(str) };
	let error = { val: false};
	eat_ws(state);
	let val = parse(state, error, type);
	eat_ws(state);
	if (!error.val && state.pos != state.len) {
		error.val = true;
		val = 'pos ' + state.pos + ': expected eof';
	}
	if (error.val) {
		val = ptd.ensure(ptd.string(), val);
		return ov.mk('err', val);
	} else {
		return ov.mk('ok', val);
	}
}

function sp(state, str) {
	state.str += str;
}

function sprintstr(state, str) {
	str += '';
	str = string.replace(str, '\\', '\\\\');
	str = string.replace(str, '\"', '\\\"');
	sp(state, '"' + str + '"');
}

function is_simple_string(str) {
	let len = string.length(str);
	if (len == 0) {
		return false;
	}
	if (!(string.is_letter(string.substr(str, 0, 1)) || string.substr(str, 0, 1) === '_')) {
		return false;
	}
	for (let i = 0; i < len; i++) {
		let c = string.substr(str, i, 1);
		if (!(string.is_letter(c) || string.is_digit(c) || c === '_')) {
			return false;
		}
	}
	return true;
}

function sprint_hash_key(state, str) {
	if (is_simple_string(str)) {
		sp(state, str);
	} else {
		sprintstr(state, str);
	}
}

function get_ind(ind) {
	return string.char_times(string.tab(), ind);
}

function sprint_hash(state, obj, indent, is_debug) {
	sp(state, '{' + string.lf());
	let keys = hash.keys(obj);
	array.sort(keys);
	for (const key of keys) {
		let val = hash.get_value(obj, key);
		sp(state, get_ind(indent + 1));
		sprint_hash_key(state, key);
		sp(state, ' => ');
		sprint(state, val, indent + 1, is_debug);
		sp(state, ',' + string.lf());
	}
	sp(state, get_ind(indent) + '}');
}

function handle_debug(state, obj) {
	if ((hash.is_hash(obj) || array.is_array(obj)) && hash.has_key(state.objects, obj)) {
		sp(state, obj);
		return true;
	} else {
		hash.set_value(state.objects, obj, true);
		return false;
	}
}

function sprint(state, obj, indent, is_debug) {
	if (is_debug && handle_debug(state, obj)) {
		return;
	}
	if (Number.isInteger(obj) || string.is_string(obj)) {
		sprintstr(state, obj);
	} else if (array.is_array(obj)) {
		sp(state, '[' + string.lf());
		for (const el of obj) {
			sp(state, get_ind(indent + 1));
			sprint(state, el, indent + 1, is_debug);
			sp(state, ',' + string.lf());
		}
		sp(state, get_ind(indent) + ']');
	} else if (ov.is_variant(obj)) {
		sp(state, 'ov::mk(');
		sprintstr(state, ov.get_element(obj));
		if (ov.has_value(obj)) {
			sp(state, ', ');
			sprint(state, ov.get_value(obj), indent, is_debug);
		}
		sp(state, ')');
	} else if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
		sprint_hash(state, obj, indent, is_debug);
	} else {
		throw new Error();
	}
}

// function print_net_formatstr(state, str) {
// 	str += '';
// 	str = string.replace(str, '\\', '\\\\');
// 	str = string.replace(str, string.lf(), '\n');
// 	str = string.replace(str, string.r(), '\r');
// 	str = string.replace(str, '"', '\"');
// 	str = string_utils.escape2hex31(str);
// 	sp(state, '"' + str + '"');
// }

// function print_net_format(state, obj) {
// 	if (nl.is_int(obj) || nl.is_string(obj)) {
// 		print_net_formatstr(state, obj);
// 	} else if (nl.is_array(obj)) {
// 		sp(state, '[');
// 		for (const el of obj) {
// 			print_net_format(state, el);
// 			sp(state, ',');
// 		}
// 		sp(state, ']');
// 	} else if (nl.is_hash(obj)) {
// 		sp(state, '{');
// 		for (const key of hash.keys(obj)) {
// 			let val = hash.get_value(obj, key);
// 			if (is_simple_string(key + '')) {
// 				sp(state, key);
// 			} else {
// 				print_net_formatstr(state, key);
// 			}
// 			sp(state, '=>');
// 			print_net_format(state, val);
// 			sp(state, ',');
// 		}
// 		sp(state, '}');
// 	} else if (nl.is_variant(obj)) {
// 		sp(state, 'ov::mk(');
// 		print_net_formatstr(state, ov.get_element(obj));
// 		if (ov.has_value(obj)) {
// 			sp(state, ',');
// 			print_net_format(state, ov.get_value(obj));
// 		}
// 		sp(state, ')');
// 	} else {
// 		throw new Error({ obj });
// 	}
// }



module.exports = {
	ssave,
	debug,
	// ssave_net_format,
	sload,
	sload_with_type,
	sload_with_type_only_dynamic,
	try_sload,
	try_sload_with_type
}