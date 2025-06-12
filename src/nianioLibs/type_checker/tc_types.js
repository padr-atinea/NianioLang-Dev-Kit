const ov = require('../base/ov');
const hash = require('../base/hash');
const tct = require('./tct');

function op_def(elems, in_, arg1, arg2, ret) {
	hash.set_value(elems, in_, { arg1: arg1, arg2: arg2, ret: ret });
}

function get_bin_op_def(name) {
	return hash.get_value(get_binary_ops(), name);
}

function get_binary_ops() {
	let ret = {};
	op_def(ret, '*', tct.int(), tct.int(), tct.int());
	op_def(ret, '/', tct.int(), tct.int(), tct.int());
	op_def(ret, '%', tct.int(), tct.int(), tct.int());
	op_def(ret, '+', tct.int(), tct.int(), tct.int());
	op_def(ret, '-', tct.int(), tct.int(), tct.int());
	op_def(ret, '.', tct.string(), tct.string(), tct.string());
	op_def(ret, '>=', tct.int(), tct.int(), tct.bool());
	op_def(ret, '<=', tct.int(), tct.int(), tct.bool());
	op_def(ret, '<', tct.int(), tct.int(), tct.bool());
	op_def(ret, '>', tct.int(), tct.int(), tct.bool());
	op_def(ret, '==', tct.int(), tct.int(), tct.bool());
	op_def(ret, '!=', tct.int(), tct.int(), tct.bool());
	op_def(ret, 'eq', tct.string(), tct.string(), tct.bool());
	op_def(ret, 'ne', tct.string(), tct.string(), tct.bool());
	op_def(ret, '&&', tct.bool(), tct.bool(), tct.bool());
	op_def(ret, '||', tct.bool(), tct.bool(), tct.bool());
	op_def(ret, '+=', tct.int(), tct.int(), tct.int());
	op_def(ret, '/=', tct.int(), tct.int(), tct.int());
	op_def(ret, '*=', tct.int(), tct.int(), tct.int());
	op_def(ret, '.=', tct.string(), tct.string(), tct.string());
	op_def(ret, '-=', tct.int(), tct.int(), tct.int());
	return ret;
}

function get_default_type() {
	return { type: tct.tct_im(), src: ov.mk('speculation') };
}


module.exports = {
	get_bin_op_def,
	get_default_type
}