import assert from 'node:assert';

// 最小 React 替身：只验证组件函数能构成元素树，不做真实渲染
class Component {
  constructor(props) {
    this.props = props || {};
    this.state = {};
  }
  setState(patch) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
  }
}
const React = {
  Component,
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
};
globalThis.React = React;

const styleNodes = [];
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '' }),
  head: { appendChild: (node) => styleNodes.push(node) },
};

let definition;
globalThis.window = { __ModuleLoader__: { load: (def) => (definition = def) } };

await import('../lib/client.js');
assert.ok(definition, '客户端 bundle 调用了 __ModuleLoader__.load');
assert.equal(definition.id, 'fontcraft', 'bundle id 必须等于包名');

const exportsObj = definition.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`不允许的 require：${name}`);
});
assert.equal(typeof exportsObj.apply, 'function', '导出 apply');
assert.deepEqual(exportsObj.inject, ['slots'], '导出 inject');

const registrations = [];
const ctx = {
  slots: {
    inject(key) {
      registrations.push({ phase: 'inject', key });
    },
    register(options, component) {
      registrations.push({ phase: 'register', key: options.name, id: options.id, order: options.order, component });
      return () => {};
    },
  },
};
// inject 的回调由插槽持有者在插槽可用时调用
ctx.slots.inject = (key, callback) => {
  registrations.push({ phase: 'inject', key });
  callback();
};
exportsObj.apply(ctx);

assert.equal(registrations.filter((r) => r.phase === 'inject').length, 1, '注入 1 个插槽');
const registration = registrations.find((r) => r.component);
assert.equal(registration.key, 'conversation.input.left', '注册到输入框左侧');
assert.equal(registration.id, 'fontcraft');
assert.ok(styleNodes.length >= 1, '注入了样式表');

const tree = registration.component();
const flat = JSON.stringify(tree);
assert.match(flat, /fc-trigger/, '按钮带样式类');
assert.match(flat, /排版/, '按钮文字');

console.log('button tree ok, style bytes:', styleNodes[0].textContent.length);
console.log('CLIENT BUNDLE TESTS PASSED');
