module.exports = {
	subarray(a, start, len) { return a.slice(start, start + len); },
	reverse(a) { a.reverse(); },
	remove(a, index) { a.splice(index, 1); }, 
	insert(a, index, el) { a = [...a.slice(0, index), el, ...a.slice(index)]; },
	push(a, el) { a.push(el); },
	add(a, el) { return [...a, el]; }, 
	unshift(a, el) { a.unshift(el); }, 
	len(a) { return a.length; },
	is_empty(a) { return a.length === 0; },
	pop(a) { a.pop(); },
	append(a, el) { a.push(...el); },	
}