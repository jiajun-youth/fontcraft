/**
 * Minimal namespace-preserving XML DOM for OOXML parts.
 * It parses, lets callers mutate the tree, and serializes back with the same
 * prefixes, attribute order and text. It deliberately does not resolve
 * namespaces: OOXML parts use well-known w:/a:/r: prefixes.
 */

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  if (text.indexOf('&') === -1) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(ENTITY, body) ? ENTITY[body] : match;
  });
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseXml(source) {
  const input = String(source);
  const root = { type: 'document', children: [] };
  const stack = [root];
  let i = 0;

  const push = (node) => stack[stack.length - 1].children.push(node);

  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      if (i < input.length) push({ type: 'text', value: decodeEntities(input.slice(i)) });
      break;
    }
    if (lt > i) push({ type: 'text', value: decodeEntities(input.slice(i, lt)) });

    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      push({ type: 'comment', value: input.slice(lt + 4, end === -1 ? input.length : end) });
      i = end === -1 ? input.length : end + 3;
      continue;
    }
    if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt + 9);
      push({ type: 'cdata', value: input.slice(lt + 9, end === -1 ? input.length : end) });
      i = end === -1 ? input.length : end + 3;
      continue;
    }
    if (input.startsWith('<?', lt)) {
      const end = input.indexOf('?>', lt + 2);
      const body = input.slice(lt + 2, end === -1 ? input.length : end);
      push({ type: body.startsWith('xml ') || body === 'xml' ? 'decl' : 'pi', value: body });
      i = end === -1 ? input.length : end + 2;
      continue;
    }
    if (input.startsWith('<!', lt)) {
      const end = input.indexOf('>', lt + 2);
      push({ type: 'pi', value: input.slice(lt + 2, end === -1 ? input.length : end) });
      i = end === -1 ? input.length : end + 1;
      continue;
    }
    if (input.startsWith('</', lt)) {
      const end = input.indexOf('>', lt + 2);
      const name = input.slice(lt + 2, end === -1 ? input.length : end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new Error(`XML 结构不匹配：期望 </${open ? open.name : '?'}>，实际 </${name}>`);
      }
      i = end === -1 ? input.length : end + 1;
      continue;
    }

    // element start tag
    let j = lt + 1;
    while (j < input.length && !/[\s/>]/.test(input[j])) j++;
    const name = input.slice(lt + 1, j);
    const attrs = [];
    let selfClosing = false;
    for (;;) {
      while (j < input.length && /\s/.test(input[j])) j++;
      if (input[j] === '/' && input[j + 1] === '>') {
        selfClosing = true;
        j += 2;
        break;
      }
      if (input[j] === '>') {
        j += 1;
        break;
      }
      let k = j;
      while (k < input.length && !/[\s=/>]/.test(input[k])) k++;
      const attrName = input.slice(j, k);
      let value = '';
      if (input[k] === '=') {
        k++;
        while (k < input.length && /\s/.test(input[k])) k++;
        const quote = input[k];
        if (quote === '"' || quote === "'") {
          const endQuote = input.indexOf(quote, k + 1);
          value = decodeEntities(input.slice(k + 1, endQuote === -1 ? input.length : endQuote));
          k = endQuote === -1 ? input.length : endQuote + 1;
        } else {
          let e = k;
          while (e < input.length && !/[\s>]/.test(input[e])) e++;
          value = decodeEntities(input.slice(k, e));
          k = e;
        }
      }
      attrs.push({ name: attrName, value });
      j = k;
      if (j <= k - 1 && attrName === '') break;
    }
    const node = { type: 'element', name, attrs, children: [], selfClosing };
    push(node);
    if (!selfClosing) stack.push(node);
    i = j;
  }
  return root;
}

export function serializeXml(root) {
  const out = [];
  const write = (node) => {
    switch (node.type) {
      case 'document':
        node.children.forEach(write);
        break;
      case 'decl':
        out.push(`<?${node.value}?>`);
        break;
      case 'pi':
        out.push(`<?${node.value}?>`);
        break;
      case 'comment':
        out.push(`<!--${node.value}-->`);
        break;
      case 'cdata':
        out.push(`<![CDATA[${node.value}]]>`);
        break;
      case 'text':
        out.push(escapeText(node.value));
        break;
      case 'element': {
        out.push('<', node.name);
        for (const attr of node.attrs) {
          out.push(' ', attr.name, '="', escapeAttr(attr.value), '"');
        }
        if (node.selfClosing && node.children.length === 0) {
          out.push('/>');
          break;
        }
        out.push('>');
        node.children.forEach(write);
        out.push('</', node.name, '>');
        break;
      }
      default:
        break;
    }
  };
  write(root);
  return out.join('');
}

export function el(name, attrs = {}, children = []) {
  return {
    type: 'element',
    name,
    attrs: Object.entries(attrs).map(([key, value]) => ({ name: key, value: String(value) })),
    children,
    selfClosing: children.length === 0,
  };
}

export function text(value) {
  return { type: 'text', value: String(value) };
}

export function getAttr(node, name) {
  const attr = node.attrs && node.attrs.find((a) => a.name === name);
  return attr ? attr.value : undefined;
}

export function setAttr(node, name, value) {
  const attr = node.attrs.find((a) => a.name === name);
  if (attr) {
    if (value === undefined || value === null) node.attrs = node.attrs.filter((a) => a !== attr);
    else attr.value = String(value);
    return;
  }
  if (value === undefined || value === null) return;
  node.attrs.push({ name, value: String(value) });
}

export function child(node, name) {
  if (!node || !node.children) return undefined;
  return node.children.find((c) => c.type === 'element' && c.name === name);
}

export function childrenOf(node, name) {
  if (!node || !node.children) return [];
  return node.children.filter((c) => c.type === 'element' && c.name === name);
}

export function descendants(node, name, out = []) {
  if (!node || !node.children) return out;
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}

/** Ensure a single child element with the given name exists; returns it. */
export function ensureChild(node, name, attrs = {}, prepend = false) {
  const found = child(node, name);
  if (found) return found;
  const created = el(name, attrs);
  if (prepend) node.children.unshift(created);
  else node.children.push(created);
  return created;
}

export function removeChild(node, name) {
  const before = node.children.length;
  node.children = node.children.filter((c) => !(c.type === 'element' && c.name === name));
  return node.children.length !== before;
}

export function cloneNode(node) {
  if (node.type !== 'element') return { ...node };
  return {
    type: 'element',
    name: node.name,
    attrs: node.attrs.map((a) => ({ ...a })),
    children: node.children.map(cloneNode),
    selfClosing: node.selfClosing && node.children.length === 0,
  };
}

export function textContent(node) {
  if (node.type === 'text' || node.type === 'cdata') return node.value;
  if (!node.children) return '';
  return node.children.map(textContent).join('');
}

export function indexOfChild(node, target) {
  return node.children.indexOf(target);
}

export function walk(node, visit, parent = null) {
  if (node.type !== 'element' && node.type !== 'document') return;
  visit(node, parent);
  for (const c of [...node.children]) {
    if (c.type === 'element') walk(c, visit, node);
  }
}
