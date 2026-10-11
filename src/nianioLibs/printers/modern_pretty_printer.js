const ov = require('../base/ov');
const wprinter = require('./wprinter');
const pretty_printer = require('./pretty_printer');

// Modern formatting (nianiolang.prettyPrint.modernPrint).
//
// The structure of the printed code (built by pretty_printer) and the decisions where lines are broken are the same
// as in the classic layout (wprinter), the differences are:
//  - indentation: the content of a construct broken into lines is indented one level more than the line on which
//    the construct starts, the closing bracket is on the indentation of that line - the classic layout adds a level
//    for every nesting level of lists / brackets, even when the level did not break the line,
//  - arrays and hashes broken into lines get a comma after the last element.
//
// state.line_ind - indentation of the line being printed.

const TAB = wprinter.get_tab_size();

const is_to_long = (len) => len > wprinter.get_line_width();

const is_comma = (wise_s) => ov.is(wise_s.el, 'sim') && ov.as(wise_s.el, 'sim') === ',';

// a separator (space) between elements; when the line is broken right after it, it is removed
function print_sep(state) {
	state.out += ' ';
	state.sep_end = state.out.length;
}

function new_line(state, ind) {
	if (state.sep_end === state.out.length) state.out = state.out.slice(0, -1);
	state.out += '\n' + wprinter.pind(ind);
	state.line_ind = ind;
	return ind * TAB;
}

// Recomputes the lengths: pretty_printer builds numbers as `sim` with a number value, which has no length - the length
// of the whole statement becomes NaN, so it is never broken into lines (and a multi-line string in it is not handled).
function fix_lengths(wise_s) {
	const el = wise_s.el;
	if (ov.is(el, 'sim')) {
		wise_s.len = String(ov.as(el, 'sim')).length;
	} else if (ov.is(el, 'arr')) {
		wise_s.len = ov.as(el, 'arr').arr.reduce((sum, e) => sum + fix_lengths(e), 0);
	} else if (ov.is(el, 'arr_decl')) {
		const decl = ov.as(el, 'arr_decl');
		wise_s.len = decl.arr.reduce((sum, e) => sum + fix_lengths(e), 0) + decl.start.length + decl.end.length;
	} else if (ov.is(el, 'bind')) {
		const bind = ov.as(el, 'bind');
		wise_s.len = fix_lengths(bind.first) + fix_lengths(bind.second);
	}
	return wise_s.len;
}

// ind: indentation used when the element itself has to be moved to a new line
function print_t(state, wise_s, ind, line_ind = ind) {
	fix_lengths(wise_s);
	state.line_ind = line_ind;
	print_t_rec(state, wise_s, ind * TAB, ind);
}

function print_t_rec(state, wise_s, pref, ind) {
	if (!is_to_long(wise_s.len + pref)) {
		wprinter.print_sim_rec(state, wise_s);
		return pref + wise_s.len;
	}
	if (ov.is(wise_s.el, 'sim')) {
		const sim_val = ov.as(wise_s.el, 'sim');
		if (sim_val === ',' || sim_val === ')') {
			state.out += sim_val;
			return pref + wise_s.len;
		}
		if (pref != ind * TAB) new_line(state, ind);
		wprinter.print_sim_rec(state, wise_s);
		return wise_s.len + ind * TAB;
	} else if (ov.is(wise_s.el, 'arr_decl')) {
		// array / hash (or a call with one): content on the next level of the line where it starts
		const el = ov.as(wise_s.el, 'arr_decl');
		const base = state.line_ind;
		state.out += el.start;
		pref = new_line(state, base + 1);
		pref = print_arr_in_lines(state, el.arr, base + 1, pref);
		if (el.arr.length > 0) {
			if (!is_comma(el.arr[el.arr.length - 1])) state.out += ',';
			new_line(state, base);
		}
		state.out += el.end;
		return base * TAB + el.end.length;
	} else if (ov.is(wise_s.el, 'arr')) {
		const el = ov.as(wise_s.el, 'arr');
		const child_ind = state.line_ind + 1;
		if (ov.is(el.type, 'array')) {
			return print_arr_in_lines(state, el.arr, child_ind, pref);
		} else if (ov.is(el.type, 'list')) {
			return process_list(state, el.arr, false, pref, child_ind);
		} else if (ov.is(el.type, 'op_list')) {
			return process_list(state, el.arr, true, pref, child_ind);
		}
	} else if (ov.is(wise_s.el, 'bind')) {
		const bind = ov.as(wise_s.el, 'bind');
		pref = new_line(state, ind) + bind.first.len;
		wprinter.print_sim_rec(state, bind.first);
		return print_t_rec(state, bind.second, pref, ind);
	} else if (ov.is(wise_s.el, 'sep')) {
		print_sep(state);
		return pref + 1;
	} else if (ov.is(wise_s.el, 'str_arr')) {
		return print_str_arr(state, ov.as(wise_s.el, 'str_arr'), pref, ind);
	}
	return pref;
}

function print_arr_in_lines(state, arr, ind, pref) {
	for (const el of arr) {
		if (ov.is(el.el, 'sep')) {
			pref = new_line(state, ind);
			continue;
		}
		pref = print_t_rec(state, el, pref, ind);
	}
	return pref;
}

// elements of a list are separated by 'sep'; a group of elements between separators is printed together
function process_list(state, arr, is_op_list, pref, child_ind) {
	let els = [];
	let els_len = 0;
	let first = true;
	for (const elem of arr) {
		if (ov.is(elem.el, 'sep')) {
			pref = flush_list(state, els, pref, els_len + pref, child_ind, first || !is_op_list);
			first = false;
			print_sep(state);
			++pref;
			els = [];
			els_len = 0;
		} else {
			els.push(elem);
			els_len += elem.len;
		}
	}
	if (els.length > 0) pref = flush_list(state, els, pref, els_len + pref, child_ind, first || !is_op_list);
	return pref;
}

function flush_list(state, list, pref, len, child_ind, first) {
	if (!is_to_long(len)) {
		for (const e of list) wprinter.print_sim_rec(state, e);
		return len;
	}
	if (!ov.is(list[list.length - 1].el, 'str_arr') && child_ind * TAB < pref && !first) pref = new_line(state, child_ind);
	for (const e of list) pref = print_t_rec(state, e, pref, child_ind);
	return pref;
}

function print_str_arr(state, elem, pref, ind) {
	let ret_pref = pref;
	const str_arr = elem.arr;
	if (is_to_long(pref + str_arr[0].length)) ret_pref = new_line(state, ind);
	for (let i = 0; i < str_arr.length; i++) {
		state.out += str_arr[i];
		ret_pref += str_arr[i].length;
		if (i != str_arr.length - 1) ret_pref = new_line(state, ind);
	}
	if (ov.is(elem.last, 'new_line')) ret_pref = new_line(state, ind);
	return ret_pref;
}

const layout = { print_t };

function print_module_to_str(mod, removeMod = false, printNewStamp = false) {
	return pretty_printer.print_module_to_str(mod, removeMod, printNewStamp, layout);
}

function print_function(fun_def, moduleName, removeMod = false) {
	return pretty_printer.print_function(fun_def, moduleName, removeMod, layout);
}

module.exports = {
	print_module_to_str,
	print_function,
	print_t,
};
