
module.exports = {
	size(h) { return Object.keys(h).length; },
	get_value(h, name) { return h[name]; },
	has_key(h, name) { return name in h; },
	set_value(h, name, val) { h[name] = val; },
	delete(h, name) { delete h[name]; },
	keys(h) { return Object.keys(h); },
	values(h) { return Object.values(h); },
	merge(h1, h2) { return { ...h1, ...h2 } },
	add_all(h1, h2) { h1 = { ...h1, ...h2 } }, 
}