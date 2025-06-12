const ov = require('../base/ov');

function get_tab_size() {
	return 4;
}

function get_line_width() {
	return 120;
}

function get_sep() {
	return { len: 1, el: ov.mk('sep') };
}

function is_to_long(len) {
	return len > get_line_width();
}

function state_print(state, str) {
	state.out += str;
}

function pind(ind) {
	var r = '';
	for (let i = 0; i < ind; i++) r += '\t';
	return r;
}

function count_len(arr) {
	var ret = 0;
	for (const el of arr) {
		ret += el.len;
	}
	return ret;
}

function build_pretty_a(arr) {
	return { len: count_len(arr), el: ov.mk('arr', { arr: arr, type: ov.mk('array') }) };
}

function build_pretty_l(arr) {
	return { len: count_len(arr), el: ov.mk('arr', { arr: arr, type: ov.mk('list') }) };
}

function build_pretty_op_l(arr) {
	return { len: count_len(arr), el: ov.mk('arr', { arr: arr, type: ov.mk('op_list') }) };
}

function build_pretty_bind(a, b) {
	return { len: a.len + b.len, el: ov.mk('bind', { first: a, second: b }) };
}

function build_pretty_arr_decl(arr, start, end) {
	return {
		len: count_len(arr) + start.length + end.length,
		el: ov.mk('arr_decl', { arr: arr, start: start, end: end })
	};
}

function build_sim(str) {
	return { len: str.length, el: ov.mk('sim', str) };
}

function build_str_arr(str_arr, last) {
	if (ov.is(last, 'end')) {
		if (str_arr.length == 1) return build_sim(str_arr[0]);
	} else if (ov.is(last, 'new_line')) {
	}
	return { len: 2 * get_line_width(), el: ov.mk('str_arr', { arr: str_arr, last: last }) };
}

function print_sim_arr(state, arr) {
	for (const el of arr) {
		print_sim_rec(state, el);
	}
}

function print_str_arr(state, elem, pref, ind) {
	var ret_pref = pref;
	var str_arr = elem.arr;
	if (is_to_long(pref + str_arr[0].length)) {
		state_print(state, '\n');
		state_print(state, pind(ind));
		ret_pref = get_tab_size() * ind;
	}
	var i = 0;
	for (const str of str_arr) {
		state_print(state, str);
		ret_pref += str.length;
		if (i != str_arr.length - 1) {
			state_print(state, '\n' + pind(ind));
			ret_pref = get_tab_size() * ind;
		}
		++i;
	}
	if (ov.is(elem.last, 'new_line')) {
		state_print(state, '\n' + pind(ind));
		ret_pref = get_tab_size() * ind;
	} else if (ov.is(elem.last, 'end')) {
	}
	return ret_pref;
}

function print_sim_rec(state, wise_s) {
	if (ov.is(wise_s.el, 'sim')) {
		const sim_el = ov.as(wise_s.el, 'sim');
		state_print(state, sim_el);
	} else if (ov.is(wise_s.el, 'arr')) {
		const arr_el = ov.as(wise_s.el, 'arr');
		print_sim_arr(state, arr_el.arr);
	} else if (ov.is(wise_s.el, 'sep')) {
		state_print(state, ' ');
	} else if (ov.is(wise_s.el, 'arr_decl')) {
		const decl_el = ov.as(wise_s.el, 'arr_decl');
		state_print(state, decl_el.start);
		print_sim_arr(state, decl_el.arr);
		state_print(state, decl_el.end);
	} else if (ov.is(wise_s.el, 'bind')) {
		const bind = ov.as(wise_s.el, 'bind');
		print_sim_rec(state, bind.first);
		print_sim_rec(state, bind.second);
	} else if (ov.is(wise_s.el, 'str_arr')) {
		const str_arr = ov.as(wise_s.el, 'str_arr');
		die;
	}
}

function print_t(state, wise_s, ind) {
	print_t_rec(state, wise_s, ind * get_tab_size(), ind);
}

function flush_list(state, list, pref, len, ind, first) {
	if (!is_to_long(len)) {
		for (const e of list) {
			print_sim_rec(state, e);
		}
		return len;
	} else {
		if (!(ov.is(list[list.length - 1].el, 'str_arr'))) {
			if ((ind + 1) * get_tab_size() < pref && !first) {
				state_print(state, '\n' + pind(ind + 1));
				pref = (ind + 1) * get_tab_size();
			}
		}
		for (const e of list) {
			pref = print_t_rec(state, e, pref, ind + 1);
		}
		return pref;
	}
}

function print_arr_in_lines(state, arr, ind, pref) {
	for (const el of arr) {
		if (ov.is(el.el, 'sep')) {
			state_print(state, '\n' + pind(ind));
			pref = ind * get_tab_size();
			continue;
		}
		pref = print_t_rec(state, el, pref, ind);
	}
	return pref;
}

function process_list(state, arr, is_op_list, pref, ind) {
	var els = [];
	var els_len = 0;
	var first = true;
	for (let i = 0; i < arr.length; i++) {
		var elem = arr[i];
		if (ov.is(elem.el, 'sep')) {
			pref = flush_list(state, els, pref, els_len + pref, ind - (is_op_list ? 1 : 0), first || !is_op_list);
			first = false;
			state_print(state, ' ');
			++pref;
			els = [];
			els_len = 0;
		} else {
			els.push(elem);
			els_len += elem.len;
		}
	}
	if (els.length > 0) pref = flush_list(state, els, pref, els_len + pref, ind - (is_op_list ? 1 : 0), first || !is_op_list);
	return pref;
}

function print_t_rec(state, wise_s, pref, ind) {
	if (!is_to_long(wise_s.len + pref)) {
		print_sim_rec(state, wise_s);
		pref += wise_s.len;
		return pref;
	}
	if (ov.is(wise_s.el, 'sim')) {
		const sim_val = ov.as(wise_s.el, 'sim');
		if (sim_val === ',' || sim_val === ')') {
			state_print(state, sim_val);
			return pref + wise_s.len;
		}
		if (pref != ind * get_tab_size()) state_print(state, '\n' + pind(ind));
		print_sim_rec(state, wise_s);
		return wise_s.len + ind * get_tab_size();
	} else if (ov.is(wise_s.el, 'arr_decl')) {
		const el = ov.as(wise_s.el, 'arr_decl');
		state_print(state, el.start + '\n' + pind(ind + 1));
		pref = (ind + 1) * get_tab_size();
		pref = print_arr_in_lines(state, el.arr, ind + 1, pref);
		if (el.arr.length > 0) state_print(state, '\n' + pind(ind));
		state_print(state, el.end);
		return ind * get_tab_size() + el.end.length;
	} else if (ov.is(wise_s.el, 'arr')) {
		const el = ov.as(wise_s.el, 'arr');
		var arr = el.arr;
		if (ov.is(el.type, 'array')) {
			pref = print_arr_in_lines(state, arr, ind + 1, pref);
		} else if (ov.is(el.type, 'list')) {
			return process_list(state, arr, false, pref, ind);
		} else if (ov.is(el.type, 'op_list')) {
			return process_list(state, arr, true, pref, ind);
		}
	} else if (ov.is(wise_s.el, 'bind')) {
		const bind = ov.as(wise_s.el, 'bind');
		state_print(state, '\n' + pind(ind));
		pref = bind.first.len + ind * get_tab_size();
		print_sim_rec(state, bind.first);
		return print_t_rec(state, bind.second, pref, ind);
	} else if (ov.is(wise_s.el, 'sep')) {
		state_print(state, ' ');
		return pref + 1;
	} else if (ov.is(wise_s.el, 'str_arr')) {
		const str_arr = ov.as(wise_s.el, 'str_arr');
		return print_str_arr(state, str_arr, pref, ind);
	}
	return pref;
}

module.exports = {
	print_t,
	build_str_arr,
	build_sim,
	build_pretty_arr_decl,
	build_pretty_bind,
	build_pretty_op_l,
	build_pretty_l,
	build_pretty_a,
	get_sep,
	pind,
};