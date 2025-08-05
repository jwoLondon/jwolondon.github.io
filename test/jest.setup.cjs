// 1) JSDOM provides window.*; lift DOMParser & XMLSerializer onto global
global.DOMParser = window.DOMParser;
global.XMLSerializer = window.XMLSerializer;

// 2) Polyfill fetch in Node via node-fetch
global.fetch = require('node-fetch');