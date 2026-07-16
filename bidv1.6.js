(function(global) {
    'use strict';

    // =============================================
    // INTERNALS & STORAGE
    // =============================================
    let batchDepth = 0;
    const pendingEffects = new Map();
    const elementBindings = new WeakMap();
    const elementHandlers = new WeakMap();

    function scheduleEffect(sub, arg) {
        if (batchDepth > 0) {
            pendingEffects.set(sub, arg);
        } else {
            sub.fn(arg);
        }
    }

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

    function trackBinding(el, unsubscribe) {
        if (!elementBindings.has(el)) {
            elementBindings.set(el, new Set());
        }
        elementBindings.get(el).add(unsubscribe);
    }

    function untrackBindings(el) {
        const bindings = elementBindings.get(el);
        if (bindings) {
            bindings.forEach(unsub => unsub());
            elementBindings.delete(el);
        }
    }

    function trackHandler(el, type, handler, options) {
        if (!elementHandlers.has(el)) {
            elementHandlers.set(el, []);
        }
        elementHandlers.get(el).push({ type, handler, options });
    }

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
                    if (!node.isConnected) {
                        unbindSubTree(node);
                    }
                });
            });
        });
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
    // CORE: Signal & Batching
    // =============================================
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
            subscribe(fn) {
                const sub = { fn };
                subscribers.add(sub);
                return () => { subscribers.delete(sub); }; 
            },
            peek() { return value; }
        };
    }

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
    // CORE: Element Selection & Utils
    // =============================================
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

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =============================================
    // FACTORIES (Internal helpers pentru DRY)
    // =============================================
    
    // Pentru tiparul (selector, signalObj, arg1, arg2) -> ex: bindText, bindClass
    function createBinding(updaterFn) {
        return function(selector, signalObj, arg1, arg2) {
            const el = getElement(selector);
            const update = val => updaterFn(el, val, arg1, arg2);
            update(signalObj.value);
            trackBinding(el, signalObj.subscribe(update));
            return signalObj;
        };
    }

    // Pentru tiparul (selector, key, signalObj, arg1) -> ex: bindStyle, bindAttr, bindProp
    function createKeyedBinding(updaterFn) {
        return function(selector, key, signalObj, arg1) {
            const el = getElement(selector);
            const update = val => updaterFn(el, val, key, arg1);
            update(signalObj.value);
            trackBinding(el, signalObj.subscribe(update));
            return signalObj;
        };
    }

    // Generează funcții pentru Two-Way Binding
    function createTwoWayBinding(updateEl, getValFromEvent, defaultEventType) {
        return function(selector, signalObj, eventType) {
            const type = eventType || defaultEventType;
            const el = getElement(selector);
            
            const update = val => updateEl(el, val);
            update(signalObj.value);
            trackBinding(el, signalObj.subscribe(update));

            const handler = e => { signalObj.value = getValFromEvent(e); };
            el.addEventListener(type, handler);
            trackHandler(el, type, handler);

            return signalObj;
        };
    }

    // =============================================
    // STATE BINDINGS 
    // =============================================
    const bindText = createBinding((el, val, format) => el.textContent = format ? format(val) : val);
    
    const bindHtml = createBinding((el, val, format) => {
        console.warn('bindHtml() is potentially unsafe. Use bindText() or sanitize your HTML.');
        el.innerHTML = format ? format(val) : val;
    });
    
    const bindClass = createBinding((el, val, className, condition) => {
        el.classList.toggle(className, condition ? condition(val) : val);
    });
    
    const bindAttr = createKeyedBinding((el, val, attr, condition) => {
        const result = condition ? condition(val) : val;
        if (result === false || result === null || result === undefined) {
            el.removeAttribute(attr);
        } else {
            el.setAttribute(attr, result === true ? '' : result);
        }
    });
    
    const bindProp = createKeyedBinding((el, val, prop, condition) => {
        el[prop] = condition ? condition(val) : val;
    });
    
    const bindStyle = createKeyedBinding((el, val, styleProp, format) => {
        el.style[styleProp] = format ? format(val) : val;
    });

    // =============================================
    // TWO-WAY BINDINGS 
    // =============================================
    const bindValue = createTwoWayBinding(
        (el, val) => { if (el.value !== val) el.value = val; }, 
        e => e.target.value, 
        'input'
    );
    
    const bindInput = (selector, signalObj) => bindValue(selector, signalObj, 'input');
    
    const bindCheckbox = createTwoWayBinding(
        (el, val) => el.checked = !!val, 
        e => e.target.checked, 
        'change'
    );
    
    const bindSelect = createTwoWayBinding(
        (el, val) => el.value = val, 
        e => e.target.value, 
        'change'
    );

    function bindRadio(selector, signalObj) {
        const els = getElements(selector);
        const handler = e => { if (e.target.checked) signalObj.value = e.target.value; };
        els.forEach(el => {
            const update = val => el.checked = (el.value === val);
            update(signalObj.value);
            trackBinding(el, signalObj.subscribe(update));
            el.addEventListener('change', handler);
            trackHandler(el, 'change', handler);
        });
        return signalObj;
    }

    // =============================================
    // EVENT BINDINGS
    // =============================================
    function bindEvent(selector, eventType, handler, options = {}) {
        const el = getElement(selector);
        el.addEventListener(eventType, handler, options);
        trackHandler(el, eventType, handler, options);
        return el;
    }

    // =============================================
    // COMPUTED
    // =============================================
    function computed(dependencies, computeFn) {
        let value;
        let isStale = true;
        const result = signal(undefined);

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
    function createAutoKeyGenerator() {
        const ids = new WeakMap();
        let counter = 0;
        let warnedPrimitive = false;

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
                    'bid.js: autoKey() received a primitive list item. Pass options.keyFn for reorder-safe primitive lists.'
                );
            }
            return 'prim_' + index + '_' + item;
        };
    }

    // =============================================
    // LIST BINDING
    // =============================================
    function bindList(containerSelector, arraySignal, renderFn, options = {}) {
        const container = getElement(containerSelector);
        const windowFn = options.windowFn || (arr => arr);
        const updateFn = options.updateFn || null;
        const keyFn = options.keyFn || createAutoKeyGenerator();

        Array.from(container.children).forEach(child => unbindSubTree(child));

        function update(fullArr) {
            const arr = windowFn(fullArr);
            const existing = Array.from(container.children);
            const newKeys = arr.map((item, i) => keyFn(item, i));
            const elMap = new Map();
            
            existing.forEach(el => {
                if (elMap.has(el._bidKey)) {
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
    function unbind(selector) {
        unbindSubTree(getElement(selector));
    }

    function unbindAll(container = document) {
        unbindSubTree(container);
    }

    // =============================================
    // BID API EXPORT & EVENT SHORTCUTS
    // =============================================
    const bid = {
        signal, batch, computed, createAutoKeyGenerator,
        getElement, getElements, escapeHtml,
        bindText, bindHtml, bindClass, bindAttr, bindProp, bindStyle,
        bindValue, bindInput, bindCheckbox, bindSelect, bindRadio, bindEvent,
        bindList, unbind, unbindAll,
        __core: {
            getBatchDepth: () => batchDepth,
            getPendingEffects: () => pendingEffects.size
        }
    };

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

    shortcuts.forEach(([name, type]) => {
        bid[name] = (selector, handler) => bindEvent(selector, type, handler);
    });

    bid.bindTouchStart = (sel, h) => bindEvent(sel, 'touchstart', h, { passive: true });
    bid.bindTouchEnd = (sel, h) => bindEvent(sel, 'touchend', h, { passive: true });
    bid.bindTouchMove = (sel, h) => bindEvent(sel, 'touchmove', h, { passive: true });
    bid.bindTouchCancel = (sel, h) => bindEvent(sel, 'touchcancel', h, { passive: true });
    
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
