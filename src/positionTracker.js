// Keeps the type checking results (variable positions, type errors) attached to the right text while the document
// is edited and not checked again yet.
//
// Every change of a document is logged. The results are stored together with the document version they
// were computed for (`base`); the view for the current version is computed lazily by mapping the positions through
// the logged changes. Entries whose text was modified are dropped (instead of being shown in a wrong place).
// All positions in the results are 1-based ({ line, position } and keys 'line|position').

const vscode = require('vscode');

const MAX_LOG = 5000;
const changeLogs = new Map(); // uri -> [{ version, changes: [{ sl, sc, el, ec, nl, lastLen }] }] (0-based)

function recordChange(event) {
	const uri = event.document.uri.toString();
	let log = changeLogs.get(uri);
	if (!log) changeLogs.set(uri, log = []);
	log.push({
		version: event.document.version,
		changes: event.contentChanges.map(change => {
			const lines = change.text.split('\n');
			return {
				sl: change.range.start.line, sc: change.range.start.character,
				el: change.range.end.line, ec: change.range.end.character,
				nl: lines.length - 1, lastLen: lines[lines.length - 1].length,
			};
		}),
	});
	if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
}

function forgetDocument(uri) {
	changeLogs.delete(uri.toString());
}

// results for `base.version` are stored - older log entries are not needed any more
function setBase(base) {
	const log = changeLogs.get(base.uri);
	if (!log) return;
	const keep = log.findIndex(entry => entry.version > base.version);
	log.splice(0, keep < 0 ? log.length : keep);
}

const before = (l1, c1, l2, c2) => l1 < l2 || (l1 === l2 && c1 < c2);

// position after the change; null when the position was inside the replaced text
function mapPos(line, ch, c) {
	if (before(line, ch, c.sl, c.sc)) return [line, ch];
	if (before(line, ch, c.el, c.ec)) return null;
	if (line === c.el) return [c.sl + c.nl, (c.nl === 0 ? c.sc + c.lastLen : c.lastLen) + ch - c.ec];
	return [line + c.nl - (c.el - c.sl), ch];
}

// does the change modify text inside [start, end) (an insertion at the start or at the end does not)
function touches(sl, sc, el, ec, c) {
	return before(c.sl, c.sc, el, ec) && before(sl, sc, c.el, c.ec);
}

// maps a 1-based range through the changes: [line, position, endLine, endPosition] or null if it was modified
function mapRange(changes, line, position, endLine, endPosition) {
	let sl = line - 1, sc = position - 1, el = endLine - 1, ec = endPosition - 1;
	for (const c of changes) {
		if (touches(sl, sc, el, ec, c)) return null;
		const start = mapPos(sl, sc, c), end = mapPos(el, ec, c);
		if (!start || !end) return null;
		[sl, sc] = start;
		[el, ec] = end;
	}
	return [sl + 1, sc + 1, el + 1, ec + 1];
}

// a position which may end up inside a change (e.g. end of a scope) is moved to the end of the inserted text
function mapPosClamped(changes, place) {
	let l = place.line - 1, ch = place.position - 1;
	for (const c of changes) {
		const mapped = mapPos(l, ch, c) ?? [c.sl + c.nl, c.nl === 0 ? c.sc + c.lastLen : c.lastLen];
		[l, ch] = mapped;
	}
	return { ...place, line: l + 1, position: ch + 1 };
}

const keyOf = (line, position) => `${line}|${position}`;
const parseKey = (key) => key.split('|').map(Number);

function mapPlace(changes, place, length) {
	const r = mapRange(changes, place.line, place.position, place.line, place.position + Math.max(1, length));
	return r ? { ...place, line: r[0], position: r[1] } : null;
}

function mapVarPositions(changes, varPositions) {
	const nameLength = (value) => {
		if (value.def) return value.def.name?.length ?? 1;
		if (value.field) return value.field.name?.length ?? 1;
		if (value.ref) return varPositions[keyOf(value.ref.line, value.ref.position)]?.def?.name?.length ?? 1;
		if (value.use) return value.use.length;
		return 1;
	};
	const out = {};
	for (const [key, value] of Object.entries(varPositions)) {
		const [line, position] = parseKey(key);
		const place = mapPlace(changes, { line, position }, nameLength(value));
		if (!place) continue;
		let mapped = value;
		if (value.ref) {
			const def = varPositions[keyOf(value.ref.line, value.ref.position)]?.def;
			const defPlace = mapPlace(changes, value.ref, def?.name?.length ?? 1);
			if (!defPlace) continue;
			mapped = { ...value, ref: defPlace };
		} else if (value.def) {
			const def = value.def;
			const refs = {};
			for (const refKey of Object.keys(def.refs ?? {})) {
				const [refLine, refPosition] = parseKey(refKey);
				const refPlace = mapPlace(changes, { line: refLine, position: refPosition }, def.name?.length ?? 1);
				if (refPlace) refs[keyOf(refPlace.line, refPlace.position)] = def.refs[refKey];
			}
			mapped = {
				...value,
				def: {
					...def,
					defPlace: def.defPlace ? { ...def.defPlace, line: place.line, position: place.position } : def.defPlace,
					endPlace: def.endPlace ? mapPosClamped(changes, def.endPlace) : def.endPlace,
					...(def.refs ? { refs } : {}),
				},
			};
		}
		out[keyOf(place.line, place.position)] = mapped;
	}
	return out;
}

function mapDiagnostics(changes, diagnostics) {
	const out = [];
	for (const err of diagnostics) {
		const { begin, end } = err.debug;
		const r = mapRange(changes, begin.line, begin.position, end.line, end.position);
		if (!r) continue;
		out.push({ ...err, debug: { ...err.debug, begin: { ...begin, line: r[0], position: r[1] }, end: { ...end, line: r[2], position: r[3] } } });
	}
	return out;
}

// hints of inferred types: [{ anchor, line, position, ... }] - dropped when the anchor (name / '{') was modified
function mapInferredTypes(changes, inferredTypes) {
	const out = [];
	for (const hint of inferredTypes ?? []) {
		const place = mapPlace(changes, { line: hint.line, position: hint.position }, (hint.anchor ?? hint.name).length);
		if (place) out.push({ ...hint, line: place.line, position: place.position });
	}
	return out;
}

// changes made since base.version, or null when they are not known (e.g. the document was reopened)
function getChangesSince(base, document) {
	const log = changeLogs.get(base.uri) ?? [];
	const start = log.findIndex(entry => entry.version > base.version);
	if (start < 0) return null;
	const entries = log.slice(start);
	if (entries[0].version !== base.version + 1 || entries[entries.length - 1].version !== document.version) return null;
	for (let i = 1; i < entries.length; i++) if (entries[i].version !== entries[i - 1].version + 1) return null;
	return entries.flatMap(entry => entry.changes);
}

// typeResults: { base: { uri, version }, varPositions, dynamicDiagnostics, inferredTypes, view }
// returns { varPositions, dynamicDiagnostics, inferredTypes } for the current text of the document
function getView(typeResults) {
	const { base } = typeResults;
	if (!base) return typeResults;
	const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === base.uri);
	if (!document || document.version === base.version) return typeResults;
	if (typeResults.view?.version === document.version) return typeResults.view;
	const changes = getChangesSince(base, document);
	// unknown changes (e.g. the document was reopened): the results are used as they are
	const view = changes ? {
		version: document.version,
		varPositions: mapVarPositions(changes, typeResults.varPositions),
		dynamicDiagnostics: mapDiagnostics(changes, typeResults.dynamicDiagnostics),
		inferredTypes: mapInferredTypes(changes, typeResults.inferredTypes),
	} : { version: document.version, varPositions: typeResults.varPositions, dynamicDiagnostics: typeResults.dynamicDiagnostics, inferredTypes: typeResults.inferredTypes };
	typeResults.view = view;
	return view;
}

module.exports = { recordChange, forgetDocument, setBase, getView, mapVarPositions, mapDiagnostics };
