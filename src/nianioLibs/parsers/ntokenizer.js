const ov = require('../base/ov');
const nast = require('../base/nast');

const get_next_nth_char = (state, number) => state.text[state.pos + number] ?? '';
const get_char = (state) => get_next_nth_char(state, 0);
const get_next_char = (state) => get_next_nth_char(state, 1);

const is_letter = (char) => /^[a-zA-Z]$/.test(char);
const is_digit = (char) => /^[0-9]$/.test(char);
const is_hex_number = (char) => /^[0-9a-fA-F]$/.test(char);

const is_token = (state) => ov.is(state.type, 'delimiter') || ov.is(state.type, 'operator') || ov.is(state.type, 'keyword');

const keywords = {
	use: null,
	fora: null,
	forh: null,
	for: null,
	rep: null,
	loop: null,
	while: null,
	if: null,
	elsif: null,
	else: null,
	var: null,
	def: null,
	ref: null,
	match: null,
	case: null,
	unless: null,
	true: null,
	false: null,
	continue: null,
	break: null,
	return: null,
	try: null,
	ensure: null,
	die: null
};

function try_get_operator(state) {
	for (const oper of nast.char_oper) {
		if (state.len < 1 + state.pos + oper.length) continue;
		if (state.text.slice(state.pos, state.pos + oper.length) === oper) {
			if (is_letter(get_char(state)) && is_letter(get_next_nth_char(state, oper.length))) continue;
			state.type = ov.mk('operator');
			state.next_token = oper;
			state.pos += oper.length;
			return true;
		}
	}
	return false;
}
function eat_ws(state) {
	state.last_comment.push(...state.next_comment);
	state.next_comment = [];
	while (true) {
		if (state.pos == state.length) return;
		const char = get_char(state);
		if (char === '\t' || char === '\r' || char === ' ') {
			state.pos++;
		} else if (char === '\n') {
			state.pos++;
			state.ln_pos = state.pos;
			state.ln_nr++;
		} else if (char === '#') {
			let comment_line = '';
			comment_line += char;
			++state.pos;
			while (true) {
				if (state.pos == state.len) return;
				const c = get_char(state);
				state.pos++;
				if (c === '\n') break;
				comment_line += c;
			}
			state.ln_pos = state.pos;
			state.ln_nr++;
			state.next_comment.push(comment_line);
		} else {
			return;
		}
	}
}
function get_next_token(state) {
	state.place_ws = { line: state.ln_nr, position: state.pos - state.ln_pos + 1 };
	eat_ws(state);
	state.place = { line: state.ln_nr, position: state.pos - state.ln_pos + 1 };
	// if (ov.is(state.type, 'error')) return;
	if (state.pos == state.len) {
		state.type = ov.mk('end');
		state.next_token = '';
		return;
	}
	let char = get_char(state);
	if (char === '\'') {
		state.next_token = '';
		state.type = ov.mk('string');
		while (true) {
			state.pos += 1;
			char = get_char(state);
			if (char === '\'') {
				state.pos += 1;
				if (get_char(state) !== '\'') return;
			} else if (char === '\n') {
				state.type = ov.mk('multi_string');
				return;
			}
			state.next_token += char;
		}
	} else if (char + get_next_char(state) === '=>' || char + get_next_char(state) === '::') {
		state.type = ov.mk('delimiter');
		state.next_token = char + get_next_char(state);
		state.pos += 2;
	} else if (is_letter(char)) {
		state.next_token = char;
		state.pos++;
		char = get_char(state);
		while (char !== '' && (is_letter(char) || is_digit(char) || char === '_')) {
			state.next_token += char;
			state.pos++;
			char = get_char(state);
		}
		if (Object.keys(nast.lett_oper).includes(state.next_token)) {
			state.type = ov.mk('operator');
		} else {
			state.type = Object.keys(keywords).includes(state.next_token) ? ov.mk('keyword') : ov.mk('word');
		}
	} else if (try_get_operator(state)) {
	} else if (';:,[]{}()'.includes(char)) {
		state.type = ov.mk('delimiter');
		state.next_token = char;
		state.pos++;
	} else if (is_digit(char) || ((char === '-' || char === '+') && is_digit(get_next_char(state)))) {
		state.next_token = char;
		state.type = ov.mk('number');
		state.pos++;
		if (char === '-' || char === '+') {
			char = get_char(state);
			state.next_token += char;
			state.pos++;
		}
		if (char === '0' && get_char(state) === 'x' && is_hex_number(get_next_char(state))) {
			state.next_token += get_char(state);
			state.pos++;
			char = get_char(state);
			while (is_hex_number(char)) {
				state.next_token += char;
				state.pos++;
				char = get_char(state);
			}
		} else {
			let dot = 0;
			while (true) {
				char = get_char(state);
				if (dot == 1) dot++;
				if (char === '.' && is_digit(get_next_char(state)) && dot == 0) dot = 1;
				if (char === '' || !(is_digit(char) || dot == 1)) break;
				state.next_token += char;
				state.pos++;
			}
		}
	} else {
		state.type = ov.mk('error');
		state.next_token = char;
		state.pos++;
	}
}


function get_next_comment(state) {
	return state.next_comment;
}
function get_line(state) {
	return state.ln_nr;
}
function get_column(state) {
	return 1 + state.pos - state.ln_pos - state.next_token.length;
}
function get_place(state) {
	return state.place;
}
function get_place_ws(state) {
	return state.place_ws;
}
function get_token(state) {
	return JSON.parse(JSON.stringify(state.next_token));
}
function info(state) {
	return `token: '${get_token(state)}'
line:  ${get_line(state)}
pos:   ${this.get_column(state)}
type:  ${ov.get_element(state.type)}`;
}
function eat_token(state, token) {
	if (token === state.next_token && is_token(state)) {
		get_next_token(state);
		return true;
	}
	return false;
}
function is_type(state, type) {
	if (ov.has_value(state.type) || ov.has_value(type)) throw new Error('die');
	return ov.get_element(state.type) === ov.get_element(type);
}
function next_is(state, token) {
	return token === state.next_token && is_token(state);
}
function eat_type(state, type) {
	if (!this.is_type(state, type)) throw new Error('die');
	const ret = state.next_token;
	get_next_token(state);
	return ret;
}
function is_text(state) {
	if (this.is_type(state, ov.mk('word'))) return true;
	if (this.is_type(state, ov.mk('keyword'))) return true;
	if (this.is_type(state, ov.mk('operator')) && is_letter(state.next_token[0])) return true;
	return false;
}
function eat_text(state) {
	if (this.is_type(state, ov.mk('word'))) return this.eat_type(state, ov.mk('word'));
	if (this.is_type(state, ov.mk('keyword'))) return this.eat_type(state, ov.mk('keyword'));
	if (this.is_type(state, ov.mk('operator')) && is_letter(state.next_token[0])) return this.eat_type(state, ov.mk('operator'));
	throw new Error('die');
}
function pop_last_comment(state) {
	const last_comment = state.last_comment;
	state.last_comment = [];
	return last_comment;
}
function init(state) {
	get_next_token(state);
	state.last_comment = state.next_comment;
	state.next_comment = [];
}

module.exports = {
	get_next_token,
	get_next_comment,
	get_line,
	get_column,
	get_place,
	get_place_ws,
	get_token,
	info,
	eat_token,
	is_type,
	next_is,
	eat_type,
	is_text,
	eat_text,
	pop_last_comment,
	init,
}