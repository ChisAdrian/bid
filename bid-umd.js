// =============================================
// bid v1.0 (UMD — Universal Module Definition)
// ES Module + CommonJS + Global (IIFE)
// Philosophy: Explicit over implicit
// =============================================

(function (global, factory) {
    'use strict';

    if (typeof exports === 'object' && typeof module !== 'undefined') {
        // CommonJS
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // Global (browser)
        global = typeof globalThis !== 'undefined' ? globalThis : global || self;
        global.bid = factory();
    }

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {}, function () {
    'use strict';

    // =============================================
    // INTERNALS & STORAGE
    // =============================================
    let batchDepth = 0;
    const pendingEffects = new Map();     // fn -> latest arg
    const elementBindings = new WeakMap(); // el -> Set<unsubscribeFn>
    const elementHandlers = new WeakMap(); // el -> Array<{type, handler, options}>

    function scheduleEffect(fn, arg) {
        if (batchDepth > 0) {
            pendingEffects.set(fn, arg);
        } else {
            fn(arg);
        }
    }

    function flushEffects() {
        const entries = Array.from(pendingEffects.entries());
        pendingEffects.clear();
        entries.forEach(([fn, arg]) => fn(arg));
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
    // CORE: Signal
    // =============================================
    function signal(initialValue) {
        let value = initialValue;
        const subscribers = new Set();

        return {
            get value() { return value; },
            set value(newValue) {
                if (value !== newValue) {
                    value = newValue;
                    subscribers.forEach(fn => scheduleEffect(fn, value));
                }
            },
            subscribe(fn) {
                subscribers.add(fn);
                return () => { subscribers.delete(fn); };
            },
            peek() { return value; }
        };
    }

    // =============================================
    // BATCHING
    // =============================================
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
    // STATE BINDINGS
    // =============================================
    function bindText(selector, signalObj, format) {
        const el = getElement(selector);
        const update = val => el.textContent = format ? format(val) : val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    function bindHtml(selector, signalObj, format) {
        console.warn('bindHtml() is potentially unsafe. Use bindText() or sanitize your HTML.');
        const el = getElement(selector);
        const update = val => el.innerHTML = format ? format(val) : val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

    function bindClass(selector, signalObj, className, condition) {
        const el = getElement(selector);
        const update = val => el.classList.toggle(className, condition ? condition(val) : val);
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

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

    function bindProp(selector, prop, signalObj, condition) {
        const el = getElement(selector);
        const update = val => el[prop] = condition ? condition(val) : val;
        update(signalObj.value);
        trackBinding(el, signalObj.subscribe(update));
        return signalObj;
    }

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

    function bindInput(selector, signalObj) {
        return bindValue(selector, signalObj, 'input');
    }

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

    function bindRadio(selector, signalObj) {
        const els = getElements(selector);

        const update = val => els.forEach(el => el.checked = (el.value === val));
        update(signalObj.value);
        
        const unsub = signalObj.subscribe(update);
        const handler = e => { if (e.target.checked) signalObj.value = e.target.value; };

        els.forEach(el => {
            trackBinding(el, unsub);
            el.addEventListener('change', handler);
            trackHandler(el, 'change', handler);
        });

        return signalObj;
    }

    // =============================================
    // EVENT BINDINGS
    // =============================================
    function bindEvent(selector, eventType, handler, options) {
        options = options || {};
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
            if (value !== newValue) {
                value = newValue;
                result.value = value;
            }
            isStale = false;
        }

        const unsubs = dependencies.map(dep => dep.subscribe(() => {
            if (!isStale) {
                isStale = true;
                scheduleEffect(recompute);
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
    // LIST BINDING
    // =============================================
    function bindList(containerSelector, arraySignal, renderFn, options) {
        options = options || {};
        const container = getElement(containerSelector);
        const keyFn = options.keyFn || null;
        const updateFn = options.updateFn || null;

        function update(arr) {
            const existing = Array.from(container.children);
            const newKeys = arr.map((item, i) => keyFn ? keyFn(item, i) : i);
            const elMap = new Map();

            existing.forEach(el => elMap.set(el._bidKey, el));

            // 1. Structural removal & cleanup
            const newKeySet = new Set(newKeys);
            existing.forEach(el => {
                if (!newKeySet.has(el._bidKey)) {
                    unbindSubTree(el);
                    el.remove();
                }
            });

            // 2. Reconciliation & insertion
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

        update(arraySignal.value);
        const unsub = arraySignal.subscribe(update);
        trackBinding(container, unsub);

        return arraySignal;
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

    function unbind(selector) {
        unbindSubTree(getElement(selector));
    }

    function unbindAll(container) {
        container = container || document;
        container.querySelectorAll('*').forEach(unbindSubTree);
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

    const bid = {
        signal: signal,
        batch: batch,
        getElement: getElement,
        getElements: getElements,
        escapeHtml: escapeHtml,
        bindText: bindText,
        bindHtml: bindHtml,
        bindClass: bindClass,
        bindAttr: bindAttr,
        bindProp: bindProp,
        bindStyle: bindStyle,
        bindValue: bindValue,
        bindInput: bindInput,
        bindCheckbox: bindCheckbox,
        bindSelect: bindSelect,
        bindRadio: bindRadio,
        bindEvent: bindEvent,
        computed: computed,
        bindList: bindList,
        unbind: unbind,
        unbindAll: unbindAll
    };

    shortcuts.forEach(([name, type]) => {
        bid[name] = (selector, handler) => bindEvent(selector, type, handler);
    });

    // Special touch events (passive)
    bid.bindTouchStart = (sel, h) => bindEvent(sel, 'touchstart', h, { passive: true });
    bid.bindTouchEnd = (sel, h) => bindEvent(sel, 'touchend', h, { passive: true });
    bid.bindTouchMove = (sel, h) => bindEvent(sel, 'touchmove', h, { passive: true });
    bid.bindTouchCancel = (sel, h) => bindEvent(sel, 'touchcancel', h, { passive: true });

    // Window / Document events
    bid.bindResize = h => { window.addEventListener('resize', h); return window; };
    bid.bindScroll = h => { window.addEventListener('scroll', h); return window; };
    bid.bindLoad = h => { window.addEventListener('load', h); return window; };
    bid.bindDOMContentLoaded = h => { document.addEventListener('DOMContentLoaded', h); return document; };

    return bid;

}));
