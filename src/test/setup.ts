import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 });
Reflect.deleteProperty(Element.prototype, 'animate');
