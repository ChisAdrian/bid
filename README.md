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

`bindList` assigns each DOM node a **key** — an ID that survives across updates:

```javascript
bindList('list', items, renderFn, {
    keyFn: item => item.id   // ← each node gets a stable identity
});
```

#### The Algorithm

1. **Build Map**: `{ id1→nodeA, id2→nodeB, id3→nodeC }` — O(n)
2. **Detect Removed**: keys in DOM but not in new array → remove nodes
3. **Detect Added**: keys in new array but not in DOM → create nodes
4. **Reorder**: `insertBefore()` to match new positions
5. **Update**: call `renderFn(item, index, existing)` for existing nodes

#### The `renderFn` Signature

```javascript
(item, index, existing) => Element
```

| `existing` | Action |
|------------|--------|
| `null` / `undefined` | **Create** new DOM node |
| `Element` | **Update** existing node in place, return it |

#### Why Keys Matter

**Without `keyFn` (index as key):**

```
Array: [A, B, C] → prepend X → [X, A, B, C]
Index:  0   1   2              0   1   2   3
Keys:   0→A, 1→B, 2→C          0→X, 1→A, 2→B, 3→C
Problem: key 0 changed A→X → A destroyed, all nodes shift
```

**With `keyFn: item => item.id`:**

```
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

#### Example

```javascript
bindList('todo-list', todos, (item, index, existing) => {
  if (existing) {
    // Node exists — UPDATE in place, don't recreate!
    existing.querySelector('span').textContent = item.text;
    existing.querySelector('input').checked = item.done;
    return existing;
  }
  // Node is new — CREATE it
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

# bid API Reference

Complete reference for all functions, types, and behaviors in bid v1.0.

---

## Table of Contents

- [Core](#core)
- [State Bindings](#state-bindings)
- [Two-Way Bindings](#two-way-bindings)
- [Event Bindings](#event-bindings)
- [Global Event Bindings](#global-event-bindings)
- [List Binding](#list-binding)
- [Computed](#computed)
- [Batching](#batching)
- [Cleanup](#cleanup)
- [Utilities](#utilities)
- [Selector Resolution](#selector-resolution)

---

## Core

### `signal(initialValue)`

Creates a reactive signal. Changing its `.value` notifies all subscribers.

```javascript
const count = signal(0);
count.value = 5; // all subscribers notified
```

**Returns:** `Signal<T>`

| Property | Type | Description |
|----------|------|-------------|
| `.value` | `T` | Get/set current value |
| `.subscribe(fn)` | `(T) => () => void` | Subscribe to changes, returns unsubscribe |
| `.peek()` | `() => T` | Read value without subscribing |

**Implementation detail:** Uses `Set` for O(1) subscribe/unsubscribe.

---

## State Bindings

All state bindings return the signal object for chaining.

### `bindText(selector, signal, format?)`

Binds signal to `element.textContent`.

```javascript
bindText('counter', count);
bindText('greeting', name, n => 'Hello, ' + n);
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `selector` | `string \| Element` | — | Target element |
| `signal` | `Signal<T>` | — | Source signal |
| `format` | `(T) => string` | `String` | Optional formatter |

---

### `bindHtml(selector, signal, format?)`

Binds signal to `element.innerHTML`. **Unsafe** — use `bindText` or sanitize.

```javascript
bindHtml('content', htmlSignal);
// Console warning: "bindHtml() is potentially unsafe"
```

---

### `bindClass(selector, signal, className, condition?)`

Toggles a CSS class based on signal value.

```javascript
bindClass('modal', isOpen, 'visible');
bindClass('status', count, 'warning', n => n > 10);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `condition` | `(T) => boolean` | Optional, defaults to `Boolean(signal.value)` |

---

### `bindAttr(selector, attr, signal, condition?)`

Sets or removes an attribute.

```javascript
bindAttr('input', 'disabled', isLoading); // boolean toggle
bindAttr('link', 'href', urlSignal);        // string value
```

**Behavior:**
- `false` / `null` / `undefined` → removes attribute
- `true` → sets empty attribute (`disabled=""`)
- other → sets string value

---

### `bindProp(selector, prop, signal, condition?)`

Sets a DOM property (not attribute).

```javascript
bindProp('video', 'currentTime', timeSignal);
bindProp('checkbox', 'indeterminate', partialSignal);
```

---

### `bindStyle(selector, prop, signal, format?)`

Sets an inline style property.

```javascript
bindStyle('progress', 'width', percent, p => p + '%');
bindStyle('alert', 'backgroundColor', status, s => s === 'error' ? 'red' : 'green');
```

---

## Two-Way Bindings

### `bindValue(selector, signal, eventType?)`

Two-way binding for `<input>`, `<textarea>`, `<select>`.

```javascript
bindValue('name-input', name);           // default: 'input' event
bindValue('search', query, 'change');    // debounced on change
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `eventType` | `string` | `'input'` | Event that triggers write-back |

---

### `bindInput(selector, signal, eventType?)`

Alias for `bindValue`.

---

### `bindCheckbox(selector, signal)`

Two-way binding for `<input type="checkbox">`.

```javascript
bindCheckbox('agree', termsAccepted);
```

---

### `bindSelect(selector, signal)`

Two-way binding for `<select>`.

```javascript
bindSelect('country', selectedCountry);
```

---

### `bindRadio(selector, signal)`

Two-way binding for a group of `<input type="radio">`.

```javascript
// All radios with name="plan" or matching selector
bindRadio('[name="plan"]', selectedPlan);
```

**Note:** Selector must match all radios in the group.

---

## Event Bindings

### `bindEvent(selector, type, handler, options?)`

Generic event binding. All shortcuts use this internally.

```javascript
bindEvent('canvas', 'mousemove', e => {
    console.log(e.clientX, e.clientY);
}, { passive: true });
```

---

### Mouse Events

| Function | Event |
|----------|-------|
| `bindClick(sel, handler)` | `click` |
| `bindDblClick(sel, handler)` | `dblclick` |
| `bindMouseEnter(sel, handler)` | `mouseenter` |
| `bindMouseLeave(sel, handler)` | `mouseleave` |
| `bindMouseOver(sel, handler)` | `mouseover` |
| `bindMouseOut(sel, handler)` | `mouseout` |
| `bindMouseDown(sel, handler)` | `mousedown` |
| `bindMouseUp(sel, handler)` | `mouseup` |
| `bindMouseMove(sel, handler)` | `mousemove` |
| `bindContextMenu(sel, handler)` | `contextmenu` |
| `bindWheel(sel, handler)` | `wheel` |

---

### Keyboard Events

| Function | Event |
|----------|-------|
| `bindKeyDown(sel, handler)` | `keydown` |
| `bindKeyUp(sel, handler)` | `keyup` |
| `bindKeyPress(sel, handler)` | `keypress` |

---

### Form Events

| Function | Event |
|----------|-------|
| `bindChange(sel, handler)` | `change` |
| `bindSubmit(sel, handler)` | `submit` |
| `bindFocus(sel, handler)` | `focus` |
| `bindBlur(sel, handler)` | `blur` |
| `bindFocusIn(sel, handler)` | `focusin` |
| `bindFocusOut(sel, handler)` | `focusout` |
| `bindReset(sel, handler)` | `reset` |

---

### Drag Events

| Function | Event |
|----------|-------|
| `bindDrag(sel, handler)` | `drag` |
| `bindDragStart(sel, handler)` | `dragstart` |
| `bindDragEnd(sel, handler)` | `dragend` |
| `bindDragEnter(sel, handler)` | `dragenter` |
| `bindDragLeave(sel, handler)` | `dragleave` |
| `bindDragOver(sel, handler)` | `dragover` |
| `bindDrop(sel, handler)` | `drop` |

---

### Touch Events (passive by default)

| Function | Event |
|----------|-------|
| `bindTouchStart(sel, handler)` | `touchstart` |
| `bindTouchEnd(sel, handler)` | `touchend` |
| `bindTouchMove(sel, handler)` | `touchmove` |
| `bindTouchCancel(sel, handler)` | `touchcancel` |

---

## Global Event Bindings

These attach to `window` or `document`, not to elements. They return the target object.

| Function | Target | Typical Use |
|----------|--------|-------------|
| `bindResize(handler)` | `window` | Responsive layout |
| `bindScroll(handler)` | `window` | Infinite scroll, parallax |
| `bindLoad(handler)` | `window` | Post-resource initialization |
| `bindDOMContentLoaded(handler)` | `document` | Early DOM initialization |

```javascript
// Responsive sidebar
const width = signal(window.innerWidth);
bindResize(() => width.value = window.innerWidth);
bindClass('sidebar', width, 'collapsed', w => w < 768);

// Infinite scroll
bindScroll(() => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
        loadMore();
    }
});
```

**Note:** These do not return unsubscribe functions. For manual cleanup:
```javascript
const handler = () => { ... };
bindResize(handler);
window.removeEventListener('resize', handler);
```

---

## List Binding

### `bindList(selector, signal, renderFn, options?)`

Renders a list with keyed diffing — add, remove, reorder without rebuilding the entire DOM.

```javascript
bindList('todo-list', todos, (item, index, existing) => {
    if (existing) {
        // Update in place
        existing.querySelector('span').textContent = item.text;
        existing.querySelector('input').checked = item.done;
        return existing;
    }
    // Create new
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(item.text)}</span>`;
    return li;
}, { keyFn: item => item.id });
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `renderFn` | `(item, index, existing?) => Element` | Create or update node |
| `options.keyFn` | `(item, index) => string \| number` | Stable identity for diffing |

**RenderFn behavior:**
- `existing` is `null` → create new DOM node
- `existing` is `Element` → update in place, return it

**Algorithm:** O(n) — builds Map once, then create/move/update/remove.

---

## Computed

### `computed(dependencies, computeFn)`

Derived signal that recomputes lazily when dependencies change.

```javascript
const fullName = computed([firstName, lastName], () => {
    return firstName.peek() + ' ' + lastName.peek();
});

bindText('fullname', fullName);
```

| Property | Description |
|----------|-------------|
| `.value` | Read current value (triggers recompute if stale) |
| `.subscribe(fn)` | Subscribe to changes |
| `.peek()` | Read without subscribing (triggers recompute if stale) |
| `.dispose()` | Unsubscribe from all dependencies |

**Important:** Call `.dispose()` when the computed is no longer needed to prevent memory leaks.

---

## Batching

### `batch(fn)`

Groups multiple signal changes into a single DOM update flush.

```javascript
batch(() => {
    count.value++;
    count.value++;
    count.value++;
});
// DOM updates once, not three times
```

**Nested batches:** Safe — only the outermost batch triggers flush.

---

## Cleanup

### `unbind(selector)`

Removes all bindings and event listeners from an element and its descendants.

```javascript
unbind('#modal');
```

---

### `unbindAll(container?)`

Removes all bindings within a container (defaults to `document`).

```javascript
unbindAll('#app');
```

---

### `unbindSubTree(element)`

Internal cleanup function. Removes bindings and handlers from element + descendants.

---

## Utilities

### `getElement(selector)`

Resolves a selector to a DOM element.

**Resolution order:**
1. `bid="name"` attribute
2. `id` (with or without `#`)
3. CSS selector

```javascript
getElement('myDiv');     // [bid="myDiv"]
getElement('#myDiv');    // getElementById
getElement('.item');       // querySelector
```

---

### `getElements(selector)`

Resolves a selector to a NodeList or array of elements.

**Resolution order:**
1. `bid="name"` (returns NodeList)
2. CSS selector (returns NodeList)

---

### `escapeHtml(str)`

Escapes HTML entities for safe insertion.

```javascript
escapeHtml('<script>'); // &lt;script&gt;
```

| Input | Output |
|-------|--------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#39;` |

**Always use when interpolating user input into HTML strings.**

---

## Selector Resolution

```html
<div bid="counter">0</div>
<div id="status">Idle</div>
<div class="item">Item 1</div>
```

```javascript
bindText('counter', count);   // matches [bid="counter"]
bindText('status', status);   // matches #status
bindText('.item', item);      // matches .item (first)
```

**Complex selectors** (containing spaces, `>`, `+`, `~`, `[`, `.`, `#`, `:`) skip `bid` and `id` lookups and go directly to `querySelector`.

```javascript
bindText('.list > li:first-child', firstItem);  // CSS selector directly
```

---

## TypeScript

```typescript
import { signal, bindText, bindClick, computed, bindList } from 'bid';

const count: Signal<number> = signal(0);
const doubled: ReadonlySignal<number> = computed([count], () => count.peek() * 2);

bindText('counter', count);
bindClick('inc', () => count.value++);
```

See `bid.d.ts` for complete type definitions.

