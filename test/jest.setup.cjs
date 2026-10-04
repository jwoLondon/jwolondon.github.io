// Provide encoding APIs used by Citation.js dependencies.
const { TextEncoder, TextDecoder } = require('node:util');
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

// JSDOM provides window.*; lift DOMParser & XMLSerializer onto global
global.DOMParser = window.DOMParser;
global.XMLSerializer = window.XMLSerializer;

// Polyfill fetch in Node via node-fetch
global.fetch = require('node-fetch');