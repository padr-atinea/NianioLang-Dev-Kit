
module.exports = {
	index2(s, val) { return s.indexOf(val); },
	length(s) { return s.length; }, 
	lf() { return '\n'; },
	f() { return this.chr(12); },
	to_array(str) { return str.split() },
	char_times(str, times) { return str.repeat(times) },
	tab() { return '\t'; },
	r() { return '\r'; },
	substr(s, offset, length) { return s.slice(offset, offset + length); }, 
	substr2(s, offset) { return s.slice(0, -offset); },
	split(val, s) { return s.split(val); },
	is_string(x) { return typeof x === 'string' || x instanceof String },
	ord(x) { return x.charCodeAt(0) },
	chr(acii) { return String.fromCharCode(acii) },
	is_digit(char) { 
		const code = this.ord(char);
		return code >= 48 && code <= 57;
	},
	is_hex_digit(char) {
		const code = this.ord(char);
		return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
	},
	is_letter(char) {
		const code = this.ord(char);
		return (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
	},
	replace(str, from, to) { return str.replaceAll(from, to) },
	replace_arr(str, search_arr, replace_arr) {
		for (let i = 0; i < len(search_arr); i++) {
			str = this.replace(str, search_arr[i], replace_arr[i]);
		}
		return str;
	}, 
}