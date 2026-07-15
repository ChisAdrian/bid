# bid

<a href="https://chisadrian.github.io/bid/">Demo </a>

A tiny, explicit reactive binding library for the DOM. No magic, no templates, no build step — just signals and functions.

```text
~2.5 KB gzipped
```

## Philosophy

**Explicit over implicit.**

* `bid="name"` for element identification
* `bindText()`, `bindClick()`, `bindList()` etc.
* No template compiler, no hidden reactivity graph
* You create DOM nodes, you bind signals to them

---

## Quick Start

### CDN (no build)

```html
<script src="[https://cdn.jsdelivr.net/gh/ChisAdrian/bid@main/bid.js](https://cdn.jsdelivr.net/gh/ChisAdrian/bid@main/bid.js)"></script>
<script>
  const { signal, bindText, bindClick } = bid;

  const count = signal(0);
  bindText('counter', count);
  bindClick('inc', () => count.value++);
</script>
```

### ES Module

```javascript
import { signal, bindText, bindClick } from '[https://cdn.jsdelivr.net/gh/ChisAdrian/bid@main/bid.js](https://cdn.jsdelivr.net/gh/ChisAdrian/bid@main/bid.js)';

const count = signal(0);
bindText('counter', count);
bindClick('inc', () => count.value++);
```

```html
<div bid="counter">0</div>
<button bid="inc">+</button>
```

---

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

> ⚠️ **Warning:** If you dynamically create and destroy computed signals, you must manually call `myComputed.dispose()` when you are done with them. Otherwise, they will remain in memory and continue recalculating in the background.

### List Binding (Keyed Diffing)

Render lists with **keyed diffing** — add, remove, reorder without rebuilding the entire DOM. 

#### The Problem

Without keys, every array change destroys and recreates the entire DOM:

```javascript
// NAIVE: innerHTML = array.map(...)
// [A, B, C] → prepend X → destroys A, B, C; creates X, A, B, C
// Result: 4 nodes destroyed, 4 created. Focus lost. State lost.
```

#### The Solution

`bindList` assigns each DOM node a **key** — an ID that survives across updates: If a `keyFn` is not provided in the options, it will fall back to using `createAutoKeyGenerator()`, which generates unique IDs for objects in an array.

```javascript
bindList('list', items, renderFn, {
    keyFn: item => item.id,  // ← each node gets a stable identity
    updateFn: (item, index, el) => { ... } // ← updates existing nodes in place
});
```

#### The Algorithm

1. **Build Map**: `{ id1→nodeA, id2→nodeB, id3→nodeC }` — O(n)
2. **Detect Removed**: keys in DOM but not in new array → remove nodes
3. **Detect Added**: keys in new array but not in DOM → create nodes
4. **Reorder**: `insertBefore()` to match new positions
5. **Update**: call `updateFn(item, index, el)` if provided in the options, to update existing nodes.

#### The Render and Update Signatures

`bindList` splits element creation and updating into two distinct functions:

* **`renderFn`:** `(item, index) => Element`
    * Called only when a node is new. Must return the created `Element`.
* **`updateFn` (Optional):** `(item, index, el) => void`
    * Passed via `options`. Called to update an existing node in place. 

> ⚠️ **Warning:** Do not attach new `bid.bind...` functions inside an `updateFn` block. Only use standard DOM manipulation (e.g., `el.textContent = ...`) when updating existing elements. Binding new signals inside an update loop will cause massive memory leaks.

#### Why Keys Matter

**Without `keyFn` (index as key):**

```text
Array: [A, B, C] → prepend X → [X, A, B, C]
Index:  0   1   2              0   1   2   3
Keys:   0→A, 1→B, 2→C          0→X, 1→A, 2→B, 3→C
Problem: key 0 changed A→X → A destroyed, all nodes shift
```

**With `keyFn: item => item.id`:**

```text
Array: [A, B, C] → prepend X → [X, A, B, C]
IDs:   1,  2,  3              4,  1,  2,  3
Keys:   1→A, 2→B, 3→C         4→X, 1→A, 2→B, 3→C
Result: X created, A/B/C moved. Zero destruction.
```

#### Performance

| Operation | Naive `innerHTML` | `bindList` with keys |
|-----------|-------------------|----------------------|
| Add 1 item | O(n) recreate | O(1) create + insert |
| Remove 1 item | O(n) recreate | O(1) remove |
| Reorder | O(n) recreate | O(n) moves |
| Update text | O(n) recreate | O(1) `textContent` |

With 1000 items: naive destroys ~1000 nodes per change. `bindList` touches exactly what changed.

---

## API Reference

### Core

| Function | Description |
|----------|-------------|
| `signal(value)` | Create a reactive signal |
| `computed(deps, fn)` | Create a derived signal |
| `batch(fn)` | Batch multiple updates |
| `createAutoKeyGenerator()` | Creates a function that generates unique IDs for objects in an array. |

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
| `bindContextMenu`, `bindWheel` | Context menu and wheel events |
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
| `bindList(sel, sig, renderFn, options?)` | Keyed list rendering. Returns `{ signal, rerender, replaceAll }` |
| `unbind(selector)` | Remove all bindings from element |
| `unbindAll(container?)` | Remove all bindings in container |
| `escapeHtml(str)` | Escape HTML entities |

### Devtools

| Function | Description |
|----------|-------------|
| `__core.getBatchDepth()` | Returns the current batch depth level |
| `__core.getPendingEffects()` | Returns the number of effects waiting in the queue |

---

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

bindList('todo-list', todos, (item, index) => {
  // Node is new — CREATE it
  const li = document.createElement('li');
  li.className = item.done ? 'done' : '';
  li.innerHTML = `
    <input type="checkbox" ${item.done ? 'checked' : ''}>
    <span>${escapeHtml(item.text)}</span>
    <button>×</button>
  `;
  return li;
}, { 
  keyFn: item => item.id,
  updateFn: (item, index, existing) => {
    // Node exists — UPDATE in place, don't recreate!
    existing.querySelector('span').textContent = item.text;
    existing.querySelector('input').checked = item.done;
    existing.classList.toggle('done', item.done);
  }
});
```

### Data Table

```javascript
const headers = signal(['ID', 'Name', 'Email']);
const users = signal([
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' }
]);

// thead (uses default auto-keying if keyFn is omitted)
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

---

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

---

## Size Comparison

| Library | Gzipped | Notes |
|---------|---------|-------|
| **bid** | ~2.5 KB | Signals + DOM bindings |
| @maverick-js/signals | ~1 KB | Signals only, no DOM |
| Petite-Vue | ~6 KB | Vue templates, no build |
| Alpine.js | ~15 KB | Declarative attributes |

## License

MIT
