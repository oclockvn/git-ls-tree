// Minimal DOM stub harness to load app.js (plain browser script, no exports)
// and expose its top-level functions for direct testing in Node.
const fs = require('fs');
const path = require('path');

function makeElement(initial = {}) {
    const el = {
        value: initial.value ?? '',
        checked: initial.checked ?? false,
        textContent: initial.textContent ?? '',
        _listeners: {},
        addEventListener(evt, cb) {
            (this._listeners[evt] = this._listeners[evt] || []).push(cb);
        },
        style: {},
    };
    return el;
}

function makeDocument(elements) {
    return {
        _elements: elements,
        getElementById(id) {
            return elements[id];
        },
        addEventListener() {}, // for document.addEventListener('DOMContentLoaded', ...)
    };
}

function loadApp() {
    const elements = {
        inputText: makeElement(),
        outputText: makeElement(),
        copyBtn: makeElement(),
        importBtn: makeElement(),
        clearBtn: makeElement(),
        commentToggle: makeElement({ checked: false }),
        trailingToggle: makeElement({ checked: false }),
        searchInput: makeElement({ value: '' }),
        depthInput: makeElement({ value: '' }),
    };
    const document = makeDocument(elements);
    const localStorageStore = {};
    const localStorage = {
        getItem: (k) => (k in localStorageStore ? localStorageStore[k] : null),
        setItem: (k, v) => { localStorageStore[k] = v; },
    };
    const navigator = { clipboard: { readText: async () => '', writeText: async () => {} } };
    const console_ = console;

    const appPath = 'D:/src/git-ls-tree/app.js';
    const src = fs.readFileSync(appPath, 'utf8');

    const factory = new Function(
        'document', 'localStorage', 'navigator', 'console',
        src + `
        return { processInput, convertToTreeStructure, applyFilter, formatTreeOutput, escapeRegExp, maintainTreeStructure, debounce, getMaxDepth };
        `
    );
    const api = factory(document, localStorage, navigator, console_);
    return { api, elements, document, localStorage };
}

module.exports = { loadApp, makeElement };
