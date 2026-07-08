// =============================================
// bid bidv12RC.js
// A tiny, explicit reactive binding library
// =============================================

(function(global) {
    'use strict';

    // =============================================
    // INTERNALS & STORAGE
    // =============================================
    let batchDepth = 0;
    const pendingEffects = new Map();
    const elementBindings = new WeakMap();
    const elementHandlers = new WeakMap();

    // FIX: pendingEffects used to be keyed by the subscriber function
    // itself. If the same function reference was subscribed to two
    // different signals, and both signals changed inside one batch(),
    // the second scheduleEffect() call would silently overwrite the
    // first in the Map - the handler fired once, with only the later
    // signal's value, and the other update was dropped with no error.
    //
    // Fix: key on a small per-subscription wrapper object instead of
    // the raw function. Each call to signal().subscribe(fn) creates one
    // wrapper, reused for every scheduleEffect() call from THAT signal
    // for THAT subscriber - so repeated changes to the same signal
    // within one batch still correctly collapse to a single call, but
    // two different signals sharing a handler no longer collide.
    function scheduleEffect(sub, arg) {
        if (batchDepth > 0) {
            pendingEffects.set(sub, arg);
        } else {
            sub.fn(arg);
        }
    }

    function flushEffects() {
        // Effects run here can themselves cause further scheduling - the
        // clearest example is computed(): a dependency's deferred change
        // callback runs during THIS flush, and if it decides a recompute
        // is needed, it calls scheduleEffect() again. If batchDepth had
        // already dropped to 0 by then, that inner scheduleEffect() call
        // would execute immediately instead of joining the current flush,
        // so two dependencies of the same computed changing in one
        // batch() would each trigger their own out-of-order recompute
        // instead of coalescing into one. Keeping batchDepth raised for
        // the duration of the drain, and looping until nothing new gets
        // scheduled, keeps everything - signal -> computed -> computed's
        // own subscribers - coalesced into this single flush.
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
                    // Verificăm dacă este un element HTML
                    if (node.nodeType === 1) {
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
    // CORE: Signal
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
                // wrapper gives this subscription a stable identity of its
                // own, independent of `fn`'s identity - see scheduleEffect()
                const sub = { fn };
                subscribers.add(sub);
                return () => { subscribers.delete(sub); };
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
    function bindEvent(selector, eventType, handler, options) {
        // Fix: Permitem valoarea false evaluând doar undefined sau null
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

        // One stable wrapper shared by every dependency of this computed,
        // so if several of its deps change within the same batch(), they
        // still coalesce into a single scheduled recompute() - same
        // identity-per-subscription fix as signal.subscribe(), just scoped
        // to this computed instead of to one signal.
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
    // LIST BINDING
    // =============================================
    function bindList(containerSelector, arraySignal, renderFn, options) {
        options = options || {};
        const container = getElement(containerSelector);
        const keyFn = options.keyFn || null;
        const updateFn = options.updateFn || null;
        
        if (!keyFn) {
            console.warn(
                'bindList(): no options.keyFn provided, falling back to index-based ' +
                'keys. This silently rebinds the WRONG DOM element to the WRONG item ' +
                'whenever the list is reordered or an item is removed from the middle ' +
                '(the element built for the old item at that index gets reused as-is, ' +
                'and if it has its own baked-in bindings - e.g. one signal per row - ' +
                'those keep pointing at the old item forever). Safe to skip only for ' +
                'append-only / never-reordered lists. Otherwise pass e.g. ' +
                '{ keyFn: item => item.id }.'
            );
        }
        
        // Clear previous list children before re-binding
        Array.from(container.children).forEach(child => unbindSubTree(child));
        // We no longer nuke the bindings on the container itself so we don't break bindClass!
        
        function update(arr) {
            const existing = Array.from(container.children);
            const newKeys = arr.map((item, i) => keyFn ? keyFn(item, i) : i);
            const elMap = new Map();
            
            // Fix: Verificare pentru chei duplicate care ar cauza erori de randare silențioase
            existing.forEach(el => {
                if (elMap.has(el._bidKey)) {
                    console.error('bid.js: Cheie duplicată detectată în bindList ("' + el._bidKey + '"). ' +
                                  'Asta va cauza randarea incorectă a elementelor. Asigură-te că keyFn returnează valori unice.');
                }
                elMap.set(el._bidKey, el);
            });

            const newKeySet = new Set(newKeys);
            existing.forEach(el => {
                if (!newKeySet.has(el._bidKey)) {
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

        update(arraySignal.value);
        const unsub = arraySignal.subscribe(update);
        trackBinding(container, unsub);

        return arraySignal;
    }

    // =============================================
    // UNBIND FUNCTIONS
    // =============================================
    function unbind(selector) {
        unbindSubTree(getElement(selector));
    }

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
