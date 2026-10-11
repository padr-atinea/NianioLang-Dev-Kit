// Variants are marked by their prototype instead of a WeakMap entry (~25x faster to create).
// Semantics are the same: JSON, spread and structuredClone produce plain (non-variant) objects.
const VariantProto = {};

module.exports = {
	mk(element, value = null) {
		const obj = Object.create(VariantProto);
		obj[element] = value;
		return obj;
	},
	is_variant(obj) { return obj !== null && typeof obj === 'object' && Object.getPrototypeOf(obj) === VariantProto },
	get_element(variant) { return Object.keys(variant)[0] },
	get_value(variant) { return Object.values(variant)[0] },
	has_value(variant) { return this.get_value(variant) !== null; },
	is(variant, label) { return Object.keys(variant).length === 1 && Object.keys(variant)[0] === label },
	as(variant, label) { if (!this.is(variant, label)) throw new Error(`variable is not :${label} - :${this.get_element(variant)}`); return variant[label]; },
	eq_safe(x, y) { return this.get_element(x) === this.get_element(y); },
	eq(x, y) {
		if (this.has_value(x)) throw new Error(`ov.eq - :${this.get_element(x)}(${JSON.stringify(this.get_value(x))})`);
		if (this.has_value(y)) throw new Error(`ov.eq - :${this.get_element(y)}(${JSON.stringify(this.get_value(y))})`);
		return this.eq_safe(x, y);
	},
}