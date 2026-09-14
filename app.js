document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const outputText = document.getElementById('outputText');
    const copyBtn = document.getElementById('copyBtn');
    const importBtn = document.getElementById('importBtn');
    const clearBtn = document.getElementById('clearBtn');
    const commentToggle = document.getElementById('commentToggle');
    const trailingToggle = document.getElementById('trailingToggle');
    const searchInput = document.getElementById('searchInput');
    const depthInput = document.getElementById('depthInput');
    const filterBtn = document.getElementById('filterBtn');
    const filterPanel = document.getElementById('filterPanel');
    const filterBackdrop = document.getElementById('filterBackdrop');
    const filterCloseBtn = document.getElementById('filterCloseBtn');
    const filterSelectAllBtn = document.getElementById('filterSelectAllBtn');
    const filterClearAllBtn = document.getElementById('filterClearAllBtn');

    // Load saved text from localStorage if it exists
    const savedText = safeGetItem('mirrorText');
    if (savedText) {
        inputText.value = savedText;
        processInput(savedText);
    }

    // Import from clipboard functionality
    importBtn.addEventListener('click', () => {
        navigator.clipboard.readText()
            .then(text => {
                inputText.value = text;
                processInput(text);
                safeSetItem('mirrorText', text);
            })
            .catch(err => {
                console.error('Failed to read clipboard:', err);
            });
    });

    // Update output and save to localStorage when input changes
    inputText.addEventListener('input', (e) => {
        const text = e.target.value;
        processInput(text);
        safeSetItem('mirrorText', text);
    });

    // Handle comment toggle changes
    commentToggle.addEventListener('change', () => {
        processInput(inputText.value);
    });

    // Handle trailing toggle changes
    trailingToggle.addEventListener('change', () => {
        processInput(inputText.value);
    });

    // Copy button functionality
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(outputText.textContent)
            .then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text:', err);
            });
    });

    // Clear button functionality
    clearBtn.addEventListener('click', () => {
        inputText.value = '';
        processInput('');
        safeSetItem('mirrorText', '');
    });

    // Create debounced version of processInput
    const debouncedProcessInput = debounce((text) => {
        processInput(text);
    }, 300); // 300ms delay

    // Update search input handler to use debounced function
    searchInput.addEventListener('input', () => {
        debouncedProcessInput(inputText.value);
    });

    // Handle depth input changes
    depthInput.addEventListener('input', () => {
        debouncedProcessInput(inputText.value);
    });

    // Filter panel: slides in from the right, holds the checkbox folder tree
    function openFilterPanel() {
        filterPanel.classList.add('open');
        filterBackdrop.classList.add('open');
        renderFilterTree(splitLines(inputText.value));
    }
    function closeFilterPanel() {
        filterPanel.classList.remove('open');
        filterBackdrop.classList.remove('open');
    }

    filterBtn.addEventListener('click', openFilterPanel);
    filterBackdrop.addEventListener('click', closeFilterPanel);
    filterCloseBtn.addEventListener('click', closeFilterPanel);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && filterPanel.classList.contains('open')) {
            closeFilterPanel();
        }
    });

    filterSelectAllBtn.addEventListener('click', () => {
        excludedPaths.clear();
        persistFilterState();
        processInput(inputText.value);
    });

    filterClearAllBtn.addEventListener('click', () => {
        // Excluding just the top-level folders is enough - hiding a folder
        // already hides everything nested under it (see isPathExcluded).
        const { root, pathMap } = buildDirTree(splitLines(inputText.value));
        excludedPaths = new Set(Object.keys(root).map(name => pathMap.get(root[name])));
        persistFilterState();
        processInput(inputText.value);
    });
});

// localStorage can throw (QuotaExceededError, private-mode SecurityError, etc.)
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.error('Failed to save to localStorage:', err);
    }
}

function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        console.error('Failed to read from localStorage:', err);
        return null;
    }
}

// ---- Filter panel: folder tree with checkboxes to hide a folder (and everything nested in it) ----

// Full "a/b/c" folder paths the user has explicitly unchecked. A path being
// excluded also hides everything nested under it - see isPathExcluded/hasExcludedAncestor.
let excludedPaths = new Set(loadPathSet('excludedPaths'));
// Full folder paths currently expanded in the checkbox tree, so re-renders (on
// every keystroke while the panel is open) don't collapse what the user opened.
let expandedPaths = new Set(loadPathSet('expandedPaths'));

function loadPathSet(key) {
    const raw = safeGetItem(key);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string') : [];
    } catch (err) {
        return [];
    }
}

function persistFilterState() {
    safeSetItem('excludedPaths', JSON.stringify(Array.from(excludedPaths)));
    safeSetItem('expandedPaths', JSON.stringify(Array.from(expandedPaths)));
}

// A file is hidden if any ancestor directory (or the file's own immediate
// directory) is in excludedPaths - unchecking a folder hides its whole subtree.
function isPathExcluded(filePath) {
    if (excludedPaths.size === 0) return false;
    const parts = filePath.split('/').filter(p => p !== '');
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) { // last part is the file itself, not a dir
        current = current ? current + '/' + parts[i] : parts[i];
        if (excludedPaths.has(current)) return true;
    }
    return false;
}

// Same ancestor walk as isPathExcluded, but for a folder path itself (used to
// grey out/disable a descendant folder's checkbox when a parent is unchecked).
function hasExcludedAncestor(path) {
    const parts = path.split('/');
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
        current = current ? current + '/' + parts[i] : parts[i];
        if (excludedPaths.has(current)) return true;
    }
    return false;
}

function isFilterPanelOpen() {
    const panel = document.getElementById('filterPanel');
    return !!panel && !!panel.classList && panel.classList.contains('open');
}

// Rebuilds the checkbox tree panel from the current (unfiltered) file list.
// Only the currently-expanded branches are materialized as DOM - collapsed
// folders stay as plain objects in memory until the user expands them.
function renderFilterTree(files) {
    const container = document.getElementById('filterTreeContainer');
    if (!container) return;

    const { root, orderMap, pathMap } = buildDirTree(files);

    // Drop stale entries for folders that no longer exist in the current input,
    // so localStorage doesn't grow unbounded across pastes.
    const validPaths = new Set();
    collectPaths(root, pathMap, validPaths);
    for (const p of Array.from(excludedPaths)) if (!validPaths.has(p)) excludedPaths.delete(p);
    for (const p of Array.from(expandedPaths)) if (!validPaths.has(p)) expandedPaths.delete(p);
    persistFilterState();

    container.textContent = '';
    if (Object.keys(root).length === 0) {
        container.textContent = 'No folders to filter.';
        return;
    }
    container.appendChild(buildTreeList(root, orderMap, pathMap));
}

// WeakMap has no direct iteration - walk the tree to collect the set of paths
// that actually exist right now (for pruning stale excluded/expanded entries).
function collectPaths(node, pathMap, out) {
    Object.keys(node).forEach(name => {
        const child = node[name];
        out.add(pathMap.get(child));
        collectPaths(child, pathMap, out);
    });
}

function buildTreeList(node, orderMap, pathMap) {
    const ul = document.createElement('ul');
    ul.className = 'filter-tree-list';
    Object.keys(node)
        .sort((a, b) => orderMap.get(node[a]) - orderMap.get(node[b]))
        .forEach(name => {
            ul.appendChild(createTreeNodeElement(name, node[name], orderMap, pathMap));
        });
    return ul;
}

function createTreeNodeElement(name, node, orderMap, pathMap) {
    const path = pathMap.get(node);
    const hasChildren = Object.keys(node).length > 0;
    const disabledByAncestor = hasExcludedAncestor(path);
    const isExpanded = expandedPaths.has(path);

    const li = document.createElement('li');
    li.className = 'filter-tree-item';

    const row = document.createElement('div');
    row.className = 'filter-tree-row';

    const caret = document.createElement('span');
    caret.className = 'filter-tree-caret' + (hasChildren ? '' : ' filter-tree-caret-empty');
    if (hasChildren) {
        caret.textContent = isExpanded ? '▼' : '▶';
        caret.addEventListener('click', () => {
            if (expandedPaths.has(path)) {
                expandedPaths.delete(path);
            } else {
                expandedPaths.add(path);
            }
            persistFilterState();
            renderFilterTree(splitLines(document.getElementById('inputText').value));
        });
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = disabledByAncestor ? false : !excludedPaths.has(path);
    checkbox.disabled = disabledByAncestor;
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            excludedPaths.delete(path);
        } else {
            excludedPaths.add(path);
        }
        persistFilterState();
        processInput(document.getElementById('inputText').value);
    });

    const label = document.createElement('span');
    label.className = 'filter-tree-label' + (disabledByAncestor ? ' filter-tree-label-disabled' : '');
    label.textContent = name;

    row.appendChild(caret);
    row.appendChild(checkbox);
    row.appendChild(label);
    li.appendChild(row);

    if (hasChildren && isExpanded) {
        li.appendChild(buildTreeList(node, orderMap, pathMap));
    }

    return li;
}

function splitLines(text) {
    return text.trim()
        .split(/\r?\n/)
        .filter(line => line.trim() !== '');  // Remove empty lines
}

function processInput(text) {
    const files = splitLines(text);

    // Convert to tree structure and display
    const searchFiltered = applyFilter(files);
    const visibleFiles = searchFiltered.filter(file => !isPathExcluded(file));
    const treeOutput = convertToTreeStructure(visibleFiles);
    const formattedOutput = formatTreeOutput(treeOutput);
    document.getElementById('outputText').textContent = formattedOutput;

    // Keep the filter panel's checkbox tree in sync while it's open; skip
    // the extra work entirely otherwise so normal typing is unaffected.
    if (isFilterPanelOpen()) {
        renderFilterTree(files);
    }
}

function formatTreeOutput(treeOutput) {
    const commentToggle = document.getElementById('commentToggle');
    const trailingToggle = document.getElementById('trailingToggle');
    
    // If no formatting needed, return original output
    if (!commentToggle.checked && !trailingToggle.checked) {
        return treeOutput;
    }

    const lines = treeOutput.split('\n');
    
    // Find the longest line length without any formatting
    // (loop instead of Math.max(...lines) to avoid blowing the call stack on large trees)
    const maxLength = lines.reduce((max, line) => Math.max(max, line.length), 0);

    // Format each line
    return lines
        .map(line => {
            if (!line.includes('──')) {
                return line; // Return root line unchanged
            }

            let formattedLine = line;

            // Add trailing slash if enabled
            if (trailingToggle.checked) {
                formattedLine += '/';
            }

            // Add comment if enabled
            if (commentToggle.checked) {
                const currentLength = formattedLine.length;
                const padding = ' '.repeat(maxLength - line.length + (trailingToggle.checked ? 0 : 1));
                formattedLine += padding + ' #';
            }

            return formattedLine;
        })
        .join('\n');
}

// Builds a directory-only tree from git ls-tree style file paths. git ls-tree
// only ever lists files (blobs), so the last segment of any path is always a
// file and is dropped - only directories become nodes. Shared by the text
// tree renderer (convertToTreeStructure) and the checkbox filter tree.
function buildDirTree(files) {
    const root = {};
    const orderMap = new WeakMap(); // Track insertion order, keyed by node object (not name) so
                                     // same-named folders in different branches can't collide
    const pathMap = new WeakMap();  // Full "a/b/c" path, keyed by node object

    function addPathToTree(node, pathParts, order, parentPath) {
        // Base case: no more path parts to process
        if (pathParts.length === 0) return;

        const [currentPart, ...remainingParts] = pathParts;

        // Skip empty path segments
        if (!currentPart) {
            addPathToTree(node, remainingParts, order, parentPath);
            return;
        }

        // git ls-tree output only lists files (blobs), so the last segment of any
        // path is always a file, never an empty directory - skip it regardless of name
        const isFile = remainingParts.length === 0;
        if (isFile) return;

        // Create node if it doesn't exist and track its order/path
        if (!node[currentPart]) {
            node[currentPart] = {};
            orderMap.set(node[currentPart], order);
            pathMap.set(node[currentPart], parentPath ? parentPath + '/' + currentPart : currentPart);
        }

        // Process remaining path parts
        addPathToTree(node[currentPart], remainingParts, order, pathMap.get(node[currentPart]));
    }

    files.forEach((file, index) => {
        const pathParts = file
            .trim()
            .split('/')
            .filter(part => part !== '');

        addPathToTree(root, pathParts, index, '');
    });

    return { root, orderMap, pathMap };
}

function convertToTreeStructure(files) {
    if (!files || files.length === 0) return '';

    const { root, orderMap } = buildDirTree(files);
    const maxDepth = getMaxDepth();

    /**
     * Generates ASCII tree representation of the directory structure
     * @param {Object} node - Current node in the tree
     * @param {string} prefix - Current line prefix for ASCII art
     * @param {number} depth - Depth of the entries being rendered at this level (root's children = 1)
     * @returns {string} ASCII tree representation
     */
    function buildTree(node, prefix = '', depth = 1) {
        const entries = Object.keys(node)
            .sort((a, b) => orderMap.get(node[a]) - orderMap.get(node[b])); // Sort by insertion order

        return entries
            .map((entry, index) => {
                const isLast = index === entries.length - 1;
                const branch = isLast ? '└── ' : '├── ';
                const nextPrefix = prefix + (isLast ? '    ' : '│   ');
                const subTree = (!maxDepth || depth < maxDepth)
                    ? buildTree(node[entry], nextPrefix, depth + 1)
                    : '';

                return prefix + branch + entry + (subTree ? '\n' + subTree : '');
            })
            .join('\n');
    }

    return '.\n' + buildTree(root);
}

function getMaxDepth() {
    const depthInput = document.getElementById('depthInput');
    const value = parseInt(depthInput.value, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
}

// VSCode-style fuzzy match: query characters must appear in target, in order,
// not necessarily contiguous. Case-insensitive. No scoring - match or no match.
function fuzzyMatch(query, target) {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length;
}

// Tests one path segment against one search word, per the active mode.
function segmentMatches(segment, word, mode) {
    if (mode === 'exact') return segment.toLowerCase() === word.toLowerCase();
    if (mode === 'fuzzy') return fuzzyMatch(word, segment);
    return segment.toLowerCase().includes(word.toLowerCase()); // 'contains' (default mode)
}

// Finds the earliest run of consecutive segments (starting at/after startIndex)
// that matches subwords one-for-one, e.g. subwords ["src", "utils"] only matches
// two ADJACENT segments "src" then "utils" - no gap allowed within a group.
// Returns the segment index right after the matched run, or -1 if none found.
function findGroupMatch(subwords, segments, mode, startIndex) {
    for (let start = startIndex; start <= segments.length - subwords.length; start++) {
        let matched = true;
        for (let i = 0; i < subwords.length; i++) {
            if (!segmentMatches(segments[start + i], subwords[i], mode)) {
                matched = false;
                break;
            }
        }
        if (matched) return start + subwords.length;
    }
    return -1;
}

// Groups must match segments in order (left-to-right); gaps BETWEEN groups are
// allowed, but a group's own subwords must match a CONSECUTIVE run of segments -
// e.g. groups [["types"], ["finance"]] (from "types finance") match segments
// [..., "types", "billing", "finance"], but group [["src", "utils"]] (from
// "src/utils") only matches "utils" as a direct child of "src".
function segmentsMatchInOrder(groups, segments, mode) {
    let cursor = 0;
    for (const group of groups) {
        const next = findGroupMatch(group, segments, mode, cursor);
        if (next === -1) return false;
        cursor = next;
    }
    return true;
}

// Splits a token on "/" into a group of subwords, dropping empty parts
// (handles stray/leading/trailing slashes like "src/" or "/utils").
function toGroup(token) {
    return token.split('/').filter(part => part.length > 0);
}

// Search text starts with an optional mode prefix:
//   e:{words} - each word must exactly equal a path segment
//   f:{words} - each word must fuzzy-match a path segment
//   {words}   - each word must be contained (substring) in a path segment
// Space-separated words may match anywhere deeper (gaps allowed, order respected).
// A word containing "/" (e.g. "src/utils") requires its parts to be direct,
// consecutive parent/child segments instead. A "!word" token excludes any file
// with a matching group anywhere in its path.
function parseSearch(searchText) {
    let mode = 'contains';
    let rest = searchText;
    const lower = searchText.toLowerCase();
    if (lower.startsWith('e:')) {
        mode = 'exact';
        rest = searchText.slice(2);
    } else if (lower.startsWith('f:')) {
        mode = 'fuzzy';
        rest = searchText.slice(2);
    }

    const tokens = rest.split(/\s+/).filter(t => t);
    const includeGroups = tokens
        .filter(t => !t.startsWith('!'))
        .map(toGroup)
        .filter(g => g.length > 0);
    const excludeGroups = tokens
        .filter(t => t.startsWith('!'))
        .map(t => toGroup(t.slice(1)))
        .filter(g => g.length > 0); // ignore bare "!" (or "!/") - it would match everything

    return { mode, includeGroups, excludeGroups };
}

function applyFilter(files) {
    const searchText = document.getElementById('searchInput').value.trim();
    if (!searchText) return files;

    const { mode, includeGroups, excludeGroups } = parseSearch(searchText);

    return files.filter(file => {
        const segments = file.split('/').filter(s => s !== '');

        if (excludeGroups.some(group => findGroupMatch(group, segments, mode, 0) !== -1)) {
            return false;
        }

        if (includeGroups.length > 0) {
            return segmentsMatchInOrder(includeGroups, segments, mode);
        }

        return true;
    });
}

function maintainTreeStructure(lines) {
    const result = [lines[0]]; // Keep root
    const indentStack = [0];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const indent = line.search(/\S/); // Find first non-whitespace character

        // Keep track of current indent level
        while (indentStack[indentStack.length - 1] >= indent) {
            indentStack.pop();
        }

        // If parent line was included, include this line
        if (indentStack.length > 0) {
            result.push(line);
        }

        indentStack.push(indent);
    }

    return result.join('\n');
}

// Replace throttle with debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, wait);
    }
}