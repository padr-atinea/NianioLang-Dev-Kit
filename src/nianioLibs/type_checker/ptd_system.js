const ov = require('../base/ov');
const hash = require('../base/hash');
const tct = require('./tct');
const string = require('../base/string');
const array = require('../base/array');
const ptd_parser = require('../parsers/ptd_parser');

// const DC = (obj) => JSON.parse(JSON.stringify(obj));
const DC = (obj) => structuredClone(obj);

const ObjectAssignInPlace = (objA, objB) =>
	Object.keys(objA).forEach(key => delete objA[key]) ??
	Object.keys(objB).forEach(key => objA[key] = objB[key]);

const ArrayAssignInPlace = (objA, arrB) => { while (objA.pop()); objA.push(...arrB); };

function add_error(errors, msg) {
	array.push(errors.errors[errors.module], {
		message: msg,
		module: errors.module,
		type: ov.mk('error'),
		debug: errors.current_debug,
	});
}

function is_known(value_src) {
	return ov.is(value_src, 'known') || ov.is(value_src, 'knownhash');
}

function is_equal(a, b) {
	if (ov.get_element(a) !== ov.get_element(b)) {
		return false;
	}
	const match_a = DC(a);
	if (ov.is(match_a, 'tct_im')) {
	} else if (ov.is(match_a, 'tct_arr')) {
		const arr_type = ov.as(match_a, 'tct_arr');
		return is_equal(arr_type, ov.as(b, 'tct_arr'));
	} else if (ov.is(match_a, 'tct_own_arr')) {
		const arr_type = ov.as(match_a, 'tct_own_arr');
		return false;
	} else if (ov.is(match_a, 'tct_hash')) {
		const hash_type = ov.as(match_a, 'tct_hash');
		return is_equal(hash_type, ov.as(b, 'tct_hash'));
	} else if (ov.is(match_a, 'tct_own_hash')) {
		const hash_type = ov.as(match_a, 'tct_own_hash');
		return false;
	} else if (ov.is(match_a, 'tct_rec')) {
		const records = ov.as(match_a, 'tct_rec');
		if (hash.size(ov.as(b, 'tct_rec')) != hash.size(records)) {
			return false;
		}
		for (const [name, record] of Object.entries(records)) {
			if (!(hash.has_key(ov.as(b, 'tct_rec'), name))) {
				return false;
			}
			if (!(is_equal(record, hash.get_value(ov.as(b, 'tct_rec'), name)))) {
				return false;
			}
		}
	} else if (ov.is(match_a, 'tct_own_rec')) {
		const records = ov.as(match_a, 'tct_own_rec');
		return false;
	} else if (ov.is(match_a, 'tct_ref')) {
		const ref_name = ov.as(match_a, 'tct_ref');
		if (ref_name !== ov.as(b, 'tct_ref')) {
			return false;
		}
	} else if (ov.is(match_a, 'tct_int')) {
	} else if (ov.is(match_a, 'tct_string')) {
		return false;
	} else if (ov.is(match_a, 'tct_bool')) {
	} else if (ov.is(match_a, 'tct_var')) {
		const vars = ov.as(match_a, 'tct_var');
		if (hash.size(ov.as(b, 'tct_var')) != hash.size(vars)) {
			return false;
		}
		for (const [name, type] of Object.entries(vars)) {
			if (!(hash.has_key(ov.as(b, 'tct_var'), name))) {
				return false;
			}
			let to_type = hash.get_value(ov.as(b, 'tct_var'), name);
			if (ov.is(type, 'no_param') && ov.is(to_type, 'no_param')) {
				continue;
			}
			if (!(ov.is(type, 'with_param') && ov.is(to_type, 'with_param'))) {
				return false;
			}
			if (!(is_equal(ov.as(to_type, 'with_param'), ov.as(type, 'with_param')))) {
				return false;
			}
		}
	} else if (ov.is(match_a, 'tct_own_var')) {
		const vars = ov.as(match_a, 'tct_own_var');
		return false;
	} else if (ov.is(match_a, 'tct_empty')) {
	} else if (ov.is(match_a, 'tct_void')) {
	}
	return true;
}

function is_try_ensure_type(type, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	return is_accepted(type, tct.var_({ ok: tct.tct_im(), err: tct.tct_im() }), /*ref*/ ref_modules, /*ref*/ ref_errors);
}

function try_get_ensure_sub_types(type, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let ret_types = { ok: tct.tct_im(), err: tct.tct_im() };
	type = can_delete(type, /*ref*/ ref_modules, /*ref*/ ref_errors);
	if (is_try_ensure_type(type, /*ref*/ ref_modules, /*ref*/ ref_errors)) {
		if (ov.is(type.type, 'tct_im')) {
			return ret_types;
		}
		ret_types = { ok: tct.empty(), err: tct.empty() };
		if (!(ov.is(type.type, 'tct_var'))) {
			return ret_types;
		}
		let cases = ov.as(type.type, 'tct_var');
		if (hash.has_key(cases, 'ok')) {
			let param = hash.get_value(cases, 'ok');
			const match_param = param;
			if (ov.is(match_param, 'no_param')) {
			} else if (ov.is(match_param, 'with_param')) {
				const sub_type = ov.as(match_param, 'with_param');
				ret_types.ok = sub_type;
			}
		}
		if (hash.has_key(cases, 'err')) {
			let param = hash.get_value(cases, 'err');
			const match_param_0 = param;
			if (ov.is(match_param_0, 'no_param')) {
			} else if (ov.is(match_param_0, 'with_param')) {
				const sub_type = ov.as(match_param_0, 'with_param');
				ret_types.err = sub_type;
			}
		}
	} else {
		add_error(/*ref*/ ref_errors, 'in try|ensure expr; expr must be variant: ok|err');
	}
	return ret_types;
}

function is_condition_type(from, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	return is_accepted(from, tct.bool(), /*ref*/ ref_modules, /*ref*/ ref_errors);
}

function is_accepted(from, as_type, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let ret = is_accepted_info(from, as_type, /*ref*/ ref_modules, /*ref*/ ref_errors);
	return ov.is(ret, 'ok');
}

function is_accepted_info(from, as_type, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	from = can_delete(from, /*ref*/ ref_modules, /*ref*/ ref_errors);
	if (ov.is(from.type, 'tct_im')) {
		return ov.mk('ok');
	}
	if (ov.is(as_type, 'tct_im')) {
		return ov.mk('ok');
	}
	if (ov.is(as_type, 'tct_rec')) {
		if (hash.size(ov.as(as_type, 'tct_rec')) == 0 && ov.is(from.type, 'tct_rec')) {
			return ov.mk('ok');
		}
	} else if (ov.is(as_type, 'tct_own_rec')) {
		if (hash.size(ov.as(as_type, 'tct_own_rec')) == 0 && ov.is(from.type, 'tct_own_rec')) {
			return ov.mk('ok');
		}
	} else if (ov.is(as_type, 'tct_var')) {
		if (hash.size(ov.as(as_type, 'tct_var')) == 0 && ov.is(from.type, 'tct_var')) {
			return ov.mk('ok');
		}
	} else if (ov.is(as_type, 'tct_own_var')) {
		if (hash.size(ov.as(as_type, 'tct_own_var')) == 0 && ov.is(from.type, 'tct_own_var')) {
			return ov.mk('ok');
		}
	}
	let ref_inf = { level: 1, from: {}, to: {}, check: false, cast: false };
	return check_assignment_info(as_type, from.type, ref_inf, from.src, /*ref*/ ref_modules, /*ref*/ ref_errors);
}

function add_ref_name(/*ref*/ ref_from, /*ref*/ ref_hash, /*ref*/ ref_arr, level, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let type_name = ov.as(ref_from, 'tct_ref');
	if ((hash.has_key(ref_hash, type_name))) {
		/* TODO REF*/ ArrayAssignInPlace(ref_arr, hash.get_value(ref_hash, type_name));
	}
	array.push(/*ref*/ ref_arr, level);
	hash.set_value(/*ref*/ ref_hash, type_name, ref_arr);
	/* TODO REF*/ ObjectAssignInPlace(ref_from, get_ref_type(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors));
	return type_name;
}

function is_cycle_ref(/*ref*/ ref_a, /*ref*/ ref_b, /*ref*/ ref_ref_inf, is_cross, deleted, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	if (ov.is(ref_a, 'tct_ref') && ov.is(ref_b, 'tct_ref')) {
		if (ov.as(ref_a, 'tct_ref') === ov.as(ref_b, 'tct_ref')) {
			return true;
		}
		if (is_cross && ov.is(check_assignment_info(ref_a, ref_b, ref_ref_inf, ov.mk('speculation'), /*ref*/ ref_modules, /*ref*/ ref_errors), 'ok')) {
			return true;
		}
	}
	let arr_to = [];
	let arr_from = [];
	while (ov.is(ref_b, 'tct_ref')) {
		let type_name = add_ref_name(/*ref*/ ref_b, /*ref*/ ref_ref_inf.from, /*ref*/ arr_from, ref_ref_inf.level, /*ref*/ ref_modules, /*ref*/ ref_errors);
		if (ref_ref_inf.check && array.len(arr_from) == 1 && deleted) {
			add_delete(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		}
	}
	if (ref_ref_inf.cast) {
		if (ov.is(ref_b, 'tct_im')) {
			if (ref_ref_inf.check) {
				walk_on_type(ref_a, ov.mk('create'), ref_ref_inf.to, /*ref*/ ref_modules, /*ref*/ ref_errors);
			}
			return true;
		}
	}
	while (ov.is(ref_a, 'tct_ref')) {
		let type_name = add_ref_name(/*ref*/ ref_a, /*ref*/ ref_ref_inf.to, /*ref*/ arr_to, ref_ref_inf.level, /*ref*/ ref_modules, /*ref*/ ref_errors);
		if (ref_ref_inf.check && array.len(arr_to) == 1) {
			add_create(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		}
	}
	let j = 0;
	for (let i = 0; i < array.len(arr_to) - 1 && array.len(arr_from) > 0; ++i) {
		while (arr_from[j] < arr_to[i]) {
			++j;
		}
		if ((arr_from[j] == arr_to[i])) {
			return true;
		}
	}
	ref_ref_inf.level += 1;
	return false;
}

function cross_type(a, b, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types) {
	let ref_inf = { level: 1, from: {}, to: {}, check: false, cast: false };
	return cross_type_(a, b, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types);
}

function cross_type_(a, b, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types) {
	if ((ov.is(b, 'tct_im') || ov.is(a, 'tct_im'))) {
		return ov.mk('tct_im');
	}
	if (is_cycle_ref(/*ref*/ a, /*ref*/ b, /*ref*/ ref_inf, true, false, /*ref*/ ref_modules, /*ref*/ ref_errors)) {
		return a;
	}
	if (ref_inf.level == 300) {
		add_error(/*ref*/ ref_errors, 'cannnot assign these two types to one variable - types merge failed.');
		return ov.mk('tct_im');
	}
	if ((ov.is(b, 'tct_empty'))) {
		return a;
	}
	const match_a_0 = a;
	if (ov.is(match_a_0, 'tct_empty')) {
		return b;
	} else if (ov.is(match_a_0, 'tct_im')) {
		return ov.mk('tct_im');
	} else if (ov.is(match_a_0, 'tct_int')) {
		if (ov.is(b, 'tct_int')) {
			return ov.mk('tct_int');
		} else {
			return ov.mk('tct_im');
		}
	} else if (ov.is(match_a_0, 'tct_string')) {
		if (ov.is(b, 'tct_string')) {
			return ov.mk('tct_string');
		} else {
			return ov.mk('tct_im');
		}
	} else if (ov.is(match_a_0, 'tct_bool')) {
		if (ov.is(b, 'tct_bool')) {
			return ov.mk('tct_bool');
		} else if (ov.is(b, 'tct_var')) {
			if ((is_variant_bool(b))) {
				return ov.mk('tct_bool');
			}
		}
	} else if (ov.is(match_a_0, 'tct_ref')) {
		const ref_name = ov.as(match_a_0, 'tct_ref');
		throw new Error();
	} else if (ov.is(match_a_0, 'tct_void')) {
		throw new Error();
	} else if (ov.is(match_a_0, 'tct_arr')) {
		const arr = ov.as(match_a_0, 'tct_arr');
		if (ov.is(b, 'tct_arr')) {
			return tct.arr(cross_type_(arr, ov.as(b, 'tct_arr'), ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_own_arr')) {
		const arr = ov.as(match_a_0, 'tct_own_arr');
		if (ov.is(b, 'tct_own_arr')) {
			return tct.own_arr(cross_type_(arr, ov.as(b, 'tct_own_arr'), ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_var')) {
		const variants = ov.as(match_a_0, 'tct_var');
		let fin = DC(variants);
		if (ov.is(b, 'tct_var')) {
			let ret = ov.as(b, 'tct_var');
			for (const [field, type] of Object.entries(variants)) {
				if (hash.has_key(ret, field)) {
					let t2 = hash.get_value(ret, field);
					const match_t2 = DC(t2);
					if (ov.is(match_t2, 'with_param')) {
						const typ = ov.as(match_t2, 'with_param');
						const match_type_4 = type;
						if (ov.is(match_type_4, 'with_param')) {
							const typ2 = ov.as(match_type_4, 'with_param');
							hash.set_value(/*ref*/ fin, field, cross_type_(typ, typ2, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
						} else if (ov.is(match_type_4, 'no_param')) {
							return ov.mk('tct_im');
						}
					} else if (ov.is(match_t2, 'no_param')) {
						const match_type_5 = type;
						if (ov.is(match_type_5, 'with_param')) {
							const typ = ov.as(match_type_5, 'with_param');
							return ov.mk('tct_im');
						} else if (ov.is(match_type_5, 'no_param')) {
							hash.set_value(/*ref*/ fin, field, tct.none());
						}
					}
				} else {
					const match_type_6 = type;
					if (ov.is(match_type_6, 'with_param')) {
						const typ = ov.as(match_type_6, 'with_param');
						hash.set_value(/*ref*/ fin, field, typ);
					} else if (ov.is(match_type_6, 'no_param')) {
						hash.set_value(/*ref*/ fin, field, tct.none());
					}
				}
			}
			for (const [field, type] of Object.entries(ret)) {
				if ((hash.has_key(fin, field))) {
					continue;
				}
				const match_type_7 = type;
				if (ov.is(match_type_7, 'with_param')) {
					const typ = ov.as(match_type_7, 'with_param');
					hash.set_value(/*ref*/ fin, field, typ);
				} else if (ov.is(match_type_7, 'no_param')) {
					hash.set_value(/*ref*/ fin, field, tct.none());
				}
			}
			return tct.var_(fin);
		} else if (ov.is(b, 'tct_bool')) {
			if ((is_variant_bool(a))) {
				return ov.mk('tct_bool');
			}
		}
	} else if (ov.is(match_a_0, 'tct_own_var')) {
		const variants = ov.as(match_a_0, 'tct_own_var');
		let fin = DC(variants);
		let inner_type;
		if (ov.is(b, 'tct_own_var')) {
			inner_type = ov.as(b, 'tct_own_var');
		} else if (ov.is(b, 'tct_var')) {
			inner_type = ov.as(b, 'tct_var');
		} else {
			add_error(/*ref*/ ref_errors, 'incompatible own types');
			return ov.mk('tct_im');
		}
		let ret = DC(inner_type);
		for (const [field, type] of Object.entries(variants)) {
			if (hash.has_key(ret, field)) {
				let t2 = hash.get_value(ret, field);
				const match_t2_0 = t2;
				if (ov.is(match_t2_0, 'with_param')) {
					const typ = ov.as(match_t2_0, 'with_param');
					const match_type_8 = type;
					if (ov.is(match_type_8, 'with_param')) {
						const typ2 = ov.as(match_type_8, 'with_param');
						hash.set_value(/*ref*/ fin, field, cross_type_(typ, typ2, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
					} else if (ov.is(match_type_8, 'no_param')) {
						add_error(/*ref*/ ref_errors, 'incompatible own types');
						return ov.mk('tct_im');
					}
				} else if (ov.is(match_t2_0, 'no_param')) {
					const match_type_9 = type;
					if (ov.is(match_type_9, 'with_param')) {
						const typ = ov.as(match_type_9, 'with_param');
						add_error(/*ref*/ ref_errors, 'incompatible own types');
						return ov.mk('tct_im');
					} else if (ov.is(match_type_9, 'no_param')) {
						hash.set_value(/*ref*/ fin, field, tct.none());
					}
				}
			} else {
				const match_type_10 = type;
				if (ov.is(match_type_10, 'with_param')) {
					const typ = ov.as(match_type_10, 'with_param');
					hash.set_value(/*ref*/ fin, field, typ);
				} else if (ov.is(match_type_10, 'no_param')) {
					hash.set_value(/*ref*/ fin, field, tct.none());
				}
			}
		}
		for (const [field, type] of Object.entries(ret)) {
			if ((hash.has_key(fin, field))) {
				continue;
			}
			const match_type_11 = type;
			if (ov.is(match_type_11, 'with_param')) {
				const typ = ov.as(match_type_11, 'with_param');
				hash.set_value(/*ref*/ fin, field, typ);
			} else if (ov.is(match_type_11, 'no_param')) {
				hash.set_value(/*ref*/ fin, field, tct.none());
			}
		}
		if (ov.is(b, 'tct_var')) {
			return tct.var_(fin);
		} else {
			return tct.own_var(fin);
		}
	} else if (ov.is(match_a_0, 'tct_rec')) {
		const reca = ov.as(match_a_0, 'tct_rec');
		if (ov.is(b, 'tct_rec')) {
			let recb = ov.as(b, 'tct_rec');
			let err = false;
			for (const [field, type] of Object.entries(reca)) {
				if ((!hash.has_key(recb, field))) {
					err = true;
				}
			}
			for (const [field, type] of Object.entries(recb)) {
				if ((!hash.has_key(reca, field))) {
					err = true;
				}
			}
			if (err) {
				let reta = rec_to_hash(a, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types);
				let retb = rec_to_hash(b, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types);
				return tct.hash(cross_type_(reta, retb, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
			} else {
				let ret = {};
				for (const [field, type] of Object.entries(reca)) {
					hash.set_value(/*ref*/ ret, field, cross_type_(type, hash.get_value(recb, field), ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
				}
				return tct.rec(ret);
			}
		}
		if (ov.is(b, 'tct_hash')) {
			let sum = rec_to_hash(a, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types);
			return tct.hash(cross_type(ov.as(b, 'tct_hash'), sum, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_own_rec')) {
		const reca = ov.as(match_a_0, 'tct_own_rec');
		let recb;
		if (ov.is(b, 'tct_own_rec')) {
			recb = ov.as(b, 'tct_own_rec');
		} else if (ov.is(b, 'tct_rec')) {
			recb = ov.as(b, 'tct_rec');
		} else {
			add_error(/*ref*/ ref_errors, 'cannot merge non own::rec with own::rec');
			return tct.tct_im();
		}
		let err = false;
		for (const [field, type] of Object.entries(reca)) {
			if ((!hash.has_key(recb, field))) {
				err = true;
			}
		}
		for (const [field, type] of Object.entries(recb)) {
			if ((!hash.has_key(reca, field))) {
				err = true;
			}
		}
		if (err) {
			add_error(/*ref*/ ref_errors, 'cannot merge incompatible own::rec types');
		} else {
			let ret = {};
			for (const [field, type] of Object.entries(reca)) {
				hash.set_value(/*ref*/ ret, field, cross_type_(type, hash.get_value(recb, field), ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
			}
			return tct.own_rec(ret);
		}
	} else if (ov.is(match_a_0, 'tct_hash')) {
		const hash = ov.as(match_a_0, 'tct_hash');
		if (ov.is(b, 'tct_hash')) {
			return tct.hash(cross_type_(hash, ov.as(b, 'tct_hash'), ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
		}
		if (ov.is(b, 'tct_rec')) {
			let sum = rec_to_hash(b, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types);
			return tct.hash(cross_type(hash, sum, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_own_hash')) {
		const hash = ov.as(match_a_0, 'tct_own_hash');
		if (ov.is(b, 'tct_own_hash')) {
			return tct.own_hash(cross_type_(hash, ov.as(b, 'tct_own_hash'), ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types));
		}
	}
	return ov.mk('tct_im');
}

function rec_to_hash(a, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types) {
	let ret = tct.empty();
	for (const [field, type] of Object.entries(ov.as(a, 'tct_rec'))) {
		ret = cross_type_(type, ret, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors, known_types);
	}
	return ret;
}

function cast_type(to, from, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let ref_inf = { level: 1, from: {}, to: {}, check: true, cast: true };
	return check_assignment_info(to, from.type, ref_inf, from.src, /*ref*/ ref_modules, /*ref*/ ref_errors);
}

function check_assignment(to, from, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let ref_inf = { level: 1, from: {}, to: {}, check: true, cast: false };
	return check_assignment_info(to, from.type, ref_inf, from.src, /*ref*/ ref_modules, /*ref*/ ref_errors);
}

function mk_err(to, from) {
	return ov.mk('err', { to: to, from: from, stack: [] });
}

function check_assignment_info(to, from, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	if (ov.is(from, 'tct_empty')) {
		return ov.mk('ok');
	}
	if (ov.is(from, 'tct_void')) {
		return mk_err(to, from);
	}
	if (ov.is(to, 'tct_im')) {
		if (ref_inf.check && is_known(type_src)) {
			walk_on_type(from, ov.mk('delete'), ref_inf.from, /*ref*/ ref_modules, /*ref*/ ref_errors);
		}
		return ov.mk('ok');
	}
	if (is_cycle_ref(/*ref*/ to, /*ref*/ from, /*ref*/ ref_inf, false, is_known(type_src), /*ref*/ ref_modules, /*ref*/ ref_errors)) {
		return ov.mk('ok');
	}
	if (ref_inf.level == 300) {
		add_error(/*ref*/ ref_errors, 'can\'t assignment this two type');
		return mk_err(to, from);
	}
	const match_to = DC(to);
	if (ov.is(match_to, 'tct_im')) {
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_arr')) {
		const arr_type = ov.as(match_to, 'tct_arr');
		if (!(ov.is(from, 'tct_arr'))) {
			return mk_err(to, from);
		}
		const match_check_assignment_info_arr_type_ov_as_from_tct_arr_inf_type_src_modules_errors = check_assignment_info(arr_type, ov.as(from, 'tct_arr'), ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
		if (ov.is(match_check_assignment_info_arr_type_ov_as_from_tct_arr_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_arr_type_ov_as_from_tct_arr_inf_type_src_modules_errors, 'err')) {
			const info = ov.as(match_check_assignment_info_arr_type_ov_as_from_tct_arr_inf_type_src_modules_errors, 'err');
			array.push(/*ref*/ info.stack, ov.mk('ptd_arr'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_own_arr')) {
		const arr_type = ov.as(match_to, 'tct_own_arr');
		let from_inner;
		if (ov.is(from, 'tct_arr')) {
			from_inner = ov.as(from, 'tct_arr');
		} else if (ov.is(from, 'tct_own_arr')) {
			from_inner = ov.as(from, 'tct_own_arr');
		} else {
			return mk_err(to, from);
		}
		const match_check_assignment_info_arr_type_from_inner_inf_type_src_modules_errors = check_assignment_info(arr_type, from_inner, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
		if (ov.is(match_check_assignment_info_arr_type_from_inner_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_arr_type_from_inner_inf_type_src_modules_errors, 'err')) {
			const info = ov.as(match_check_assignment_info_arr_type_from_inner_inf_type_src_modules_errors, 'err');
			array.push(/*ref*/ info.stack, ov.mk('own_arr'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_hash')) {
		const hash_type = ov.as(match_to, 'tct_hash');
		if (ov.is(from, 'tct_rec') && !ov.is(type_src, 'known')) {
			for (const [name, record] of Object.entries(ov.as(from, 'tct_rec'))) {
				const match_check_assignment_info_hash_type_record_inf_type_src_modules_errors = check_assignment_info(hash_type, record, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
				if (ov.is(match_check_assignment_info_hash_type_record_inf_type_src_modules_errors, 'ok')) {
				} else if (ov.is(match_check_assignment_info_hash_type_record_inf_type_src_modules_errors, 'err')) {
					const info = ov.as(match_check_assignment_info_hash_type_record_inf_type_src_modules_errors, 'err');
					array.push(/*ref*/ info.stack, ov.mk('ptd_rec', name));
					return ov.mk('err', info);
				}
			}
			return ov.mk('ok');
		}
		if (!(ov.is(from, 'tct_hash'))) {
			return mk_err(to, from);
		}
		const match_check_assignment_info_hash_type_ov_as_from_tct_hash_inf_type_src_modules_errors = check_assignment_info(hash_type, ov.as(from, 'tct_hash'), ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
		if (ov.is(match_check_assignment_info_hash_type_ov_as_from_tct_hash_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_hash_type_ov_as_from_tct_hash_inf_type_src_modules_errors, 'err')) {
			const info = ov.as(match_check_assignment_info_hash_type_ov_as_from_tct_hash_inf_type_src_modules_errors, 'err');
			array.push(/*ref*/ info.stack, ov.mk('ptd_hash'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_own_hash')) {
		const hash_type = ov.as(match_to, 'tct_own_hash');
		if (ov.is(from, 'tct_rec')) {
			for (const [name, record] of Object.entries(ov.as(from, 'tct_rec'))) {
				const match_check_assignment_info_hash_type_record_inf_type_src_modules_errors_0 = check_assignment_info(hash_type, record, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
				if (ov.is(match_check_assignment_info_hash_type_record_inf_type_src_modules_errors_0, 'ok')) {
				} else if (ov.is(match_check_assignment_info_hash_type_record_inf_type_src_modules_errors_0, 'err')) {
					const info = ov.as(match_check_assignment_info_hash_type_record_inf_type_src_modules_errors_0, 'err');
					array.push(/*ref*/ info.stack, ov.mk('ptd_rec', name));
					return ov.mk('err', info);
				}
			}
			return ov.mk('ok');
		}
		let from_inner;
		if (ov.is(from, 'tct_hash')) {
			from_inner = ov.as(from, 'tct_hash');
		} else if (ov.is(from, 'tct_own_hash')) {
			from_inner = ov.as(from, 'tct_own_hash');
		} else {
			return mk_err(to, from);
		}
		const match_check_assignment_info_hash_type_from_inner_inf_type_src_modules_errors = check_assignment_info(hash_type, from_inner, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
		if (ov.is(match_check_assignment_info_hash_type_from_inner_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_hash_type_from_inner_inf_type_src_modules_errors, 'err')) {
			const info = ov.as(match_check_assignment_info_hash_type_from_inner_inf_type_src_modules_errors, 'err');
			array.push(/*ref*/ info.stack, ov.mk('own_hash'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_rec')) {
		const records = ov.as(match_to, 'tct_rec');
		if (ref_inf.cast && ov.is(from, 'tct_hash')) {
			let left = ov.as(from, 'tct_hash');
			for (const [name, record] of Object.entries(records)) {
				const match_check_assignment_info_record_left_inf_type_src_modules_errors = check_assignment_info(record, left, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
				if (ov.is(match_check_assignment_info_record_left_inf_type_src_modules_errors, 'ok')) {
				} else if (ov.is(match_check_assignment_info_record_left_inf_type_src_modules_errors, 'err')) {
					const info = ov.as(match_check_assignment_info_record_left_inf_type_src_modules_errors, 'err');
					array.push(/*ref*/ info.stack, ov.mk('ptd_rec', name));
					return ov.mk('err', info);
				}
			}
			return ov.mk('ok');
		}
		if (!(ov.is(from, 'tct_rec'))) {
			return mk_err(to, from);
		}
		let cand_records = ov.as(from, 'tct_rec');
		if (hash.size(cand_records) != hash.size(records)) {
			return mk_err(to, from);
		}
		for (const [name, record] of Object.entries(records)) {
			if (!(hash.has_key(cand_records, name))) {
				return mk_err(to, from);
			}
			let cand_record = hash.get_value(cand_records, name);
			const match_check_assignment_info_record_cand_record_inf_type_src_modules_errors = check_assignment_info(record, cand_record, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
			if (ov.is(match_check_assignment_info_record_cand_record_inf_type_src_modules_errors, 'ok')) {
			} else if (ov.is(match_check_assignment_info_record_cand_record_inf_type_src_modules_errors, 'err')) {
				const info = ov.as(match_check_assignment_info_record_cand_record_inf_type_src_modules_errors, 'err');
				array.push(/*ref*/ info.stack, ov.mk('ptd_rec', name));
				return ov.mk('err', info);
			}
		}
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_own_rec')) {
		const records = ov.as(match_to, 'tct_own_rec');
		let cand_records;
		if (ov.is(from, 'tct_rec')) {
			cand_records = ov.as(from, 'tct_rec');
		} else if (ov.is(from, 'tct_own_rec')) {
			cand_records = ov.as(from, 'tct_own_rec');
		} else {
			return mk_err(to, from);
		}
		if (hash.size(cand_records) != hash.size(records)) {
			return mk_err(to, from);
		}
		for (const [name, record] of Object.entries(records)) {
			if (!(hash.has_key(cand_records, name))) {
				return mk_err(to, from);
			}
			let cand_record = hash.get_value(cand_records, name);
			const match_check_assignment_info_record_cand_record_inf_type_src_modules_errors_0 = check_assignment_info(record, cand_record, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
			if (ov.is(match_check_assignment_info_record_cand_record_inf_type_src_modules_errors_0, 'ok')) {
			} else if (ov.is(match_check_assignment_info_record_cand_record_inf_type_src_modules_errors_0, 'err')) {
				const info = ov.as(match_check_assignment_info_record_cand_record_inf_type_src_modules_errors_0, 'err');
				array.push(/*ref*/ info.stack, ov.mk('own_rec', name));
				return ov.mk('err', info);
			}
		}
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_ref')) {
		const ref_name = ov.as(match_to, 'tct_ref');
		throw new Error(`ov.is(match_to, 'tct_ref') ${ref_name}`);
	} else if (ov.is(match_to, 'tct_void')) {
		throw new Error(`ov.is(match_to, 'tct_void')`);
	} else if (ov.is(match_to, 'tct_int')) {
		if (ov.is(from, 'tct_int')) {
			return ov.mk('ok');
		}
		return mk_err(to, from);
	} else if (ov.is(match_to, 'tct_string')) {
		if (ov.is(from, 'tct_string')) {
			return ov.mk('ok');
		}
		return mk_err(to, from);
	} else if (ov.is(match_to, 'tct_bool')) {
		if (ov.is(from, 'tct_bool')) {
			return ov.mk('ok');
		}
		if (ov.is(from, 'tct_var') && is_variant_bool(from)) {
			return ov.mk('ok');
		}
		return mk_err(to, from);
	} else if (ov.is(match_to, 'tct_var')) {
		const vars = ov.as(match_to, 'tct_var');
		let from_var;
		if (ov.is(from, 'tct_var')) {
			from_var = ov.as(from, 'tct_var');
		} else if (ov.is(from, 'tct_own_var')) {
			from_var = ov.as(from, 'tct_own_var');
		} else if (ov.is(from, 'tct_bool')) {
			if (is_variant_bool(to)) {
				return ov.mk('ok');
			}
			return mk_err(to, from);
		} else {
			return mk_err(to, from);
		}
		for (const [name, from_type] of Object.entries(from_var)) {
			if (!(hash.has_key(vars, name))) {
				return mk_err(to, from);
			}
			let to_type = hash.get_value(vars, name);
			const match_from_type_3 = from_type;
			if (ov.is(match_from_type_3, 'no_param')) {
				const match_to_type = DC(to_type);
				if (ov.is(match_to_type, 'no_param')) {
					continue;
				} else if (ov.is(match_to_type, 'with_param')) {
					const t_t = ov.as(match_to_type, 'with_param');
					return mk_err(to, from);
				}
			} else if (ov.is(match_from_type_3, 'with_param')) {
				const f_t = ov.as(match_from_type_3, 'with_param');
				const match_to_type_0 = to_type;
				if (ov.is(match_to_type_0, 'no_param')) {
					return mk_err(to, from);
				} else if (ov.is(match_to_type_0, 'with_param')) {
					const t_t = ov.as(match_to_type_0, 'with_param');
					const match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors = check_assignment_info(t_t, f_t, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
					if (ov.is(match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors, 'ok')) {
					} else if (ov.is(match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors, 'err')) {
						const info = ov.as(match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors, 'err');
						array.push(/*ref*/ info.stack, ov.mk('ptd_var', name));
						return ov.mk('err', info);
					}
				}
			}
		}
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_own_var')) {
		const vars = ov.as(match_to, 'tct_own_var');
		let from_var;
		if (ov.is(from, 'tct_var')) {
			from_var = ov.as(from, 'tct_var');
		} else if (ov.is(from, 'tct_own_var')) {
			from_var = ov.as(from, 'tct_own_var');
		} else {
			return mk_err(to, from);
		}
		for (const [name, from_type] of Object.entries(from_var)) {
			if (!(hash.has_key(vars, name))) {
				return mk_err(to, from);
			}
			let to_type = hash.get_value(vars, name);
			const match_from_type_4 = from_type;
			if (ov.is(match_from_type_4, 'no_param')) {
				const match_to_type_1 = to_type;
				if (ov.is(match_to_type_1, 'no_param')) {
					continue;
				} else if (ov.is(match_to_type_1, 'with_param')) {
					const t_t = ov.as(match_to_type_1, 'with_param');
					return mk_err(to, from);
				}
			} else if (ov.is(match_from_type_4, 'with_param')) {
				const f_t = ov.as(match_from_type_4, 'with_param');
				const match_to_type_2 = to_type;
				if (ov.is(match_to_type_2, 'no_param')) {
					return mk_err(to, from);
				} else if (ov.is(match_to_type_2, 'with_param')) {
					const t_t = ov.as(match_to_type_2, 'with_param');
					const match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors_0 = check_assignment_info(t_t, f_t, ref_inf, type_src, /*ref*/ ref_modules, /*ref*/ ref_errors);
					if (ov.is(match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors_0, 'ok')) {
					} else if (ov.is(match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors_0, 'err')) {
						const info = ov.as(match_check_assignment_info_t_t_f_t_inf_type_src_modules_errors_0, 'err');
						array.push(/*ref*/ info.stack, ov.mk('ptd_var', name));
						return ov.mk('err', info);
					}
				}
			}
		}
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_empty')) {
		return ov.mk('ok');
	}
}

function add_delete(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	array.push(/*ref*/ ref_modules.env.deref.delete, { line: ref_errors.current_line, module: ref_modules.env.current_module, type_name: type_name });
}

function add_create(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	array.push(/*ref*/ ref_modules.env.deref.create, { line: ref_errors.current_line, module: ref_modules.env.current_module, type_name: type_name });
}

function can_delete(from, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	while (ov.is(from.type, 'tct_ref')) {
		let type_name = ov.as(from.type, 'tct_ref');
		if (is_known(from.src)) {
			add_delete(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		}
		from.type = get_ref_type(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
	}
	return from;
}

function can_create(from, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	while (ov.is(from.type, 'tct_ref')) {
		let type_name = ov.as(from.type, 'tct_ref');
		if (is_known(from.src)) {
			add_create(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		}
		from.type = get_ref_type(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
	}
	return from;
}

function walk_on_type(type, operation, ref_inf, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let refs = {};
	get_ref_in_type(type, /*ref*/ refs);
	let refs2 = refs;
	for (const [type_name, nop] of Object.entries(refs2)) {
		let function_ = get_function_def(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		if (array.len(function_) == 0) {
			return;
		}
		function_ = function_[0];
		const match_function_types = DC(function_.ref_types);
		if (ov.is(match_function_types, 'yes')) {
			const typ = ov.as(match_function_types, 'yes');
			for (const type_name2 of typ) {
				hash.set_value(/*ref*/ refs, type_name2, '');
			}
		} else if (ov.is(match_function_types, 'no')) {
			type = get_ref_type(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
			let ref_names = {};
			get_all_ref_in_type(type, /*ref*/ ref_names, /*ref*/ ref_modules, /*ref*/ ref_errors);
			let arr_names = [];
			for (const [type_name2, nop2] of Object.entries(ref_names)) {
				hash.set_value(/*ref*/ refs, type_name2, '');
				array.push(/*ref*/ arr_names, type_name2);
			}
			function_ = get_function_def(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors)[0];
			function_.ref_types = ov.mk('yes', arr_names);
			let module_st = hash.get_value(ref_modules.funs, function_.module);
			hash.set_value(/*ref*/ module_st, function_.name, function_);
			hash.set_value(/*ref*/ ref_modules.funs, function_.module, module_st);
		}
	}
	for (const [type_name, ar] of Object.entries(refs)) {
		if (hash.has_key(ref_inf, type_name)) {
			continue;
		}
		const match_operation = operation;
		if (ov.is(match_operation, 'create')) {
			add_create(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		} else if (ov.is(match_operation, 'delete')) {
			add_delete(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		}
	}
}

function get_all_ref_in_type(type, /*ref*/ ref_refs, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let refs2 = {};
	get_ref_in_type(type, /*ref*/ refs2);
	for (const [type_name, nop] of Object.entries(refs2)) {
		if ((hash.has_key(ref_refs, type_name))) {
			continue;
		}
		hash.set_value(/*ref*/ ref_refs, type_name, '');
		type = get_ref_type(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
		get_all_ref_in_type(type, /*ref*/ ref_refs, /*ref*/ ref_modules, /*ref*/ ref_errors);
	}
}

function get_ref_in_type(type, /*ref*/ ref_refs) {
	const match_type_12 = type;
	if (ov.is(match_type_12, 'tct_im')) {
	} else if (ov.is(match_type_12, 'tct_arr')) {
		const arr_type = ov.as(match_type_12, 'tct_arr');
		get_ref_in_type(arr_type, /*ref*/ ref_refs);
	} else if (ov.is(match_type_12, 'tct_own_arr')) {
	} else if (ov.is(match_type_12, 'tct_hash')) {
		const hash_type = ov.as(match_type_12, 'tct_hash');
		get_ref_in_type(hash_type, /*ref*/ ref_refs);
	} else if (ov.is(match_type_12, 'tct_own_hash')) {
	} else if (ov.is(match_type_12, 'tct_rec')) {
		const records = ov.as(match_type_12, 'tct_rec');
		for (const [name, record] of Object.entries(records)) {
			get_ref_in_type(record, /*ref*/ ref_refs);
		}
	} else if (ov.is(match_type_12, 'tct_own_rec')) {
	} else if (ov.is(match_type_12, 'tct_ref')) {
		const ref_name = ov.as(match_type_12, 'tct_ref');
		hash.set_value(/*ref*/ ref_refs, ref_name, '');
	} else if (ov.is(match_type_12, 'tct_void')) {
	} else if (ov.is(match_type_12, 'tct_int')) {
	} else if (ov.is(match_type_12, 'tct_string')) {
	} else if (ov.is(match_type_12, 'tct_bool')) {
	} else if (ov.is(match_type_12, 'tct_var')) {
		const vars = ov.as(match_type_12, 'tct_var');
		for (const [name, from_type] of Object.entries(vars)) {
			const match_from_type_5 = from_type;
			if (ov.is(match_from_type_5, 'no_param')) {
			} else if (ov.is(match_from_type_5, 'with_param')) {
				const param = ov.as(match_from_type_5, 'with_param');
				get_ref_in_type(param, /*ref*/ ref_refs);
			}
		}
	} else if (ov.is(match_type_12, 'tct_own_var')) {
	} else if (ov.is(match_type_12, 'tct_empty')) {
	}
}

function get_function_def(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let module;
	let fun_name;
	let ix = string.index2(type_name, '::');
	if (ix >= 0) {
		module = string.substr(type_name, 0, ix);
		fun_name = string.substr(type_name, ix + 2, string.length(type_name) - ix - 2);
	} else {
		add_error(/*ref*/ ref_errors, 'wrong type name `' + type_name + '\' ');
		return [];
	}
	if (!hash.has_key(ref_modules.funs, module)) {
		add_error(/*ref*/ ref_errors, 'module `' + module + '\' does not exist');
		return [];
	}
	let module_st = hash.get_value(ref_modules.funs, module);
	if (!hash.has_key(module_st, fun_name)) {
		add_error(/*ref*/ ref_errors, 'function `' + type_name + '\' does not exist');
		return [];
	}
	return [hash.get_value(module_st, fun_name)];
}

function get_ref_type(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors) {
	let functions = get_function_def(type_name, /*ref*/ ref_modules, /*ref*/ ref_errors);
	if (array.len(functions) == 0) {
		return tct.tct_im();
	}
	let function_ = DC(functions[0]);
	let module_st = hash.get_value(ref_modules.funs, function_.module);
	const match_function_is_type = DC(function_.is_type);
	if (ov.is(match_function_is_type, 'yes')) {
		const typ = ov.as(match_function_is_type, 'yes');
		return typ;
	} else if (ov.is(match_function_is_type, 'no')) {
	}
	let fun_as_type = tct.tct_im();
	const match_ptd_parser_fun_def_to_ptd_function_cmd = ptd_parser.fun_def_to_ptd(function_.cmd);
	if (ov.is(match_ptd_parser_fun_def_to_ptd_function_cmd, 'err')) {
		const err = ov.as(match_ptd_parser_fun_def_to_ptd_function_cmd, 'err');
		add_error(/*ref*/ ref_errors, err);
	} else if (ov.is(match_ptd_parser_fun_def_to_ptd_function_cmd, 'ok')) {
		const ok = ov.as(match_ptd_parser_fun_def_to_ptd_function_cmd, 'ok');
		fun_as_type = ok;
	}
	function_.is_type = ov.mk('yes', fun_as_type);
	hash.set_value(/*ref*/ module_st, function_.name, function_);
	hash.set_value(/*ref*/ ref_modules.funs, function_.module, module_st);
	return fun_as_type;
}

function is_variant_bool(variant) {
	let as_var = ov.as(variant, 'tct_var');
	if (hash.size(as_var) == 2 && hash.has_key(as_var, 'TRUE') && hash.has_key(as_var, 'FALSE')) {
		return true;
	}
	return false;
}



module.exports = {
	is_known,
	is_equal,
	is_try_ensure_type,
	try_get_ensure_sub_types,
	is_condition_type,
	is_accepted,
	is_accepted_info,
	cross_type,
	rec_to_hash,
	cast_type,
	check_assignment,
	can_delete,
	can_create,
	get_ref_type
}