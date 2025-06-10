const ov = require('./ov');

const ops = {
	ternary: {
		'?': { prec: 880, assoc: ov.mk('right') },
	},
	unary: {
		'@': { prec: 1010, assoc: ov.mk('right') },
		'++': { prec: 990, assoc: ov.mk('none') },
		'--': { prec: 990, assoc: ov.mk('none') },
		'!': { prec: 980, assoc: ov.mk('right') },
		'+': { prec: 980, assoc: ov.mk('right') },
		'-': { prec: 980, assoc: ov.mk('right') },
	},
	bin: {
		'->': { prec: 2000, assoc: ov.mk('left') },
		'is': { prec: 1500, assoc: ov.mk('left') },
		'as': { prec: 1500, assoc: ov.mk('left') },
		'*': { prec: 970, assoc: ov.mk('left') },
		'/': { prec: 970, assoc: ov.mk('left') },
		'%': { prec: 970, assoc: ov.mk('left') },
		'+': { prec: 960, assoc: ov.mk('left') },
		'-': { prec: 960, assoc: ov.mk('left') },
		'.': { prec: 960, assoc: ov.mk('left') },
		'>=': { prec: 940, assoc: ov.mk('none') },
		'<=': { prec: 940, assoc: ov.mk('none') },
		'<': { prec: 940, assoc: ov.mk('none') },
		'>': { prec: 940, assoc: ov.mk('none') },
		'==': { prec: 930, assoc: ov.mk('none') },
		'!=': { prec: 930, assoc: ov.mk('none') },
		'eq': { prec: 930, assoc: ov.mk('none') },
		'ne': { prec: 930, assoc: ov.mk('none') },
		'&&': { prec: 900, assoc: ov.mk('left') },
		'||': { prec: 890, assoc: ov.mk('left') },
		'=': { prec: 870, assoc: ov.mk('right') },
		'+=': { prec: 870, assoc: ov.mk('right') },
		'/=': { prec: 870, assoc: ov.mk('right') },
		'*=': { prec: 870, assoc: ov.mk('right') },
		'.=': { prec: 870, assoc: ov.mk('right') },
		'-=': { prec: 870, assoc: ov.mk('right') },
		'[]=': { prec: 870, assoc: ov.mk('right') },
	}
}
const lett_oper = {};
const char_opers = [[], [], []];
[ops.unary, ops.bin, ops.ternary].forEach(op => Object.keys(op).forEach(oper => {
	if (/^[a-zA-Z]$/.test(oper[0])) {
		lett_oper[oper] = null
	} else {
		char_opers[oper.length - 1].push(oper);
	}
}));
const char_oper = [...char_opers[2], ...char_opers[1], ...char_opers[0]];


module.exports = { ops, lett_oper, char_oper }