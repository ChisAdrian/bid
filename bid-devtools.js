(function(window) {
    'use strict';

    if (!window.bid) {
        console.warn('bid-devtools.js: bid.js nu a fost găsit.');
        return;
    }

    // =============================================
    // STATE INTERN DEVTOOLS
    // =============================================
    const stats = {
        signals: 0,
        computed: 0,
        listeners: 0,
        fps: 60,
        longTasks: 0,
        frames: 0
    };

    // =============================================
    // INTERCEPTĂRI (Monkey-Patching)
    // =============================================
    const originalSignal = bid.signal;
    bid.signal = function(initialValue) {
        stats.signals++;
        return originalSignal(initialValue);
    };

    const originalComputed = bid.computed;
    bid.computed = function(deps, fn) {
        stats.computed++;
        return originalComputed(deps, fn);
    };

    const originalBindEvent = bid.bindEvent;
    bid.bindEvent = function(selector, eventType, handler, options) {
        stats.listeners++;
        return originalBindEvent(selector, eventType, handler, options);
    };

    // =============================================
    // COLECTARE METRICI PERFORMANȚĂ
    // =============================================
    
    // FPS Counter
    let lastTime = performance.now();
    function loop() {
        stats.frames++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
            stats.fps = stats.frames;
            stats.frames = 0;
            lastTime = now;
        }
        requestAnimationFrame(loop);
    }
    loop();

    // Long Tasks (necesită PerformanceObserver)
    if ('PerformanceObserver' in window) {
        try {
            const observer = new PerformanceObserver((list) => {
                stats.longTasks += list.getEntries().length;
            });
            observer.observe({ type: 'longtask', buffered: true });
        } catch (e) {
            // Browserul nu suportă longtask
        }
    }

    // Memorie Heap (suportat doar în browsere bazate pe Chromium)
    function getHeapMB() {
        if (performance.memory && performance.memory.usedJSHeapSize) {
            return (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1) + ' MB';
        }
        return 'N/A';
    }

    // =============================================
    // INTERFAȚA UI (HUD)
    // =============================================
    const hud = document.createElement('div');
    hud.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: #1e1e1e;
        color: #4af626;
        font-family: monospace;
        font-size: 13px;
        padding: 15px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        z-index: 999999;
        pointer-events: none;
        white-space: pre;
        line-height: 1.4;
        opacity: 0.9;
    `;
    
    document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(hud);
    });

    // Actualizare UI o dată pe secundă
    setInterval(() => {
        const domNodes = document.querySelectorAll('*').length;
        const batchDepth = bid.__DEV__ ? bid.__DEV__.batchDepth : '?';
        const pending = bid.__DEV__ ? bid.__DEV__.pendingEffectsCount : '?';
        const bindings = bid.__DEV__ ? bid.__DEV__.bindingsCount : '?';

        hud.textContent = `bid.js DevTools
──────────────────────
Signals ........ ${stats.signals}
Computed ....... ${stats.computed}
Bindings ....... ${bindings}
Listeners ...... ${stats.listeners}
Pending Effects. ${pending}
Batch Depth .... ${batchDepth}

Heap ........... ${getHeapMB()}
DOM Nodes ...... ${domNodes}
FPS ............ ${stats.fps}
Long Tasks ..... ${stats.longTasks}`;
    }, 1000);

})(window);
