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

// dummy paths, 8 levels deep (solutions=1 .. api=8, models=9, roles/orders=10)
const files = [
    'solutions/app/src/Services/Web/ClientApp/src/api/models/roles/x',
    'solutions/app/src/Services/Web/ClientApp/src/api/models/plans/x',
    'solutions/app/src/Services/Web/ClientApp/src/api/models/orders/createOrder/x',
    'solutions/app/src/Services/Web/ClientApp/src/api/models/orders/updateOrder/x',
];

// no depth limit -> full tree, "models" and its children show
check('no depth set: full tree renders', () => {
    const { api } = loadApp();
    const tree = api.convertToTreeStructure(files);
    assert.ok(tree.includes('models'));
    assert.ok(tree.includes('roles'));
    assert.ok(tree.includes('orders'));
    assert.ok(tree.includes('createOrder'));
});

// depth=8 -> stop after "api" (8th level: solutions=1 .. api=8)
check('depth=8: stops at "api", does not show "models"/"roles"/etc', () => {
    const { api, elements } = loadApp();
    elements.depthInput.value = '8';
    const tree = api.convertToTreeStructure(files);
    console.log('   tree:\n' + tree.split('\n').map(l => '     ' + l).join('\n'));
    assert.ok(tree.includes('api'), 'expected "api" (depth 8) to still show');
    assert.ok(!tree.includes('models'), 'expected "models" (depth 9) to be cut off');
    assert.ok(!tree.includes('roles'), 'expected "roles" (depth 10) to be cut off');
});

// depth=1 -> only top-level dir shows
check('depth=1: only top-level directory shows', () => {
    const { api, elements } = loadApp();
    elements.depthInput.value = '1';
    const tree = api.convertToTreeStructure(files);
    assert.strictEqual(tree.trim(), '.\n└── solutions');
});

// invalid/empty depth -> treated as unlimited
check('empty/invalid depth value falls back to unlimited', () => {
    const { api, elements } = loadApp();
    elements.depthInput.value = '';
    assert.strictEqual(api.getMaxDepth(), null);
    elements.depthInput.value = '0';
    assert.strictEqual(api.getMaxDepth(), null);
    elements.depthInput.value = '-5';
    assert.strictEqual(api.getMaxDepth(), null);
    elements.depthInput.value = 'abc';
    assert.strictEqual(api.getMaxDepth(), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
