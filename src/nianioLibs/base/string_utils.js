const ov = require('./ov');
const string = require('./string');
const ptd = require('./ptd');
const array = require('./array');
// const float = require('./float');
// const c_rt_lib = require('./c_rt_lib');
// const c_std_lib = require('./c_std_lib');

function is_int(char) {
	return (string.ord(char) > 47 && string.ord(char) < 58);
}

function is_whitespace(char) {
	return (char === ' ' || char === string.lf() || char === string.tab() || char === string.r() || char === string.f());
}

function is_alpha(char) {
	let int = string.ord(char);
	return ((int > 64 && int < 91) || (int > 96 && int < 123));
}

function get_integer(str) {
	if (str === '' || str === '-') {
		return ov.mk('err', '');
	}
	let split_res = string.split('', str);
	let ret = 0;
	let sign = 1;
	if (split_res[0] === '-') {
		split_res = array.subarray(split_res, 1, array.len(split_res) - 1);
		sign = -1;
	}
	for (const char of split_res) {
		if (!(is_int(char))) {
			return ov.mk('err', '');
		}
		ret *= 10;
		ret += string.ord(char) - string.ord('0');
	}
	return ov.mk('ok', sign * ret);
}

function is_integer(obj) {
	obj = obj + '';
	if (!(is_integer_possibly_leading_zeros(obj))) {
		return false;
	}
	if (obj === '0') {
		return true;
	}
	let i = 0;
	if ((string.substr(obj, i, 1) === '-')) {
		++i;
	}
	if (string.substr(obj, i, 1) === '0') {
		return false;
	}
	return true;
}

function is_integer_possibly_leading_zeros(obj) {
	let _string = obj + '';
	let len = string.length(_string);
	let i = 0;
	if ((string.substr(_string, i, 1) === '-')) {
		++i;
	}
	if (i == len) {
		return false;
	}
	for (; i < len; ++i) {
		if (!(string.is_digit(string.substr(_string, i, 1)))) {
			return false;
		}
	}
	return true;
}

function is_float(obj) {
	let _string = obj + '';
	let len = string.length(_string);
	if (len < 3) {
		return false;
	}
	let i = 0;
	if ((string.substr(_string, i, 1) === '-')) {
		++i;
	}
	for (i = i; i < len; ++i) {
		if (!(string.is_digit(string.substr(_string, i, 1)))) {
			break;
		}
	}
	if (i < 1 || i + 2 > len) {
		return false;
	}
	if (string.substr(_string, i, 1) !== '.') {
		return false;
	}
	for (++i; i < len; ++i) {
		if (!(string.is_digit(string.substr(_string, i, 1)))) {
			return false;
		}
	}
	return true;
}

function is_number(string) {
	let str = string + '';
	return is_integer(str) || is_float(str);
}

function get_number(str) {
	if (str === '' || str === '-') {
		return ov.mk('err');
	}
	let split_res = string.split('', str);
	let ret = '';
	if (split_res[0] === '-') {
		split_res = array.subarray(split_res, 1, array.len(split_res) - 1);
		if (!(is_int(split_res[0]))) {
			return ov.mk('err');
		}
		ret = '-';
	}
	let comma = false;
	for (const char of split_res) {
		if (!is_int(char)) {
			if (char === '.' && !comma) {
				comma = true;
			} else {
				return ov.mk('err');
			}
		}
		ret += char;
	}
	if (ret === '.') {
		return ov.mk('err');
	}
	return ov.mk('ok', ret);
}

function eat_ws(str, pos) {
	while ((pos < array.len(str) && is_whitespace(str[pos]))) {
		++pos;
	}
	return pos == array.len(str);
}

function get_number(str, pos) {
	let num = '';
	if (str[pos] === '-') {
		++pos;
		num = '-';
	}
	let comma = false;
	while (pos < array.len(str)) {
		let char = str[pos];
		if (!is_int(char)) {
			if ((char !== '.' || comma)) {
				break;
			}
			comma = true;
		}
		num += char;
		++pos;
	}
	if ((num === '' || num === '-')) {
		return ov.mk('err', '');
	}
	return ov.mk('ok', num);
}

function cal_expr(str, pos, prio) {
	if (eat_ws(str, pos)) {
		return ov.mk('err', '');
	}
	let ret;
	if (str[pos] === '(') {
		++pos;
		let try_ret = cal_expr(str, pos, 0);
		if (ov.is(try_ret, 'err')) return try_ret;
		try_ret = ov.as(try_ret, 'ok');
		if (eat_ws(str, pos)) {
			return ov.mk('err', '');
		}
		if (str[pos] !== ')') {
			return ov.mk('err', '');
		}
		++pos;
	} else {
		let try_ret_0 = get_number(str, pos);
		if (ov.is(try_ret_0, 'err')) return try_ret_0;
		try_ret_0 = ov.as(try_ret_0, 'ok');
	}
	while (true) {
		if (eat_ws(str, pos)) {
			return ov.mk('ok', ret);
		}
		let char = str[pos];
		if (char === '*') {
			if (prio >= 5) {
				return ov.mk('ok', ret);
			}
			++pos;
			let try_tmp = cal_expr(str, pos, 5);
			if (ov.is(try_tmp, 'err')) return try_tmp;
			let tmp = ov.as(try_tmp, 'ok');

			ret = parseInt(ret) * tmp;
		} else if (char === '/') {
			if (prio >= 5) {
				return ov.mk('ok', ret);
			}
			++pos;
			let try_tmp = cal_expr(str, pos, 5);
			if (ov.is(try_tmp, 'err')) return try_tmp;
			let tmp = ov.as(try_tmp, 'ok');

			ret = parseInt(ret) / tmp;
		} else if (char === '%') {
			if (prio >= 5) {
				return ov.mk('ok', ret);
			}
			++pos;
			let try_tmp = cal_expr(str, pos, 5);
			if (ov.is(try_tmp, 'err')) return try_tmp;
			let tmp = ov.as(try_tmp, 'ok');

			ret = parseInt(ret) % tmp;
		} else if (char === '+') {
			if (prio >= 2) {
				return ov.mk('ok', ret);
			}
			++pos;
			let try_tmp = cal_expr(str, pos, 2);
			if (ov.is(try_tmp, 'err')) return try_tmp;
			let tmp = ov.as(try_tmp, 'ok');

			ret = parseInt(ret) + tmp;
		} else if (char === '-') {
			if (prio >= 2) {
				return ov.mk('ok', ret);
			}
			++pos;
			let try_tmp = cal_expr(str, pos, 2);
			if (ov.is(try_tmp, 'err')) return try_tmp;
			let tmp = ov.as(try_tmp, 'ok');

			ret = parseInt(ret) - tmp;
		} else if (char === ')') {
			if (prio < 0) {
				return ov.mk('err', '');
			}
			return ov.mk('ok', ret);
		} else {
			return ov.mk('err', '');
		}
	}
	throw new Error();
}

function eval_number(string) {
	if (string === '') {
		return string;
	}
	let split_res = string.split('', string);
	if (split_res[0] !== '=') {
		return string;
	}
	split_res = array.subarray(split_res, 1, array.len(split_res) - 1);
	let ret = '';
	for (const char of split_res) {
		if (
			!(is_int(char) || char === '-' || char === '.' || char === '+' || char === '/' || char === '('
				|| char === ')' || char === '*')) {
			return string;
		}
		ret += char;
	}
	let str = string.split('', ret);
	let pos = 0;
	let match_cal_expr_str_pos_1 = cal_expr(str, pos, -1);
	if (ov.is(match_cal_expr_str_pos_1, 'err')) {
		let err = ov.as(match_cal_expr_str_pos_1, 'err');
		return '';
	} else if (ov.is(match_cal_expr_str_pos_1, 'ok')) {
		let val = ov.as(match_cal_expr_str_pos_1, 'ok');
		return val;
	}
}

function get_date(string, char) {
	let split_result = string.split(char, string);
	if (!(array.len(split_result) == 3 && is_integer_possibly_leading_zeros(split_result[0]) && is_integer_possibly_leading_zeros(split_result[1]) && is_integer_possibly_leading_zeros(split_result[2]))) {
		return ov.mk('err', '');
	}
	let first = ptd.string_to_int(split_result[0]);
	let second = ptd.string_to_int(split_result[1]);
	let third = ptd.string_to_int(split_result[2]);
	return ov.mk('ok', { first: first, second: second, third: third });
}

function change(str, from, to) {
	let ret = '';
	for (const char of string.split('', str)) {
		ret += char === from ? to : char;
	}
	return ret;
}

function erase_tail_whitespace(str) {
	if (str === '') {
		return '';
	}
	let str_end_index = string.length(str) - 1;
	while (str_end_index >= 0 && is_whitespace(string.substr(str, str_end_index, 1))) {
		--str_end_index;
	}
	return string.substr(str, 0, str_end_index + 1);
}

function erase_tail_zeroes(str) {
	if (str === '') {
		return str;
	}
	let chars = string.to_array(str);
	let str_end_index = array.len(chars) - 1;
	while (str_end_index >= 0 && chars[str_end_index] === '0') {
		--str_end_index;
	}
	return string.substr(str, 0, str_end_index + 1);
}

function erase_leading_zeroes(str) {
	if (str === '') {
		return str;
	}
	let chars = string.to_array(str);
	let str_start_index = 0;
	while (str_start_index < array.len(chars) && chars[str_start_index] === '0') {
		++str_start_index;
	}
	return str_start_index != array.len(chars) ? string.substr2(str, str_start_index) : '0';
}

function char2hex(char) {
	let tab = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
	return tab[char / 16] + tab[char % 16];
}

function hex2char(a, b) {
	let ret = 0;
	if (a >= 48 && a <= 57) {
		ret += a;
		ret -= 48;
	} else if (a >= 65 && a <= 70) {
		ret += a;
		ret -= 55;
	} else if (a >= 97 && a <= 102) {
		ret += a;
		ret -= 87;
	} else {
		throw new Error();
	}
	ret *= 16;
	if (b >= 48 && b <= 57) {
		ret += b;
		ret -= 48;
	} else if (b >= 65 && b <= 70) {
		ret += b;
		ret -= 55;
	} else if (b >= 97 && b <= 102) {
		ret += b;
		ret -= 87;
	} else {
		throw new Error();
	}
	return string.chr(ret);
}

// function escape2hex31(str) {
// 	return ptd.ensure(ptd.string(), c_std_lib.string_escape2hex31(str));
// }

function float2str(float, prec) {
	let pot = 1;
	for (let i = 0; i < prec; i++) {
		pot *= 10;
	}
	float = float * pot;
	float = Math.round(float);
	let sign = '';
	if (string.substr(float, 0, 1) === '-') {
		sign = '-';
		float = string.substr2(float, 1);
	}
	let str = int2str_leading_digits(float, prec + 1);
	let len = string.length(str);
	if (prec == 0) {
		return sign + str;
	}
	return sign + string.substr(str, 0, len - prec) + '.' + string.substr(str, len - prec, prec);
}

function int2str_leading_digits(int, digits) {
	let str = '000000000000000000000000' + int;
	return string.substr2(str, string.length(str) - max(digits, string.length(int)));
}

function max(a, b) {
	return a > b ? a : b;
}

function int2str(int, len) {
	let str = '000000000000000000000000' + int;
	return string.substr2(str, string.length(str) - len);
}

function starts_with(el, prefix) {
	return string.length(el) >= string.length(prefix) && string.substr(el, 0, string.length(prefix)) === prefix;
}

function normalize_newlines(str) {
	let res = string.replace_arr(str, [string.r() + string.lf(), string.r(), string.lf()], [
		string.lf(),
		string.lf(),
		string.r() + string.lf()
	]);
	return ptd.ensure(ptd.string(), res);
}

// function float2str_fixed(num) {
// 	return ptd.ensure(ptd.string(), c_rt_lib.float_fixed_str(num));
// }



module.exports = {
	is_int,
	is_whitespace,
	is_alpha,
	get_integer,
	is_integer,
	is_integer_possibly_leading_zeros,
	is_float,
	is_number,
	get_number,
	eval_number,
	get_date,
	change,
	erase_tail_whitespace,
	erase_tail_zeroes,
	erase_leading_zeroes,
	char2hex,
	hex2char,
	// escape2hex31,
	float2str,
	int2str_leading_digits,
	int2str,
	starts_with,
	normalize_newlines,
	// float2str_fixed
}