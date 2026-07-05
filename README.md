# bid

A tiny, explicit reactive binding library for the DOM. No magic, no templates, no build step — just signals and functions.

```
~2.5 KB gzipped
```

## Philosophy

**Explicit over implicit.**

- `bid="name"` for element identification
- `bindText()`, `bindClick()`, `bindList()` etc.
- No template compiler, no hidden reactivity graph
- You create DOM nodes, you bind signals to them

## Quick Start

### CDN (no build)

```html
<script src="https://cdn.jsdelivr.net/gh/ChisAdrian/bid@main/bid.js"></script>
<script>
  const { signal, bindText, bindClick } = bid;

  const count = signal(0);
  bindText('counter', count);
  bindClick('inc', () => count.value++);
</script>
```

### ES Module

```javascript
import { signal, bindText, bindClick } from 'https://cdn.jsdelivr.net/gh/ChisAdrian/bid@main/bid.js';

const count = signal(0);
bindText('counter', count);
bindClick('inc', () => count.value++);
```

```html
<div bid="counter">0</div>
<button bid="inc">+</button>
```

## Core Concepts

### Signal

A reactive value container. Change it, and every binding updates.

```javascript
const name = signal('Alice');
name.value = 'Bob';  // all subscribers notified
```

### Batching

Group multiple signal changes into a single DOM update.

```javascript
batch(() => {
  count.value++;
  count.value++;
  count.value++;
});
// DOM updates once, not three times
```

### Computed

Derived signals that recompute lazily.

```javascript
const fullName = computed([firstName, lastName], () => {
  return firstName.peek() + ' ' + lastName.peek();
});
```

### List Binding

Render lists with keyed diffing — add, remove, reorder without rebuilding the entire DOM.

```javascript
bindList('todo-list', todos, (item, index, existing) => {
  if (existing) {
    existing.querySelector('span').textContent = item.text;
    return existing;
  }
  const li = document.createElement('li');
  li.innerHTML = `<span>${escapeHtml(item.text)}</span>`;
  return li;
}, { keyFn: item => item.id });
```

## API Reference

### Core

| Function | Description |
|----------|-------------|
| `signal(value)` | Create a reactive signal |
| `computed(deps, fn)` | Create a derived signal |
| `batch(fn)` | Batch multiple updates |

### State Bindings

| Function | Description |
|----------|-------------|
| `bindText(sel, sig, format?)` | Bind signal to `textContent` |
| `bindHtml(sel, sig, format?)` | Bind signal to `innerHTML` (unsafe) |
| `bindClass(sel, sig, class, condition?)` | Toggle CSS class |
| `bindAttr(sel, attr, sig, condition?)` | Toggle attribute |
| `bindProp(sel, prop, sig, condition?)` | Set property |
| `bindStyle(sel, prop, sig, format?)` | Set inline style |

### Two-Way Bindings

| Function | Description |
|----------|-------------|
| `bindValue(sel, sig, event?)` | Bind `<input>`, `<textarea>` |
| `bindInput(sel, sig, event?)` | Alias for `bindValue` |
| `bindCheckbox(sel, sig)` | Bind `<input type="checkbox">` |
| `bindSelect(sel, sig)` | Bind `<select>` |
| `bindRadio(sel, sig)` | Bind `<input type="radio">` group |

### Event Bindings

| Function | Description |
|----------|-------------|
| `bindEvent(sel, type, handler, options?)` | Generic event binding |
| `bindClick(sel, handler)` | Click event |
| `bindDblClick(sel, handler)` | Double click |
| `bindMouseEnter`, `bindMouseLeave`, `bindMouseOver`, `bindMouseOut`, `bindMouseDown`, `bindMouseUp`, `bindMouseMove` | Mouse events |
| `bindKeyDown`, `bindKeyUp`, `bindKeyPress` | Keyboard events |
| `bindChange`, `bindSubmit`, `bindFocus`, `bindBlur`, `bindFocusIn`, `bindFocusOut`, `bindReset` | Form events |
| `bindDrag`, `bindDragStart`, `bindDragEnd`, `bindDragEnter`, `bindDragLeave`, `bindDragOver`, `bindDrop` | Drag events |
| `bindTouchStart`, `bindTouchEnd`, `bindTouchMove`, `bindTouchCancel` | Touch events (passive) |
| `bindResize(handler)` | Window resize |
| `bindScroll(handler)` | Window scroll |
| `bindLoad(handler)` | Window load |
| `bindDOMContentLoaded(handler)` | DOM ready |

### List & Cleanup

| Function | Description |
|----------|-------------|
| `bindList(sel, sig, renderFn, options?)` | Keyed list rendering |
| `unbind(selector)` | Remove all bindings from element |
| `unbindAll(container?)` | Remove all bindings in container |
| `escapeHtml(str)` | Escape HTML entities |

## Examples

### Counter with Computed

```javascript
const count = signal(0);
const doubled = computed([count], () => count.peek() * 2);

bindText('count', count);
bindText('doubled', doubled);
bindClick('inc', () => count.value++);
bindClick('dec', () => count.value--);
```

### Todo List

```javascript
const todos = signal([
  { id: 1, text: 'Learn bid', done: false },
  { id: 2, text: 'Build something', done: true }
]);

bindList('todo-list', todos, (item, index, existing) => {
  if (existing) {
    existing.querySelector('span').textContent = item.text;
    existing.querySelector('input').checked = item.done;
    existing.classList.toggle('done', item.done);
    return existing;
  }
  const li = document.createElement('li');
  li.className = item.done ? 'done' : '';
  li.innerHTML = `
    <input type="checkbox" ${item.done ? 'checked' : ''}>
    <span>${escapeHtml(item.text)}</span>
    <button>×</button>
  `;
  // ...attach internal event listeners
  return li;
}, { keyFn: item => item.id });
```

### Data Table

```javascript
const headers = signal(['ID', 'Name', 'Email']);
const users = signal([
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' }
]);

// thead
bindList('thead', headers, text => {
  const th = document.createElement('th');
  th.textContent = text;
  return th;
});

// tbody
bindList('tbody', users, user => {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${escapeHtml(user.id)}</td>
    <td>${escapeHtml(user.name)}</td>
    <td>${escapeHtml(user.email)}</td>
  `;
  return tr;
}, { keyFn: u => u.id });
```

### Cleanup

```javascript
// Remove a single widget's bindings
unbind('#widget-1');

// Nuke everything in a container
unbindAll('#app');
```

## Selector Resolution

`bid` resolves selectors in this order:

1. `bid="name"` attribute
2. `id` (with or without `#`)
3. CSS selector

```html
<div bid="myDiv"></div>
<div id="myDiv"></div>
```

```javascript
bindText('myDiv', signal);  // matches [bid="myDiv"] first
bindText('#myDiv', signal); // matches id
bindText('.item', signal);  // matches CSS selector
```

## Size Comparison

| Library | Gzipped | Notes |
|---------|---------|-------|
| **bid** | ~2.5 KB | Signals + DOM bindings |
| @maverick-js/signals | ~1 KB | Signals only, no DOM |
| Petite-Vue | ~6 KB | Vue templates, no build |
| Alpine.js | ~15 KB | Declarative attributes |

## License

MIT
