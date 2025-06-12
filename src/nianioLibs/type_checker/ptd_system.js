const ov = require('../base/ov');
const hash = require('../base/hash');
const tct = require('./tct');
const string = require('../base/string');
const array = require('../base/array');
const ptd_parser = require('../parsers/ptd_parser');

function add_error(errors, msg) {
	array.push(errors.errors, {
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
	let match_a = JSON.parse(JSON.stringify(a));
	if (ov.is(match_a, 'tct_im')) {
	} else if (ov.is(match_a, 'tct_arr')) {
		let arr_type = ov.as(match_a, 'tct_arr');
		return is_equal(arr_type, ov.as(b, 'tct_arr'));
	} else if (ov.is(match_a, 'tct_own_arr')) {
		let arr_type = ov.as(match_a, 'tct_own_arr');
		return false;
	} else if (ov.is(match_a, 'tct_hash')) {
		let hash_type = ov.as(match_a, 'tct_hash');
		return is_equal(hash_type, ov.as(b, 'tct_hash'));
	} else if (ov.is(match_a, 'tct_own_hash')) {
		let hash_type = ov.as(match_a, 'tct_own_hash');
		return false;
	} else if (ov.is(match_a, 'tct_rec')) {
		let records = ov.as(match_a, 'tct_rec');
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
		let records = ov.as(match_a, 'tct_own_rec');
		return false;
	} else if (ov.is(match_a, 'tct_ref')) {
		let ref_name = ov.as(match_a, 'tct_ref');
		if (ref_name !== ov.as(b, 'tct_ref')) {
			return false;
		}
	} else if (ov.is(match_a, 'tct_int')) {
	} else if (ov.is(match_a, 'tct_string')) {
		return false;
	} else if (ov.is(match_a, 'tct_bool')) {
	} else if (ov.is(match_a, 'tct_var')) {
		let vars = ov.as(match_a, 'tct_var');
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
		let vars = ov.as(match_a, 'tct_own_var');
		return false;
	} else if (ov.is(match_a, 'tct_empty')) {
	} else if (ov.is(match_a, 'tct_void')) {
	}
	return true;
}

function is_try_ensure_type(type, modules, errors) {
	return is_accepted(type, tct.var_({ ok: tct.tct_im(), err: tct.tct_im() }), modules, errors);
}

function try_get_ensure_sub_types(type, modules, errors) {
	let ret_types = { ok: tct.tct_im(), err: tct.tct_im() };
	type = can_delete(type, modules, errors);
	if (is_try_ensure_type(type, modules, errors)) {
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
			let match_param_0 = param;
			if (ov.is(match_param_0, 'no_param')) {
			} else if (ov.is(match_param_0, 'with_param')) {
				let sub_type = ov.as(match_param_0, 'with_param');
				ret_types.ok = sub_type;
			}
		}
		if (hash.has_key(cases, 'err')) {
			let param = hash.get_value(cases, 'err');
			let match_param_1 = param;
			if (ov.is(match_param_1, 'no_param')) {
			} else if (ov.is(match_param_1, 'with_param')) {
				let sub_type = ov.as(match_param_1, 'with_param');
				ret_types.err = sub_type;
			}
		}
	} else {
		add_error(errors, 'in try|ensure expr; expr must be variant: ok|err');
	}
	return ret_types;
}

function is_condition_type(from, modules, errors) {
	return is_accepted(from, tct.bool(), modules, errors);
}

function is_accepted(from, as_type, modules, errors) {
	let ret = is_accepted_info(from, as_type, modules, errors);
	return ov.is(ret, 'ok');
}

function is_accepted_info(from, as_type, modules, errors) {
	from = can_delete(from, modules, errors);
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
	return check_assignment_info(as_type, from.type, ref_inf, from.src, modules, errors);
}

function add_ref_name(from, hash_, arr, level, modules, errors) {
	let type_name = ov.as(from, 'tct_ref');
	if ((hash.has_key(hash_, type_name))) {
		arr = hash.get_value(hash_, type_name);
	}
	array.push(arr, level);
	hash.set_value(hash_, type_name, arr);
	const newType = get_ref_type(type_name, modules, errors);;
	Object.keys(from).forEach(key => delete from[key]);
	Object.keys(newType).forEach(key => from[key] = newType[key]);
	return type_name;
}

function is_cycle_ref(a, b, ref_inf, is_cross, deleted, modules, errors) {
	if (ov.is(a, 'tct_ref') && ov.is(b, 'tct_ref')) {
		if (ov.as(a, 'tct_ref') === ov.as(b, 'tct_ref')) {
			return true;
		}
		if (is_cross && ov.is(check_assignment_info(a, b, ref_inf, ov.mk('speculation'), modules, errors), 'ok')) {
			return true;
		}
	}
	let arr_to = [];
	let arr_from = [];
	while (ov.is(b, 'tct_ref')) {
		let type_name = add_ref_name(b, ref_inf.from, arr_from, ref_inf.level, modules, errors);
		if (ref_inf.check && array.len(arr_from) == 1 && deleted) {
			add_delete(type_name, modules, errors);
		}
	}
	if (ref_inf.cast) {
		if (ov.is(b, 'tct_im')) {
			if (ref_inf.check) {
				walk_on_type(a, ov.mk('create'), ref_inf.to, modules, errors);
			}
			return true;
		}
	}
	while (ov.is(a, 'tct_ref')) {
		let type_name = add_ref_name(a, ref_inf.to, arr_to, ref_inf.level, modules, errors);
		if (ref_inf.check && array.len(arr_to) == 1) {
			add_create(type_name, modules, errors);
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
	ref_inf.level += 1;
	return false;
}

function cross_type(a, b, modules, errors, known_types) {
	let ref_inf = { level: 1, from: {}, to: {}, check: false, cast: false };
	return cross_type_(a, b, ref_inf, modules, errors, known_types);
}

function cross_type_(a, b, ref_inf, modules, errors, known_types) {
	if ((ov.is(b, 'tct_im') || ov.is(a, 'tct_im'))) {
		return ov.mk('tct_im');
	}
	if (is_cycle_ref(a, b, ref_inf, true, false, modules, errors)) {
		return a;
	}
	if (ref_inf.level == 200) {
		add_error(errors, 'cannnot assign these two types to one variable - types merge failed.');
		return ov.mk('tct_im');
	}
	if ((ov.is(b, 'tct_empty'))) {
		return a;
	}
	let match_a_0 = a;
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
		let ref_name = ov.as(match_a_0, 'tct_ref');
		throw new Error();
	} else if (ov.is(match_a_0, 'tct_void')) {
		throw new Error();
	} else if (ov.is(match_a_0, 'tct_arr')) {
		let arr = ov.as(match_a_0, 'tct_arr');
		if (ov.is(b, 'tct_arr')) {
			return tct.arr(cross_type_(arr, ov.as(b, 'tct_arr'), ref_inf, modules, errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_own_arr')) {
		let arr = ov.as(match_a_0, 'tct_own_arr');
		if (ov.is(b, 'tct_own_arr')) {
			return tct.own_arr(cross_type_(arr, ov.as(b, 'tct_own_arr'), ref_inf, modules, errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_var')) {
		let variants = ov.as(match_a_0, 'tct_var');
		let fin = JSON.parse(JSON.stringify(variants));
		if (ov.is(b, 'tct_var')) {
			let ret = ov.as(b, 'tct_var');
			for (const [field, type] of Object.entries(variants)) {
				if (hash.has_key(ret, field)) {
					let t2 = hash.get_value(ret, field);
					let match_t2 = t2;
					if (ov.is(match_t2, 'with_param')) {
						let typ = ov.as(match_t2, 'with_param');
						let match_type_10 = type;
						if (ov.is(match_type_10, 'with_param')) {
							let typ2 = ov.as(match_type_10, 'with_param');
							hash.set_value(fin, field, cross_type_(typ, typ2, ref_inf, modules, errors, known_types));
						} else if (ov.is(match_type_10, 'no_param')) {
							return ov.mk('tct_im');
						}
					} else if (ov.is(match_t2, 'no_param')) {
						let match_type_11 = type;
						if (ov.is(match_type_11, 'with_param')) {
							let typ = ov.as(match_type_11, 'with_param');
							return ov.mk('tct_im');
						} else if (ov.is(match_type_11, 'no_param')) {
							hash.set_value(fin, field, tct.none());
						}
					}
				} else {
					let match_type_12 = type;
					if (ov.is(match_type_12, 'with_param')) {
						let typ = ov.as(match_type_12, 'with_param');
						hash.set_value(fin, field, typ);
					} else if (ov.is(match_type_12, 'no_param')) {
						hash.set_value(fin, field, tct.none());
					}
				}
			}
			for (const [field, type] of Object.entries(ret)) {
				if ((hash.has_key(fin, field))) {
					continue;
				}
				let match_type_13 = type;
				if (ov.is(match_type_13, 'with_param')) {
					let typ = ov.as(match_type_13, 'with_param');
					hash.set_value(fin, field, typ);
				} else if (ov.is(match_type_13, 'no_param')) {
					hash.set_value(fin, field, tct.none());
				}
			}
			return tct.var_(fin);
		} else if (ov.is(b, 'tct_bool')) {
			if ((is_variant_bool(a))) {
				return ov.mk('tct_bool');
			}
		}
	} else if (ov.is(match_a_0, 'tct_own_var')) {
		let variants = ov.as(match_a_0, 'tct_own_var');
		let fin = JSON.parse(JSON.stringify(variants));
		let inner_type;
		if (ov.is(b, 'tct_own_var')) {
			inner_type = ov.as(b, 'tct_own_var');
		} else if (ov.is(b, 'tct_var')) {
			inner_type = ov.as(b, 'tct_var');
		} else {
			add_error(errors, 'incompatible own types');
			return ov.mk('tct_im');
		}
		let ret = JSON.parse(JSON.stringify(inner_type));
		for (const [field, type] of Object.entries(variants)) {
			if (hash.has_key(ret, field)) {
				let t2 = hash.get_value(ret, field);
				let match_t2_0 = t2;
				if (ov.is(match_t2_0, 'with_param')) {
					let typ = ov.as(match_t2_0, 'with_param');
					let match_type_14 = type;
					if (ov.is(match_type_14, 'with_param')) {
						let typ2 = ov.as(match_type_14, 'with_param');
						hash.set_value(fin, field, cross_type_(typ, typ2, ref_inf, modules, errors, known_types));
					} else if (ov.is(match_type_14, 'no_param')) {
						add_error(errors, 'incompatible own types');
						return ov.mk('tct_im');
					}
				} else if (ov.is(match_t2_0, 'no_param')) {
					let match_type_15 = type;
					if (ov.is(match_type_15, 'with_param')) {
						let typ = ov.as(match_type_15, 'with_param');
						add_error(errors, 'incompatible own types');
						return ov.mk('tct_im');
					} else if (ov.is(match_type_15, 'no_param')) {
						hash.set_value(fin, field, tct.none());
					}
				}
			} else {
				let match_type_16 = type;
				if (ov.is(match_type_16, 'with_param')) {
					let typ = ov.as(match_type_16, 'with_param');
					hash.set_value(fin, field, typ);
				} else if (ov.is(match_type_16, 'no_param')) {
					hash.set_value(fin, field, tct.none());
				}
			}
		}
		for (const [field, type] of Object.entries(ret)) {
			if ((hash.has_key(fin, field))) {
				continue;
			}
			let match_type_17 = type;
			if (ov.is(match_type_17, 'with_param')) {
				let typ = ov.as(match_type_17, 'with_param');
				hash.set_value(fin, field, typ);
			} else if (ov.is(match_type_17, 'no_param')) {
				hash.set_value(fin, field, tct.none());
			}
		}
		if (ov.is(b, 'tct_var')) {
			return tct.var_(fin);
		} else {
			return tct.own_var(fin);
		}
	} else if (ov.is(match_a_0, 'tct_rec')) {
		let reca = ov.as(match_a_0, 'tct_rec');
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
				let reta = rec_to_hash(a, ref_inf, modules, errors, known_types);
				let retb = rec_to_hash(b, ref_inf, modules, errors, known_types);
				return tct.hash(cross_type_(reta, retb, ref_inf, modules, errors, known_types));
			} else {
				let ret = {};
				for (const [field, type] of Object.entries(reca)) {
					hash.set_value(ret, field, cross_type_(type, hash.get_value(recb, field), ref_inf, modules, errors,
						known_types));
				}
				return tct.rec(ret);
			}
		}
		if (ov.is(b, 'tct_hash')) {
			let sum = rec_to_hash(a, ref_inf, modules, errors, known_types);
			return tct.hash(cross_type(ov.as(b, 'tct_hash'), sum, modules, errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_own_rec')) {
		let reca = ov.as(match_a_0, 'tct_own_rec');
		let recb;
		if (ov.is(b, 'tct_own_rec')) {
			recb = ov.as(b, 'tct_own_rec');
		} else if (ov.is(b, 'tct_rec')) {
			recb = ov.as(b, 'tct_rec');
		} else {
			add_error(errors, 'cannot merge non own::rec with own::rec');
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
			add_error(errors, 'cannot merge incompatible own::rec types');
		} else {
			let ret = {};
			for (const [field, type] of Object.entries(reca)) {
				hash.set_value(ret, field, cross_type_(type, hash.get_value(recb, field), ref_inf, modules, errors,
					known_types));
			}
			return tct.own_rec(ret);
		}
	} else if (ov.is(match_a_0, 'tct_hash')) {
		let hash = ov.as(match_a_0, 'tct_hash');
		if (ov.is(b, 'tct_hash')) {
			return tct.hash(cross_type_(hash, ov.as(b, 'tct_hash'), ref_inf, modules, errors, known_types));
		}
		if (ov.is(b, 'tct_rec')) {
			let sum = rec_to_hash(b, ref_inf, modules, errors, known_types);
			return tct.hash(cross_type(hash, sum, modules, errors, known_types));
		}
	} else if (ov.is(match_a_0, 'tct_own_hash')) {
		let hash = ov.as(match_a_0, 'tct_own_hash');
		if (ov.is(b, 'tct_own_hash')) {
			return tct.own_hash(cross_type_(hash, ov.as(b, 'tct_own_hash'), ref_inf, modules, errors, known_types));
		}
	}
	return ov.mk('tct_im');
}

function rec_to_hash(a, ref_inf, modules, errors, known_types) {
	let ret = tct.empty();
	for (const [field, type] of Object.entries(ov.as(a, 'tct_rec'))) {
		ret = cross_type_(type, ret, ref_inf, modules, errors, known_types);
	}
	return ret;
}

function cast_type(to, from, modules, errors) {
	let ref_inf = { level: 1, from: {}, to: {}, check: true, cast: true };
	return check_assignment_info(to, from.type, ref_inf, from.src, modules, errors);
}

function check_assignment(to, from, modules, errors) {
	let ref_inf = { level: 1, from: {}, to: {}, check: true, cast: false };
	return check_assignment_info(to, from.type, ref_inf, from.src, modules, errors);
}

function mk_err(to, from) {
	return ov.mk('err', { to: to, from: from, stack: [] });
}

function check_assignment_info(to, from, ref_inf, type_src, modules, errors) {
	if (ov.is(from, 'tct_empty')) {
		return ov.mk('ok');
	} else if (ov.is(from, 'tct_void')) {
		return mk_err(to, from);
	} else if (ov.is(to, 'tct_im')) {
		if (ref_inf.check && is_known(type_src)) {
			walk_on_type(from, ov.mk('delete'), ref_inf.from, modules, errors);
		}
		return ov.mk('ok');
	} else if (is_cycle_ref(to, from, ref_inf, false, is_known(type_src), modules, errors)) {
		return ov.mk('ok');
	} else if (ref_inf.level == 200) {
		add_error(errors, 'can\'t assignment this two type');
		return mk_err(to, from);
	}
	let match_to = JSON.parse(JSON.stringify(to));
	if (ov.is(match_to, 'tct_im')) {
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_arr')) {
		let arr_type = ov.as(match_to, 'tct_arr');
		if (!(ov.is(from, 'tct_arr'))) {
			return mk_err(to, from);
		}
		let match_check_assignment_info_arr_type_ov_as_from_tct_arr__ref_inf_type_src_modules_errors =
			check_assignment_info(arr_type, ov.as(from, 'tct_arr'), ref_inf, type_src, modules, errors);
		if (ov.is(match_check_assignment_info_arr_type_ov_as_from_tct_arr__ref_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_arr_type_ov_as_from_tct_arr__ref_inf_type_src_modules_errors, 'err')) {
			let info = ov.as(
				match_check_assignment_info_arr_type_ov_as_from_tct_arr__ref_inf_type_src_modules_errors,
				'err');
			array.push(info.stack, ov.mk('ptd_arr'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_own_arr')) {
		let arr_type = ov.as(match_to, 'tct_own_arr');
		let from_inner;
		if (ov.is(from, 'tct_arr')) {
			from_inner = ov.as(from, 'tct_arr');
		} else if (ov.is(from, 'tct_own_arr')) {
			from_inner = ov.as(from, 'tct_own_arr');
		} else {
			return mk_err(to, from);
		}
		let match_check_assignment_info_arr_type_from_inner_ref_inf_type_src_modules_errors =
			check_assignment_info(arr_type, from_inner, ref_inf, type_src, modules, errors);
		if (ov.is(match_check_assignment_info_arr_type_from_inner_ref_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_arr_type_from_inner_ref_inf_type_src_modules_errors, 'err')) {
			let info = ov.as(match_check_assignment_info_arr_type_from_inner_ref_inf_type_src_modules_errors,
				'err');
			array.push(info.stack, ov.mk('own_arr'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_hash')) {
		let hash_type = ov.as(match_to, 'tct_hash');
		if (ov.is(from, 'tct_rec') && !ov.is(type_src, 'known')) {
			for (const [name, record] of Object.entries(ov.as(from, 'tct_rec'))) {
				let match_check_assignment = check_assignment_info(hash_type, record, ref_inf, type_src, modules, errors);
				if (ov.is(match_check_assignment, 'ok')) {
				} else if (ov.is(match_check_assignment, 'err')) {
					let info = ov.as(match_check_assignment, 'err');
					array.push(info.stack, ov.mk('ptd_rec', name));
					return ov.mk('err', info);
				}
			}
			return ov.mk('ok');
		}
		if (!(ov.is(from, 'tct_hash'))) {
			return mk_err(to, from);
		}
		let match_check_assignment_info_hash_type_ov_as_from_tct_hash__ref_inf_type_src_modules_errors =
			check_assignment_info(hash_type, ov.as(from, 'tct_hash'), ref_inf, type_src, modules, errors);
		if (ov.is(match_check_assignment_info_hash_type_ov_as_from_tct_hash__ref_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_hash_type_ov_as_from_tct_hash__ref_inf_type_src_modules_errors,
			'err')) {
			let info = ov.as(
				match_check_assignment_info_hash_type_ov_as_from_tct_hash__ref_inf_type_src_modules_errors,
				'err');
			array.push(info.stack, ov.mk('ptd_hash'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_own_hash')) {
		let hash_type = ov.as(match_to, 'tct_own_hash');
		if (ov.is(from, 'tct_rec')) {
			for (const [name, record] of Object.entries(ov.as(from, 'tct_rec'))) {
				let match_check_assignment_info_hash_type_record_ref_inf_type_src_modules_errors_0 =
					check_assignment_info(hash_type, record, ref_inf, type_src, modules, errors);
				if (ov.is(match_check_assignment_info_hash_type_record_ref_inf_type_src_modules_errors_0, 'ok')) {
				} else if (ov.is(match_check_assignment_info_hash_type_record_ref_inf_type_src_modules_errors_0, 'err')) {
					let info = ov.as(match_check_assignment_info_hash_type_record_ref_inf_type_src_modules_errors_0, 'err');
					array.push(info.stack, ov.mk('ptd_rec', name));
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
		let match_check_assignment_info_hash_type_from_inner_ref_inf_type_src_modules_errors =
			check_assignment_info(hash_type, from_inner, ref_inf, type_src, modules, errors);
		if (ov.is(match_check_assignment_info_hash_type_from_inner_ref_inf_type_src_modules_errors, 'ok')) {
			return ov.mk('ok');
		} else if (ov.is(match_check_assignment_info_hash_type_from_inner_ref_inf_type_src_modules_errors, 'err')) {
			let info = ov.as(match_check_assignment_info_hash_type_from_inner_ref_inf_type_src_modules_errors,
				'err');
			array.push(info.stack, ov.mk('own_hash'));
			return ov.mk('err', info);
		}
	} else if (ov.is(match_to, 'tct_rec')) {
		let records = ov.as(match_to, 'tct_rec');
		if (ref_inf.cast && ov.is(from, 'tct_hash')) {
			let left = ov.as(from, 'tct_hash');
			for (const [name, record] of Object.entries(records)) {
				let match_check_assignment_info_record_left_ref_inf_type_src_modules_errors =
					check_assignment_info(record, left, ref_inf, type_src, modules, errors);
				if (ov.is(match_check_assignment_info_record_left_ref_inf_type_src_modules_errors, 'ok')) {
				} else if (ov.is(match_check_assignment_info_record_left_ref_inf_type_src_modules_errors, 'err')) {
					let info = ov.as(match_check_assignment_info_record_left_ref_inf_type_src_modules_errors,
						'err');
					array.push(info.stack, ov.mk('ptd_rec', name));
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
			let match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors =
				check_assignment_info(record, cand_record, ref_inf, type_src, modules, errors);
			if (ov.is(match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors, 'ok')) {
			} else if (ov.is(match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors, 'err')) {
				let info = ov.as(match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors,
					'err');
				array.push(info.stack, ov.mk('ptd_rec', name));
				return ov.mk('err', info);
			}
		}
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_own_rec')) {
		let records = ov.as(match_to, 'tct_own_rec');
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
			let match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors_0 =
				check_assignment_info(record, cand_record, ref_inf, type_src, modules, errors);
			if (ov.is(match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors_0, 'ok')) {
			} else if (ov.is(match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors_0, 'err')) {
				let info = ov.as(match_check_assignment_info_record_cand_record_ref_inf_type_src_modules_errors_0,
					'err');
				array.push(info.stack, ov.mk('own_rec', name));
				return ov.mk('err', info);
			}
		}
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_ref')) {
		let ref_name = ov.as(match_to, 'tct_ref');
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
		let vars = ov.as(match_to, 'tct_var');
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
			let match_from_type_5 = from_type;
			if (ov.is(match_from_type_5, 'no_param')) {
				let match_to_type = JSON.parse(JSON.stringify(to_type));
				if (ov.is(match_to_type, 'no_param')) {
					continue;
				} else if (ov.is(match_to_type, 'with_param')) {
					let t_t = ov.as(match_to_type, 'with_param');
					return mk_err(to, from);
				}
			} else if (ov.is(match_from_type_5, 'with_param')) {
				let f_t = ov.as(match_from_type_5, 'with_param');
				let match_to_type_0 = to_type;
				if (ov.is(match_to_type_0, 'no_param')) {
					return mk_err(to, from);
				} else if (ov.is(match_to_type_0, 'with_param')) {
					let t_t = ov.as(match_to_type_0, 'with_param');
					let match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors =
						check_assignment_info(t_t, f_t, ref_inf, type_src, modules, errors);
					if (ov.is(match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors, 'ok')) {
					} else if (ov.is(match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors, 'err')) {
						let info = ov.as(match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors,
							'err');
						array.push(info.stack, ov.mk('ptd_var', name));
						return ov.mk('err', info);
					}
				}
			}
		}
		return ov.mk('ok');
	} else if (ov.is(match_to, 'tct_own_var')) {
		let vars = ov.as(match_to, 'tct_own_var');
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
			let match_from_type_6 = from_type;
			if (ov.is(match_from_type_6, 'no_param')) {
				let match_to_type_1 = to_type;
				if (ov.is(match_to_type_1, 'no_param')) {
					continue;
				} else if (ov.is(match_to_type_1, 'with_param')) {
					let t_t = ov.as(match_to_type_1, 'with_param');
					return mk_err(to, from);
				}
			} else if (ov.is(match_from_type_6, 'with_param')) {
				let f_t = ov.as(match_from_type_6, 'with_param');
				let match_to_type_2 = to_type;
				if (ov.is(match_to_type_2, 'no_param')) {
					return mk_err(to, from);
				} else if (ov.is(match_to_type_2, 'with_param')) {
					let t_t = ov.as(match_to_type_2, 'with_param');
					let match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors_0 =
						check_assignment_info(t_t, f_t, ref_inf, type_src, modules, errors);
					if (ov.is(match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors_0, 'ok')) {
					} else if (ov.is(match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors_0, 'err')) {
						let info = ov.as(match_check_assignment_info_t_t_f_t_ref_inf_type_src_modules_errors_0,
							'err');
						array.push(info.stack, ov.mk('ptd_var', name));
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

function add_delete(type_name, modules, errors) {
	array.push(modules.env.deref.delete, {
		debug: errors.current_debug,
		module: modules.env.current_module,
		type_name: type_name
	});
}

function add_create(type_name, modules, errors) {
	array.push(modules.env.deref.create, {
		debug: errors.current_debug,
		module: modules.env.current_module,
		type_name: type_name
	});
}

function can_delete(from, modules, errors) {
	while (ov.is(from.type, 'tct_ref')) {
		let type_name = ov.as(from.type, 'tct_ref');
		if (is_known(from.src)) {
			add_delete(type_name, modules, errors);
		}
		from.type = get_ref_type(type_name, modules, errors);
	}
	return from;
}

function can_create(from, modules, errors) {
	while (ov.is(from.type, 'tct_ref')) {
		let type_name = ov.as(from.type, 'tct_ref');
		if (is_known(from.src)) {
			add_create(type_name, modules, errors);
		}
		from.type = get_ref_type(type_name, modules, errors);
	}
}

function walk_on_type(type, operation, ref_inf, modules, errors) {
	let refs = {};
	get_ref_in_type(type, refs);
	let refs2 = refs;
	for (const [type_name, nop] of Object.entries(refs2)) {
		let function_ = get_function_def(type_name, modules, errors);
		if (array.len(function_) == 0) {
			return;
		}
		function_ = function_[0];
		let match_function_ref_types = JSON.parse(JSON.stringify(function_.ref_types));
		if (ov.is(match_function_ref_types, 'yes')) {
			let typ = ov.as(match_function_ref_types, 'yes');
			for (const type_name2 of typ) {
				hash.set_value(refs, type_name2, '');
			}
		} else if (ov.is(match_function_ref_types, 'no')) {
			type = get_ref_type(type_name, modules, errors);
			let ref_names = {};
			get_all_ref_in_type(type, ref_names, modules, errors);
			let arr_names = [];
			for (const [type_name2, nop2] of Object.entries(ref_names)) {
				hash.set_value(refs, type_name2, '');
				array.push(arr_names, type_name2);
			}
			function_ = get_function_def(type_name, modules, errors)[0];
			function_.ref_types = ov.mk('yes', arr_names);
			let module_st = hash.get_value(modules.funs, function_.module);
			hash.set_value(module_st, function_.name, function_);
			hash.set_value(modules.funs, function_.module, module_st);
		}
	}
	for (const [type_name, ar] of Object.entries(refs)) {
		if (hash.has_key(ref_inf, type_name)) {
			continue;
		}
		let match_operation_0 = operation;
		if (ov.is(match_operation_0, 'create')) {
			add_create(type_name, modules, errors);
		} else if (ov.is(match_operation_0, 'delete')) {
			add_delete(type_name, modules, errors);
		}
	}
}

function get_all_ref_in_type(type, refs, modules, errors) {
	let refs2 = {};
	get_ref_in_type(type, refs2);
	for (const [type_name, nop] of Object.entries(refs2)) {
		if ((hash.has_key(refs, type_name))) {
			continue;
		}
		hash.set_value(refs, type_name, '');
		type = get_ref_type(type_name, modules, errors);
		get_all_ref_in_type(type, refs, modules, errors);
	}
}

function get_ref_in_type(type, refs) {
	let match_type_18 = type;
	if (ov.is(match_type_18, 'tct_im')) {
	} else if (ov.is(match_type_18, 'tct_arr')) {
		let arr_type = ov.as(match_type_18, 'tct_arr');
		get_ref_in_type(arr_type, refs);
	} else if (ov.is(match_type_18, 'tct_own_arr')) {
	} else if (ov.is(match_type_18, 'tct_hash')) {
		let hash_type = ov.as(match_type_18, 'tct_hash');
		get_ref_in_type(hash_type, refs);
	} else if (ov.is(match_type_18, 'tct_own_hash')) {
	} else if (ov.is(match_type_18, 'tct_rec')) {
		let records = ov.as(match_type_18, 'tct_rec');
		for (const [name, record] of Object.entries(records)) {
			get_ref_in_type(record, refs);
		}
	} else if (ov.is(match_type_18, 'tct_own_rec')) {
	} else if (ov.is(match_type_18, 'tct_ref')) {
		let ref_name = ov.as(match_type_18, 'tct_ref');
		hash.set_value(refs, ref_name, '');
	} else if (ov.is(match_type_18, 'tct_void')) {
	} else if (ov.is(match_type_18, 'tct_int')) {
	} else if (ov.is(match_type_18, 'tct_string')) {
	} else if (ov.is(match_type_18, 'tct_bool')) {
	} else if (ov.is(match_type_18, 'tct_var')) {
		let vars = ov.as(match_type_18, 'tct_var');
		for (const [name, from_type] of Object.entries(vars)) {
			let match_from_type_7 = from_type;
			if (ov.is(match_from_type_7, 'no_param')) {
			} else if (ov.is(match_from_type_7, 'with_param')) {
				let param = ov.as(match_from_type_7, 'with_param');
				get_ref_in_type(param, refs);
			}
		}
	} else if (ov.is(match_type_18, 'tct_own_var')) {
	} else if (ov.is(match_type_18, 'tct_empty')) {
	}
}

function get_function_def(type_name, modules, errors) {
	let module;
	let fun_name;
	let ix = string.index2(type_name, '::');
	if (ix >= 0) {
		[module, fun_name] = type_name.split('::');
	} else {
		add_error(errors, `wrong type name \`${type_name}\' `);
		return [];
	}
	if (!hash.has_key(modules.funs, module)) {
		add_error(errors, `module \`${module}\' does not exist`);
		return [];
	}
	let module_st = hash.get_value(modules.funs, module);
	if (!hash.has_key(module_st, fun_name)) {
		add_error(errors, `function \`${type_name}\' does not exist`);
		return [];
	}
	return [hash.get_value(module_st, fun_name)];
}

function get_ref_type(type_name, modules, errors) {
	let functions = get_function_def(type_name, modules, errors);
	if (array.len(functions) == 0) {
		return tct.tct_im();
	}
	let function_ = JSON.parse(JSON.stringify(functions[0]));
	let module_st = hash.get_value(modules.funs, function_.module);
	let match_function_is_type = JSON.parse(JSON.stringify(function_.is_type));
	if (ov.is(match_function_is_type, 'yes')) {
		let typ = ov.as(match_function_is_type, 'yes');
		return typ;
	} else if (ov.is(match_function_is_type, 'no')) {
	}
	let fun_as_type = tct.tct_im();
	let match_ptd_parser_fun_def_to_ptd_function_cmd = ptd_parser.fun_def_to_ptd(function_.cmd);
	if (ov.is(match_ptd_parser_fun_def_to_ptd_function_cmd, 'err')) {
		let err = ov.as(match_ptd_parser_fun_def_to_ptd_function_cmd, 'err');
		add_error(errors, err);
	} else if (ov.is(match_ptd_parser_fun_def_to_ptd_function_cmd, 'ok')) {
		let ok = ov.as(match_ptd_parser_fun_def_to_ptd_function_cmd, 'ok');
		fun_as_type = ok;
	}
	function_.is_type = ov.mk('yes', fun_as_type);
	hash.set_value(module_st, function_.name, function_);
	hash.set_value(modules.funs, function_.module, module_st);
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