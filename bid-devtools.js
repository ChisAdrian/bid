(function() {
    'use strict';

    if (typeof window === 'undefined' || !window.bid) {
        console.error('bid-devtools.js: bid.js nu a fost găsit. Încarcă-l mai întâi!');
        return;
    }

    // =============================================
    // STATISTICI
    // =============================================
    const stats = {
        signals: 0,
        computed: 0,
        bindings: 0,
        listeners: 0,
        fps: 0,
        longTasks: 0
    };

    // =============================================
    // INTERCEPTARE API (Monkey-Patching)
    // =============================================
    
    // Urmărim semnalele
    const originalSignal = bid.signal;
    bid.signal = function() {
        stats.signals++;
        return originalSignal.apply(this, arguments);
    };

    // Urmărim computeds
    const originalComputed = bid.computed;
    bid.computed = function() {
        stats.computed++;
        return originalComputed.apply(this, arguments);
    };

    // Urmărim toate binding-urile DOM (text, html, class, prop, list etc.)
    const bindingMethods = [
        'bindText', 'bindHtml', 'bindClass', 'bindAttr', 
        'bindProp', 'bindStyle', 'bindValue', 'bindList'
    ];
    bindingMethods.forEach(method => {
        if (bid[method]) {
            const originalMethod = bid[method];
            bid[method] = function() {
                stats.bindings++;
                return originalMethod.apply(this, arguments);
            };
        }
    });

    // Urmărim event listener-ele (majoritatea scurtăturilor folosesc bindEvent intern)
    const originalBindEvent = bid.bindEvent;
    bid.bindEvent = function() {
        stats.listeners++;
        return originalBindEvent.apply(this, arguments);
    };

    // =============================================
    // MONITORIZARE PERFORMANȚĂ (FPS & Long Tasks)
    // =============================================
    
    // FPS Monitor
    let frameCount = 0;
    let lastFpsTime = performance.now();
    function fpsLoop() {
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            stats.fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
            frameCount = 0;
            lastFpsTime = now;
        }
        requestAnimationFrame(fpsLoop);
    }
    requestAnimationFrame(fpsLoop);

    // Long Tasks Monitor (blocaje pe main thread > 50ms)
    if ('PerformanceObserver' in window) {
        try {
            const observer = new PerformanceObserver((list) => {
                stats.longTasks += list.getEntries().length;
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
            // Fallback silențios dacă browserul nu suportă 'longtask'
        }
    }

    // =============================================
    // INTERFAȚĂ (UI)
    // =============================================
    
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        color: '#00ffcc',
        fontFamily: 'monospace, "Courier New"',
        fontSize: '13px',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        zIndex: '999999',
        pointerEvents: 'none', // Să poți da click prin el
        lineHeight: '1.4',
        whiteSpace: 'pre'
    });
    
    // Asigură-te că panoul e adăugat după ce DOM-ul e gata
    if (document.body) document.body.appendChild(panel);
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(panel));

    function padRight(str, length) {
        return (str + ' ....................').slice(0, length);
    }

    function renderDevTools() {
        // Obținem nodurile DOM active
        const domNodes = document.getElementsByTagName('*').length;
        
        // Obținem memoria Heap (suportat doar de derivatele Chromium/Chrome)
        let heapStr = 'N/A';
        if (performance.memory && performance.memory.usedJSHeapSize) {
            heapStr = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1) + ' MB';
        }

        // Citim datele interne dacă le-ai expus (vezi Pasul 2 mai jos)
        const batchDepth = bid.__core ? bid.__core.getBatchDepth() : 'Secret';
        const pendingEff = bid.__core ? bid.__core.getPendingEffects() : 'Secret';

        panel.textContent = 
            "bid.js DevTools\n" +
            "──────────────────────\n" +
            padRight("Signals ", 16) + stats.signals + "\n" +
            padRight("Computed ", 16) + stats.computed + "\n" +
            padRight("Bindings ", 16) + stats.bindings + "\n" +
            padRight("Listeners ", 16) + stats.listeners + "\n" +
            padRight("Pending Effects ", 16) + pendingEff + "\n" +
            padRight("Batch Depth ", 16) + batchDepth + "\n\n" +
            padRight("Heap ", 16) + heapStr + "\n" +
            padRight("DOM Nodes ", 16) + domNodes + "\n" +
            padRight("FPS ", 16) + stats.fps + "\n" +
            padRight("Long Tasks ", 16) + stats.longTasks;
    }

    // Actualizăm interfața o dată pe secundă pentru a nu consuma resurse inutile
    setInterval(renderDevTools, 1000);
})();
