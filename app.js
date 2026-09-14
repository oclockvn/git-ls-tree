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

function processInput(text) {
    // Split the input text into an array of files
    const files = text.trim()
        .split(/\r?\n/)
        .filter(line => line.trim() !== '');  // Remove empty lines
    
    // Convert to tree structure and display
    const filteredFiles = applyFilter(files);
    const treeOutput = convertToTreeStructure(filteredFiles);
    const formattedOutput = formatTreeOutput(treeOutput);
    document.getElementById('outputText').textContent = formattedOutput;
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

function convertToTreeStructure(files) {
    if (!files || files.length === 0) return '';
    const root = {};
    const orderMap = new WeakMap(); // Track insertion order, keyed by node object (not name) so
                                     // same-named folders in different branches can't collide

    /**
     * Recursively adds a path to the tree structure
     * @param {Object} node - Current node in the tree
     * @param {string[]} pathParts - Array of path segments
     * @param {number} order - Insertion order of the path
     */
    function addPathToTree(node, pathParts, order) {
        // Base case: no more path parts to process
        if (pathParts.length === 0) return;

        const [currentPart, ...remainingParts] = pathParts;

        // Skip empty path segments
        if (!currentPart) {
            addPathToTree(node, remainingParts, order);
            return;
        }

        // git ls-tree output only lists files (blobs), so the last segment of any
        // path is always a file, never an empty directory - skip it regardless of name
        const isFile = remainingParts.length === 0;
        if (isFile) return;

        // Create node if it doesn't exist and track its order
        if (!node[currentPart]) {
            node[currentPart] = {};
            orderMap.set(node[currentPart], order);
        }

        // Process remaining path parts
        addPathToTree(node[currentPart], remainingParts, order);
    }

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

    // Process each file path with its order
    files.forEach((file, index) => {
        const pathParts = file
            .trim()
            .split('/')
            .filter(part => part !== '');

        addPathToTree(root, pathParts, index);
    });

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