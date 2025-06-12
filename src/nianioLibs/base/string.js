
module.exports = {
	index2(s, val) { return s.indexOf(val); },
	length(s) { return s.length; }, 
	lf() { return '\n'; },
	tab() { return '\t'; },
	r() { return '\r'; },
	substr(s, offset, length) { return s.slice(offset, offset + length); }, 
	substr2(s, offset) { return s.slice(0, -offset); },
	split(val, s) { return s.split(val); }
}