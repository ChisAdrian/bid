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
