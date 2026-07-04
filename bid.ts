// =============================================
// bid v1.0 — TypeScript Definitions
// =============================================

export interface Signal<T> {
    get value(): T;
    set value(v: T);
    subscribe(fn: (value: T) => void): () => void;
    peek(): T;
}

export interface ReadonlySignal<T> {
    get value(): T;
    subscribe(fn: (value: T) => void): () => void;
    peek(): T;
}

export type Selector = string | Element;
export type FormatFn<T> = (value: T) => string;
export type ConditionFn<T> = (value: T) => boolean;

// Core
export function signal<T>(initialValue: T): Signal<T>;
export function computed<T>(dependencies: ReadonlySignal<any>[], computeFn: () => T): ReadonlySignal<T> & { dispose(): void };
export function batch(fn: () => void): void;
export function getElement(selector: Selector): Element;
export function getElements(selector: Selector): NodeList | Element[];
export function escapeHtml(str: string | number): string;

// State bindings
export function bindText<T>(selector: Selector, signalObj: Signal<T>, format?: FormatFn<T>): Signal<T>;
export function bindHtml<T>(selector: Selector, signalObj: Signal<T>, format?: FormatFn<T>): Signal<T>;
export function bindClass<T>(selector: Selector, signalObj: Signal<T>, className: string, condition?: ConditionFn<T>): Signal<T>;
export function bindAttr<T>(selector: Selector, attr: string, signalObj: Signal<T>, condition?: ConditionFn<T>): Signal<T>;
export function bindProp<T>(selector: Selector, prop: string, signalObj: Signal<T>, condition?: ((v: T) => any) | null): Signal<T>;
export function bindStyle<T>(selector: Selector, styleProp: string, signalObj: Signal<T>, format?: ((v: T) => string) | null): Signal<T>;

// Two-way bindings
export function bindValue<T extends string | number>(selector: Selector, signalObj: Signal<T>, eventType?: string): Signal<T>;
export function bindInput<T extends string | number>(selector: Selector, signalObj: Signal<T>, eventType?: string): Signal<T>;
export function bindCheckbox(selector: Selector, signalObj: Signal<boolean>): Signal<boolean>;
export function bindSelect<T extends string>(selector: Selector, signalObj: Signal<T>): Signal<T>;
export function bindRadio<T extends string>(selector: Selector, signalObj: Signal<T>): Signal<T>;

// List binding
export interface BindListOptions<T> {
    keyFn?: (item: T, index: number) => string | number;
}
export function bindList<T>(
    containerSelector: Selector,
    arraySignal: Signal<T[]>,
    renderFn: (item: T, index: number, existingEl?: Element) => Element,
    options?: BindListOptions<T>
): Signal<T[]>;

// Event bindings
export function bindEvent(
    selector: Selector,
    eventType: string,
    handler: EventListener,
    options?: AddEventListenerOptions
): Element;

export function bindClick(selector: Selector, handler: EventListener): Element;
export function bindDblClick(selector: Selector, handler: EventListener): Element;
export function bindMouseEnter(selector: Selector, handler: EventListener): Element;
export function bindMouseLeave(selector: Selector, handler: EventListener): Element;
export function bindMouseOver(selector: Selector, handler: EventListener): Element;
export function bindMouseOut(selector: Selector, handler: EventListener): Element;
export function bindMouseDown(selector: Selector, handler: EventListener): Element;
export function bindMouseUp(selector: Selector, handler: EventListener): Element;
export function bindMouseMove(selector: Selector, handler: EventListener): Element;
export function bindContextMenu(selector: Selector, handler: EventListener): Element;
export function bindWheel(selector: Selector, handler: EventListener): Element;

export function bindKeyDown(selector: Selector, handler: EventListener): Element;
export function bindKeyUp(selector: Selector, handler: EventListener): Element;
export function bindKeyPress(selector: Selector, handler: EventListener): Element;

export function bindChange(selector: Selector, handler: EventListener): Element;
export function bindSubmit(selector: Selector, handler: EventListener): Element;
export function bindFocus(selector: Selector, handler: EventListener): Element;
export function bindBlur(selector: Selector, handler: EventListener): Element;
export function bindFocusIn(selector: Selector, handler: EventListener): Element;
export function bindFocusOut(selector: Selector, handler: EventListener): Element;
export function bindReset(selector: Selector, handler: EventListener): Element;

export function bindDrag(selector: Selector, handler: EventListener): Element;
export function bindDragStart(selector: Selector, handler: EventListener): Element;
export function bindDragEnd(selector: Selector, handler: EventListener): Element;
export function bindDragEnter(selector: Selector, handler: EventListener): Element;
export function bindDragLeave(selector: Selector, handler: EventListener): Element;
export function bindDragOver(selector: Selector, handler: EventListener): Element;
export function bindDrop(selector: Selector, handler: EventListener): Element;

export function bindTouchStart(selector: Selector, handler: EventListener): Element;
export function bindTouchEnd(selector: Selector, handler: EventListener): Element;
export function bindTouchMove(selector: Selector, handler: EventListener): Element;
export function bindTouchCancel(selector: Selector, handler: EventListener): Element;

export function bindResize(handler: EventListener): Window;
export function bindScroll(handler: EventListener): Window;
export function bindLoad(handler: EventListener): Window;
export function bindDOMContentLoaded(handler: EventListener): Document;

// Cleanup
export function unbind(selector: Selector): void;
export function unbindAll(container?: Document | Element): void;

declare global {
    interface Window {
        bid: typeof import('./bid');
    }
}
