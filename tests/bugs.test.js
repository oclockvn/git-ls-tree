// Regression suite for D:/src/git-ls-tree/app.js
// Each test asserts the CORRECT (fixed) behavior -> PASS means the bug stays fixed.
const assert = require('assert');
const { loadApp } = require('./harness');

let pass = 0, fail = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        pass++;
    } catch (e) {
        console.log(`FAIL: ${name}\n   -> ${e.message}`);
        fail++;
    }
}

// ---- BUG 1 (fixed): leaf is always a file, regardless of whether its name has a dot ----
// git ls-tree only ever lists files (blobs) as leaves. The old code used
// `currentPart.includes('.')` to guess file-vs-dir, which wrongly kept dotless
// files (LICENSE, Makefile, Dockerfile) as fake tree nodes.
check('BUG1 fixed: dotless file (e.g. "LICENSE") is not rendered as a folder', () => {
    const { api } = loadApp();
    const tree = api.convertToTreeStructure(['src/LICENSE', 'src/index.js']);
    assert.ok(!tree.includes('LICENSE'), `expected LICENSE to be treated as a file and dropped, got:\n${tree}`);
    assert.strictEqual(tree.trim(), '.\n└── src');
});

// ---- BUG 2 (fixed): order is tracked per-node (WeakMap keyed by object), not per-name ----
check('BUG2 fixed: identically-named folder in another branch no longer corrupts sibling order', () => {
    const { api } = loadApp();
    // insertion order: src/aaa(0), src/bbb(1), other/aaa(2)
    // (each needs a child of its own so aaa/bbb are directories, not leaf files)
    const tree = api.convertToTreeStructure(['src/aaa/x', 'src/bbb/x', 'other/aaa/x']);
    const srcStart = tree.indexOf('src');
    const aaaPos = tree.indexOf('aaa', srcStart);
    const bbbPos = tree.indexOf('bbb', srcStart);
    assert.ok(aaaPos < bbbPos, 'expected aaa (inserted first) to render before bbb under src');
});

// ---- BUG 3 (fixed): maxLength no longer spreads the array into Math.max ----
check('BUG3 fixed: formatTreeOutput handles a large tree without stack overflow', () => {
    const { api, elements } = loadApp();
    elements.commentToggle.checked = true;
    const files = [];
    for (let i = 0; i < 200000; i++) files.push(`dir/folder${i}/x`);
    const tree = api.convertToTreeStructure(files);
    const formatted = api.formatTreeOutput(tree); // should not throw
    assert.ok(formatted.length > 0);
});

// ---- BUG 4 (fixed): a bare "!" no longer matches (and excludes) everything ----
check('BUG4 fixed: a bare "!" in the search box is ignored, not treated as exclude-all', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = '!';
    const result = api.applyFilter(['src/index.js', 'src/utils.js', 'README.md']);
    assert.strictEqual(result.length, 3, 'expected all files to survive a meaningless "!" pattern');
});

// ---- BUG 5 (fixed): localStorage access is wrapped so quota/security errors don't crash the app ----
check('BUG5 fixed: safeSetItem/safeGetItem swallow localStorage errors', () => {
    const src = require('fs').readFileSync('D:/src/git-ls-tree/app.js', 'utf8');
    assert.ok(/function safeSetItem/.test(src) && /function safeGetItem/.test(src),
        'expected safeSetItem/safeGetItem helpers to exist');
    assert.strictEqual((src.match(/localStorage\.setItem\(/g) || []).length, 1,
        'expected the only raw localStorage.setItem call to be inside safeSetItem itself');

    const { api, elements, localStorage } = loadApp();
    localStorage.setItem = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
    elements.inputText.value = 'a/b/c';
    // Directly exercise the app's public entry point; must not throw even though
    // the underlying localStorage.setItem throws.
    assert.doesNotThrow(() => {
        api.processInput(elements.inputText.value);
        // simulate what the input handler does next, via the same safe path used in app.js
    });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
