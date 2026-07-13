(function(global) {
    'use strict';

    // =============================================
    // INTERNALS & STORAGE
    // =============================================
    let batchDepth = 0;
    const pendingEffects = new Map();
    const elementBindings = new WeakMap();
    const elementHandlers = new WeakMap();

    // Queues up a UI update if we are batching, otherwise runs it immediately
    function scheduleEffect(sub, arg) {
        if (batchDepth > 0) {
            pendingEffects.set(sub, arg);
        } else {
            sub.fn(arg);
        }
    }

    // Runs all the queued updates at once, then empties the queue
    function flushEffects() {
        batchDepth++;
        try {
            while (pendingEffects.size > 0) {
                const entries = Array.from(pendingEffects.entries());
                pendingEffects.clear();
                entries.forEach(([sub, arg]) => sub.fn(arg));
            }
        } finally {
            batchDepth--;
        }
    }

    // Remembers a cleanup function (unsubscribe) for a specific DOM element
    function trackBinding(el, unsubscribe) {
        if (!elementBindings.has(el)) {
            elementBindings.set(el, new Set());
        }
        elementBindings.get(el).add(unsubscribe);
    }

    // Runs and removes all saved cleanup functions for a given element
    function untrackBindings(el) {
        const bindings = elementBindings.get(el);
        if (bindings) {
            bindings.forEach(unsub => unsub());
            elementBindings.delete(el);
        }
    }

    // Saves event listener details so we can cleanly remove them later
    function trackHandler(el, type, handler, options) {
        if (!elementHandlers.has(el)) {
            elementHandlers.set(el, []);
        }
        elementHandlers.get(el).push({ type, handler, options });
    }

    // Removes all tracked event listeners from an element
    function purgeHandlers(el) {
        const handlers = elementHandlers.get(el);
        if (handlers) {
            handlers.forEach(h => el.removeEventListener(h.type, h.handler, h.options));
            elementHandlers.delete(el);
        }
    }

    // =============================================
    // CLEANUP MECHANICS
    // =============================================
    
    // Completely unbinds an element and all of its children to prevent memory leaks
    function unbindSubTree(el) {
        untrackBindings(el);
        purgeHandlers(el);
        el.querySelectorAll('*').forEach(child => {
            untrackBindings(child);
            purgeHandlers(child);
        });
    }

    // =============================================
    // AUTO-CLEANUP (MutationObserver)
    // =============================================
    if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
        const domObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    // Only unbind nodes that are truly disconnected
                    if (!node.isConnected) {
                        unbindSubTree(node);
                    }
                });
            });
        });

        // Helper to kick off the DOM observer once the body is ready
        const startObserver = () => {
            domObserver.observe(document.body, { childList: true, subtree: true });
        };

        if (document.body) {
            startObserver();
        } else {
            document.addEventListener('DOMContentLoaded', startObserver);
        }
    }

    // =============================================
    // CORE: Signal
    // =============================================
    
    // Creates a reactive state container that alerts subscribers when its value changes
    function signal(initialValue) {
        let value = initialValue;
        const subscribers = new Set();

        return {
            get value() { return value; },
            set value(newValue) {
                if (!Object.is(value, newValue)) {
                    value = newValue;
                    subscribers.forEach(sub => scheduleEffect(sub, value));
                }
            },
            // Adds a function to run whenever the value changes
            subscribe(fn) {
                const sub = { fn };
                subscribers.add(sub);
                return () => { subscribers.delete(sub); }; // Returns an unsubscribe function
            },
            // Lets you read the value without triggering anything
            peek() { return value; }
        };
    }

    // =============================================
    // BATCHING
    // =============================================
    
    // Pauses UI updates while running multiple signal changes, updating all at once at the end
    function batch(fn) {
        batchDepth++;
        try {
            fn();
        } finally {
            batchDepth--;
            if (batchDepth === 0) flushEffects();
        }
    }

    // =============================================
    // CORE: Element Selection
    // =============================================
    
    // Finds a single DOM element using a 'bid' attribute, ID, or CSS selector
    function getElement(selector) {
        if (selector instanceof Element) return selector;
        if (typeof selector === 'string') {
            const isComplexCss = /[\s>+~.[#:]/.test(selector);
            if (!isComplexCss) {
                const bidEl = document.querySelector('[bid="' + selector + '"]');
                if (bidEl) return bidEl;

                const id = selector.startsWith('#') ? selector.slice(1) : selector;
                const idEl = document.getElementById(id);
                if (idEl) return idEl;
            }

            const cssEl = document.querySelector(selector);
            if (cssEl) return cssEl;
            throw new Error('Element "' + selector + '" not found');
        }

        throw new Error('Invalid selector: ' + selector);
    }

    // Finds multiple DOM elements, similar to getElement but returns a list
    function getElements(selector) {
        if (selector instanceof NodeList) return selector;
        if (selector instanceof Element) return [selector];

        if (typeof selector === 'string') {
            const isComplexCss = /[\s>+~.[#:]/.test(selector);
            if (!isComplexCss) {
                const bidEls = document.querySelectorAll('[bid="' + selector + '"]');
                if (bidEls.length > 0) return bidEls;
            }

            const cssEls = document.querySelectorAll(selector);
            if (cssEls.length > 0) return cssEls;

            throw new Error('Elements "' + selector + '" not found');
        }

        throw new Error('Invalid selector: ' + selector);
    }

    // Converts unsafe text characters to HTML entities to stop XSS vulnerabilities
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =============================================
    // STATE BINDINGS
    // =============================================
    
    // Connects a signal to an element's text content (one-way)
    function bindText(selector, signalObj, format) {
        const el = getElement(selector);
        const update = val => el.textContent = format ? format(val) : val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    // Connects a signal to an element's raw HTML content (Warning: Can be unsafe!)
    function bindHtml(selector, signalObj, format) {
        console.warn('bindHtml() is potentially unsafe. Use bindText() or sanitize your HTML.');
        const el = getElement(selector);
        const update = val => el.innerHTML = format ? format(val) : val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    // Toggles a CSS class on an element based on a signal's true/false value
    function bindClass(selector, signalObj, className, condition) {
        const el = getElement(selector);
        const update = val => el.classList.toggle(className, condition ? condition(val) : val);
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    // Connects a signal to a specific HTML attribute (like 'href' or 'disabled')
    function bindAttr(selector, attr, signalObj, condition) {
        const el = getElement(selector);
        const update = val => {
            const result = condition ? condition(val) : val;
            if (result === false || result === null || result === undefined) {
                el.removeAttribute(attr);
            } else {
                el.setAttribute(attr, result === true ? '' : result);
            }
        };
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    // Connects a signal directly to a JavaScript property on a DOM element object
    function bindProp(selector, prop, signalObj, condition) {
        const el = getElement(selector);
        const update = val => el[prop] = condition ? condition(val) : val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    // Connects a signal to a specific inline CSS style property
    function bindStyle(selector, styleProp, signalObj, format) {
        const el = getElement(selector);
        const update = val => el.style[styleProp] = format ? format(val) : val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    // =============================================
    // TWO-WAY BINDINGS
    // =============================================
    
    // Binds an input field so UI updates the signal, and the signal updates the UI
    function bindValue(selector, signalObj, eventType) {
        eventType = eventType || 'input';
        const el = getElement(selector);

        const update = val => { if (el.value !== val) el.value = val; };
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));

        const handler = e => { signalObj.value = e.target.value; };
        el.addEventListener(eventType, handler);
        trackHandler(el, eventType, handler);

        return signalObj;
    }

    // Helper specific to standard text inputs
    function bindInput(selector, signalObj) {
        return bindValue(selector, signalObj, 'input');
    }

    // Helper specific to checkbox inputs (uses 'checked' instead of 'value')
    function bindCheckbox(selector, signalObj) {
        const el = getElement(selector);
        const update = val => el.checked = !!val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));

        const handler = e => { signalObj.value = e.target.checked; };
        el.addEventListener('change', handler);
        trackHandler(el, 'change', handler);

        return signalObj;
    }

    // Helper specific to dropdown <select> menus
    function bindSelect(selector, signalObj) {
        const el = getElement(selector);
        const update = val => el.value = val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));

        const handler = e => { signalObj.value = e.target.value; };
        el.addEventListener('change', handler);
        trackHandler(el, 'change', handler);

        return signalObj;
    }

    // Helper specific to a group of radio buttons
    function bindRadio(selector, signalObj) {
        const els = getElements(selector);
        const handler = e => { if (e.target.checked) signalObj.value = e.target.value; };
        els.forEach(el => {
            const update = val => el.checked = (el.value === val);
            update(signalObj.value);

            const unsub = signalObj.subscribe(update);

            trackBinding(el, unsub);
            el.addEventListener('change', handler);
            trackHandler(el, 'change', handler);
        });
        return signalObj;
    }

    // =============================================
    // EVENT BINDINGS
    // =============================================
    
    // Attaches a DOM event listener and tracks it so it can be cleaned up later
    function bindEvent(selector, eventType, handler, options) {
        if (options === undefined || options === null) {
            options = {};
        }
        const el = getElement(selector);
        el.addEventListener(eventType, handler, options);
        trackHandler(el, eventType, handler, options);
        return el;
    }

    // =============================================
    // COMPUTED
    // =============================================
    
    // Creates a read-only signal that recalculates itself automatically when its dependencies change
    function computed(dependencies, computeFn) {
        let value;
        let isStale = true;
        const result = signal(undefined);

        // Runs the math/logic to figure out the new value
        function recompute() {
            if (!isStale) return;
            const newValue = computeFn();
            if (!Object.is(value, newValue)) {
                value = newValue;
                result.value = value;
            }
            isStale = false;
        }

        const recomputeSub = { fn: recompute };
        const unsubs = dependencies.map(dep => dep.subscribe(() => {
            if (!isStale) {
                isStale = true;
                scheduleEffect(recomputeSub);
            }
        }));
        
        return {
            get value() {
                if (isStale) recompute();
                return value;
            },
            set value(v) { throw new Error('Cannot set value of a computed signal'); },
            subscribe(fn) {
                recompute();
                return result.subscribe(fn);
            },
            peek() {
                if (isStale) recompute();
                return value;
            },
            dispose() { unsubs.forEach(u => u()); }
        };
    }

    // =============================================
    // AUTO-KEY GENERATOR
    // =============================================
    
    // Creates a function that generates unique IDs for objects in an array (used for list rendering)
    function createAutoKeyGenerator() {
        const ids = new WeakMap();
        let counter = 0;
        let warnedPrimitive = false;

        // Generates or fetches the unique ID for a specific list item
        return function autoKey(item, index) {
            if (item !== null && (typeof item === 'object' || typeof item === 'function')) {
                let id = ids.get(item);
                if (id === undefined) {
                    id = '__autokey_' + (++counter);
                    ids.set(item, id);
                }
                return id;
            }
            if (!warnedPrimitive) {
                warnedPrimitive = true;
                console.warn(
                    'bid.js: autoKey() received a primitive list item ' +
                    '(no object identity to key on). Falling back to ' +
                    'value+index. Pass options.keyFn for reorder-safe ' +
                    'primitive lists (e.g. keyFn: (item, i) => item).'
                );
            }
            return 'prim_' + index + '_' + item;
        };
    }

    // =============================================
    // LIST BINDING
    // =============================================
    
    // Connects an array signal to a DOM container, automatically rendering and updating elements
    function bindList(containerSelector, arraySignal, renderFn, options) {
        options = options || {};
        const container = getElement(containerSelector);
        const windowFn = options.windowFn || (arr => arr);
        const updateFn = options.updateFn || null;
        const keyFn = options.keyFn || createAutoKeyGenerator();

        Array.from(container.children).forEach(child => unbindSubTree(child));

        // Intelligently syncs the DOM with the new array (adding/removing/moving items)
        function update(fullArr) {
            const arr = windowFn(fullArr);
            const existing = Array.from(container.children);
            const newKeys = arr.map((item, i) => keyFn(item, i));
            const elMap = new Map();
            
            existing.forEach(el => {
                if (elMap.has(el._bidKey)) {
                    console.error(
                        'bid.js: duplicate key detected in bindList ("' +
                        el._bidKey + '"). Removing the stale duplicate to ' +
                        'avoid an orphaned, still-bound node. Ensure keyFn ' +
                        '(or your item identities) return unique values.'
                    );
                    unbindSubTree(el);
                    el.remove();
                    return;
                }
                elMap.set(el._bidKey, el);
            });
            
            const newKeySet = new Set(newKeys);
            elMap.forEach((el, key) => {
                if (!newKeySet.has(key)) {
                    unbindSubTree(el);
                    el.remove();
                }
            });
            
            arr.forEach((item, index) => {
                const key = newKeys[index];
                let el = elMap.get(key);

                if (!el) {
                    el = renderFn(item, index);
                    el._bidKey = key;
                } else if (updateFn) {
                    updateFn(item, index, el);
                }

                const targetChild = container.children[index];
                if (targetChild !== el) {
                    container.insertBefore(el, targetChild || null);
                }
            });
        }

        // Deletes everything and re-renders the list from scratch
        function replaceAll(fullArr) {
            Array.from(container.children).forEach(child => {
                unbindSubTree(child);
                child.remove();
            });
            
            const arr = windowFn(fullArr !== undefined ? fullArr : arraySignal.peek());
            const frag = document.createDocumentFragment();
            
            arr.forEach((item, index) => {
                const el = renderFn(item, index);
                el._bidKey = keyFn(item, index);
                frag.appendChild(el);
            });
            
            container.appendChild(frag);
        }

        update(arraySignal.value);
        const unsub = arraySignal.subscribe(update);
        trackBinding(container, unsub);
        const rerender = () => update(arraySignal.peek());

        return { signal: arraySignal, rerender, replaceAll };
    }

    // =============================================
    // UNBIND FUNCTIONS
    // =============================================
    
    // Manually disconnects a specific element from the reactive system
    function unbind(selector) {
        unbindSubTree(getElement(selector));
    }

    // Disconnects everything inside a container (defaults to cleaning up the whole document)
    function unbindAll(container) {
        container = container || document;
        unbindSubTree(container);
    }

    // =============================================
    // EVENT SHORTCUTS
    // =============================================
    const shortcuts = [
        ['bindClick', 'click'], ['bindDblClick', 'dblclick'], ['bindMouseEnter', 'mouseenter'],
        ['bindMouseLeave', 'mouseleave'], ['bindMouseOver', 'mouseover'], ['bindMouseOut', 'mouseout'],
        ['bindMouseDown', 'mousedown'], ['bindMouseUp', 'mouseup'], ['bindMouseMove', 'mousemove'],
        ['bindContextMenu', 'contextmenu'], ['bindWheel', 'wheel'], ['bindKeyDown', 'keydown'],
        ['bindKeyUp', 'keyup'], ['bindKeyPress', 'keypress'], ['bindChange', 'change'],
        ['bindSubmit', 'submit'], ['bindFocus', 'focus'], ['bindBlur', 'blur'],
        ['bindFocusIn', 'focusin'], ['bindFocusOut', 'focusout'], ['bindReset', 'reset'],
        ['bindDrag', 'drag'], ['bindDragStart', 'dragstart'], ['bindDragEnd', 'dragend'],
        ['bindDragEnter', 'dragenter'], ['bindDragLeave', 'dragleave'], ['bindDragOver', 'dragover'],
        ['bindDrop', 'drop']
    ];
    
    // =============================================
    // BID API
    // =============================================
    const bid = {
        // Core
        signal,
        batch,
        computed,
        createAutoKeyGenerator,

        // Element selection
        getElement,
        getElements,
        escapeHtml,

        // Bindings
        bindText,
        bindHtml,
        bindClass,
        bindAttr,
        bindProp,
        bindStyle,
        bindValue,
        bindInput,
        bindCheckbox,
        bindSelect,
        bindRadio,
        bindEvent,

        // List
        bindList,

        // Cleanup
        unbind,
        unbindAll
    };
    
    // Event shortcuts
    shortcuts.forEach(([name, type]) => {
        bid[name] = (selector, handler) => bindEvent(selector, type, handler);
    });
    
    // Touch events (passive)
    bid.bindTouchStart = (sel, h) => bindEvent(sel, 'touchstart', h, { passive: true });
    bid.bindTouchEnd = (sel, h) => bindEvent(sel, 'touchend', h, { passive: true });
    bid.bindTouchMove = (sel, h) => bindEvent(sel, 'touchmove', h, { passive: true });
    bid.bindTouchCancel = (sel, h) => bindEvent(sel, 'touchcancel', h, { passive: true });
    
    // Window events
    bid.bindResize = h => { window.addEventListener('resize', h); return window; };
    bid.bindScroll = h => { window.addEventListener('scroll', h); return window; };
    bid.bindLoad = h => { window.addEventListener('load', h); return window; };
    bid.bindDOMContentLoaded = h => { document.addEventListener('DOMContentLoaded', h); return document; };
    
    // =============================================
    // EXPOSE
    // =============================================
    if (typeof window !== 'undefined') window.bid = bid;
    if (typeof module !== 'undefined' && module.exports) module.exports = bid;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
