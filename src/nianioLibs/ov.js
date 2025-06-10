
module.exports = {
	mk(element, value = null) { return { [element]: value } },
	get_element(variant) { return Object.keys(variant)[0] },
	get_value(variant) { return Object.values(variant)[0] },
	has_value(variant) { return this.get_value(variant) !== null; },
	is(variant, label) { return Object.keys(variant).length === 1 && Object.keys(variant)[0] === label },
	as(variant, label) { if (!this.is(variant, label)) throw new Error(`variable is not :${label} - :${this.get_element(variant)}`); return variant[label]; },
}