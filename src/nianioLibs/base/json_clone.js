// Deep copy with exactly the semantics of JSON.parse(JSON.stringify(obj)), ~5x faster:
// own enumerable keys only, undefined/functions/symbols dropped (null in arrays), non-finite numbers -> null,
// prototypes (e.g. of variants) not preserved.
// Anything unusual (toJSON, cycles, too deep structures, top-level undefined...) falls back to the JSON round trip,
// so also errors are the same as before.

class Fallback extends Error { }

function clone(value) {
	if (typeof value !== 'object' || value === null) return typeof value === 'number' && !Number.isFinite(value) ? null : value;
	if (typeof value.toJSON === 'function') throw new Fallback();
	if (Array.isArray(value)) {
		const out = new Array(value.length);
		for (let i = 0; i < value.length; i++) {
			const v = value[i];
			out[i] = v === undefined || typeof v === 'function' || typeof v === 'symbol' ? null : clone(v);
		}
		return out;
	}
	const out = {};
	for (const key of Object.keys(value)) {
		const v = value[key];
		if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
		out[key] = clone(v);
	}
	return out;
}

function json_clone(value) {
	if (typeof value === 'object' && value !== null) {
		try {
			return clone(value);
		} catch (e) {
			// toJSON, cycle or stack overflow
		}
	}
	return JSON.parse(JSON.stringify(value));
}

module.exports = json_clone;
