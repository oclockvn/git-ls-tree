// Synthetic dataset that mimics the SHAPE of a real large repo (deep nesting,
// dotfiles, mixed extensions, dotless files) without embedding any real project data.
const { loadApp } = require('./harness');

function generateDummyPaths(count) {
    const dirNames = ['components', 'pages', 'hooks', 'utils', 'services', 'models', 'api', 'lib', 'store', 'assets'];
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md'];
    const dotFiles = ['.env', '.gitignore', '.eslintrc', '.npmrc', '.prettierrc.json'];
    const dotlessFiles = ['LICENSE', 'Makefile', 'Dockerfile'];

    const files = [];
    let i = 0;
    while (files.length < count) {
        const depth = 3 + (i % 6); // 3..8 levels of nested dirs
        const parts = ['solutions', 'app', 'src'];
        for (let d = 0; d < depth; d++) {
            parts.push(`${dirNames[(i + d) % dirNames.length]}${Math.floor(i / dirNames.length) % 50}`);
        }
        const leaf = i % 20 === 0
            ? dotFiles[i % dotFiles.length]
            : i % 37 === 0
                ? dotlessFiles[i % dotlessFiles.length]
                : `file${i}${extensions[i % extensions.length]}`;
        parts.push(leaf);
        files.push(parts.join('/'));
        i++;
    }
    return files;
}

const files = generateDummyPaths(3000);
const { api, elements } = loadApp();

console.log(`input lines: ${files.length}`);

// 1. No crash with both toggles on (regression check for the Math.max spread bug)
elements.commentToggle.checked = true;
elements.trailingToggle.checked = true;
const t0 = Date.now();
const tree = api.convertToTreeStructure(files);
const formatted = api.formatTreeOutput(tree);
console.log(`convert+format took ${Date.now() - t0}ms, output lines: ${formatted.split('\n').length}`);

// 2. Sanity: no blank/undefined lines
const lines = tree.split('\n');
console.log(`first 5 tree lines:\n${lines.slice(0, 5).join('\n')}`);
if (lines.some(l => l.includes('undefined'))) throw new Error('FAIL: undefined leaked into tree output');

// 3. Dotted-name FILES (.env, .gitignore, .eslintrc, etc.) must never appear as tree nodes -
//    only their parent dirs should show.
const envAsNode = lines.some(l => /──\s*\.env$/.test(l.trim()));
console.log(`".env" wrongly shown as node: ${envAsNode}`);
if (envAsNode) throw new Error('FAIL: .env (a file) wrongly rendered as a tree node');

// 4. Dotless files (no extension) must also be dropped, not shown as fake folders.
const dotlessNames = ['LICENSE', 'Makefile', 'Dockerfile'];
for (const name of dotlessNames) {
    const wronglyShown = lines.some(l => l.trim().replace(/^[│├└─\s]+/, '') === name);
    if (wronglyShown) throw new Error(`FAIL: dotless file "${name}" wrongly rendered as a folder`);
}
console.log(`dotless files (${dotlessNames.join(', ')}) correctly dropped: true`);

// 5. Filter still works on generated data
elements.searchInput.value = 'components0';
const filtered = api.applyFilter(files);
console.log(`filter "components0": ${filtered.length} of ${files.length} files matched`);
if (filtered.length === 0) throw new Error('FAIL: filter matched nothing on generated data');

// 6. Depth limiting works on generated data too
elements.depthInput.value = '5';
const depthTree = api.convertToTreeStructure(files);
const depthLines = depthTree.split('\n');
const maxIndent = Math.max(...depthLines.map(l => (l.match(/│   |    /g) || []).length));
console.log(`depth=5: max nesting observed = ${maxIndent + 1} (should be <= 5)`);
if (maxIndent + 1 > 5) throw new Error('FAIL: depth limit not respected on generated data');

console.log('\nALL VALIDATIONS PASSED on generated dummy data');
