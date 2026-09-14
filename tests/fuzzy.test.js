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

// ---- fuzzyMatch unit behavior (still used as the segment-level predicate for f: mode) ----
check('fuzzyMatch: in-order non-contiguous chars match', () => {
    const { api } = loadApp();
    assert.ok(api.fuzzyMatch('typ', 'types'));
    assert.ok(api.fuzzyMatch('finc', 'finance'));
});

check('fuzzyMatch: out-of-order chars do not match', () => {
    const { api } = loadApp();
    assert.ok(!api.fuzzyMatch('tac', 'cat'));
});

check('fuzzyMatch: case-insensitive', () => {
    const { api } = loadApp();
    assert.ok(api.fuzzyMatch('TYP', 'types'));
});

// ---- parseSearch: mode prefix detection ----
check('parseSearch: e: prefix selects exact mode and strips prefix', () => {
    const { api } = loadApp();
    const { mode, includeGroups } = api.parseSearch('e:types finance');
    assert.strictEqual(mode, 'exact');
    assert.deepStrictEqual(includeGroups, [['types'], ['finance']]);
});

check('parseSearch: f: prefix selects fuzzy mode and strips prefix', () => {
    const { api } = loadApp();
    const { mode, includeGroups } = api.parseSearch('f:typ finc');
    assert.strictEqual(mode, 'fuzzy');
    assert.deepStrictEqual(includeGroups, [['typ'], ['finc']]);
});

check('parseSearch: no prefix defaults to contains mode', () => {
    const { api } = loadApp();
    const { mode, includeGroups } = api.parseSearch('types finance');
    assert.strictEqual(mode, 'contains');
    assert.deepStrictEqual(includeGroups, [['types'], ['finance']]);
});

check('parseSearch: prefix is case-insensitive', () => {
    const { api } = loadApp();
    assert.strictEqual(api.parseSearch('E:types').mode, 'exact');
    assert.strictEqual(api.parseSearch('F:types').mode, 'fuzzy');
});

check('parseSearch: whitespace right after the prefix colon does not matter', () => {
    const { api } = loadApp();
    const tight = api.parseSearch('e:types finance');
    const spaced = api.parseSearch('e:         types finance');
    assert.deepStrictEqual(spaced, tight);
});

check('parseSearch: "!" tokens go to excludeGroups, empty "!" ignored', () => {
    const { api } = loadApp();
    const { includeGroups, excludeGroups } = api.parseSearch('types !finance !');
    assert.deepStrictEqual(includeGroups, [['types']]);
    assert.deepStrictEqual(excludeGroups, [['finance']]);
});

// ---- toGroup: "/" within a token means direct/adjacent child ----
check('toGroup: splits a slash-joined token into its parts', () => {
    const { api } = loadApp();
    assert.deepStrictEqual(api.toGroup('src/utils'), ['src', 'utils']);
});

check('toGroup: drops stray/leading/trailing slashes', () => {
    const { api } = loadApp();
    assert.deepStrictEqual(api.toGroup('src/'), ['src']);
    assert.deepStrictEqual(api.toGroup('/utils'), ['utils']);
});

check('parseSearch: "src utils" (space) vs "src/utils" (slash) produce different group shapes', () => {
    const { api } = loadApp();
    assert.deepStrictEqual(api.parseSearch('src utils').includeGroups, [['src'], ['utils']]);
    assert.deepStrictEqual(api.parseSearch('src/utils').includeGroups, [['src', 'utils']]);
});

// ---- segmentsMatchInOrder / findGroupMatch: gaps allowed between groups, ----
// ---- but a multi-word group must match a CONSECUTIVE run ----
const deepSegments = ['src', 'types', 'billing', 'finance-report'];

check('segmentsMatchInOrder: separate groups match with a gap between them (exact mode)', () => {
    const { api } = loadApp();
    // "types" then "finance-report" - "billing" sits between them, still matches (gaps allowed)
    assert.ok(api.segmentsMatchInOrder([['types'], ['finance-report']], deepSegments, 'exact'));
});

check('segmentsMatchInOrder: wrong order fails even with a gap', () => {
    const { api } = loadApp();
    assert.ok(!api.segmentsMatchInOrder([['finance-report'], ['types']], deepSegments, 'exact'));
});

check('segmentsMatchInOrder: exact mode requires whole-segment equality', () => {
    const { api } = loadApp();
    assert.ok(!api.segmentsMatchInOrder([['finance']], deepSegments, 'exact')); // segment is "finance-report", not "finance"
    assert.ok(api.segmentsMatchInOrder([['finance']], deepSegments, 'contains')); // substring mode does match it
});

check('segmentsMatchInOrder: a single multi-word group requires adjacency, unlike two separate groups', () => {
    const { api } = loadApp();
    // deepSegments = ['src', 'types', 'billing', 'finance-report'] - "types" and "billing" ARE adjacent
    assert.ok(api.segmentsMatchInOrder([['types', 'billing']], deepSegments, 'exact'), 'types/billing should match - they are direct parent/child');
    // "types" and "finance-report" are NOT adjacent (billing sits between them)
    assert.ok(!api.segmentsMatchInOrder([['types', 'finance-report']], deepSegments, 'exact'), 'types/finance-report should NOT match - not adjacent');
    // but as two separate groups (space-separated), the gap is fine
    assert.ok(api.segmentsMatchInOrder([['types'], ['finance-report']], deepSegments, 'exact'), 'types finance-report (separate groups) should match despite the gap');
});

// ---- applyFilter integration: the bug case from the real report ----
// this is the exact structure that produced false positives under whole-path fuzzy:
// "types" used to match .../layouts/process-list/header purely from scattered letters.
const files = [
    'solutions/app/src/types/billing/arrears-on-hold-invoice-details/x',
    'solutions/app/src/types/finance/x',
    'solutions/app/src/layouts/process-list/header/x', // previously a false positive for "types"
    'solutions/app/src/components/app/charts/types/x',
    'solutions/app/src/api/finance/x',
];

check('applyFilter e: mode: "e:types finance" only matches real types->finance path', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = 'e:types finance';
    const result = api.applyFilter(files);
    assert.deepStrictEqual(result, ['solutions/app/src/types/finance/x']);
});

check('applyFilter default mode no longer produces the whole-path false positive', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = 'types';
    const result = api.applyFilter(files);
    assert.ok(!result.includes('solutions/app/src/layouts/process-list/header/x'),
        'process-list/header should no longer match "types" now that matching is per-segment');
});

check('applyFilter f: mode: fuzzy per segment, gaps allowed, order respected', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = 'f:typ finc';
    const result = api.applyFilter(files);
    assert.deepStrictEqual(result, ['solutions/app/src/types/finance/x']);
});

check('applyFilter default mode ("contains both") is AND, not OR', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = 'types finance';
    const result = api.applyFilter(files);
    assert.deepStrictEqual(result, ['solutions/app/src/types/finance/x']);
});

check('applyFilter: exclude ("!") still works under the new scheme', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = 'e:types !finance';
    const result = api.applyFilter(files);
    assert.deepStrictEqual(result, [
        'solutions/app/src/types/billing/arrears-on-hold-invoice-details/x',
        'solutions/app/src/components/app/charts/types/x',
    ]);
});

// ---- applyFilter: "src utils" (deep search) vs "src/utils" (direct child only) ----
const nestedFiles = [
    'solutions/app/src/utils/format/x',                 // utils IS a direct child of src
    'solutions/app/src/components/utils/helpers/x',     // utils exists, but deep under src (not direct child)
    'solutions/app/other/utils/x',                       // utils exists, but not under src at all
];

check('applyFilter: "src utils" (space) matches utils anywhere under src, including deep', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = 'e:src utils';
    const result = api.applyFilter(nestedFiles);
    assert.deepStrictEqual(result, [
        'solutions/app/src/utils/format/x',
        'solutions/app/src/components/utils/helpers/x',
    ]);
});

check('applyFilter: "src/utils" (slash) matches only when utils is a direct child of src', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = 'e:src/utils';
    const result = api.applyFilter(nestedFiles);
    assert.deepStrictEqual(result, ['solutions/app/src/utils/format/x']);
});

check('applyFilter: bare "!" still ignored (BUG4 regression)', () => {
    const { api, elements } = loadApp();
    elements.searchInput.value = '!';
    const result = api.applyFilter(files);
    assert.strictEqual(result.length, files.length);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
