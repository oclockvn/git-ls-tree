document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const outputText = document.getElementById('outputText');
    const copyBtn = document.getElementById('copyBtn');
    const importBtn = document.getElementById('importBtn');
    const clearBtn = document.getElementById('clearBtn');
    const commentToggle = document.getElementById('commentToggle');
    const trailingToggle = document.getElementById('trailingToggle');
    const searchInput = document.getElementById('searchInput');

    // Load saved text from localStorage if it exists
    const savedText = localStorage.getItem('mirrorText');
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
                localStorage.setItem('mirrorText', text);
            })
            .catch(err => {
                console.error('Failed to read clipboard:', err);
            });
    });

    // Update output and save to localStorage when input changes
    inputText.addEventListener('input', (e) => {
        const text = e.target.value;
        processInput(text);
        localStorage.setItem('mirrorText', text);
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
        localStorage.setItem('mirrorText', '');
    });

    // Create debounced version of processInput
    const debouncedProcessInput = debounce((text) => {
        processInput(text);
    }, 300); // 300ms delay

    // Update search input handler to use debounced function
    searchInput.addEventListener('input', () => {
        debouncedProcessInput(inputText.value);
    });
});

function processInput(text) {
    // Split the input text into an array of files
    const files = text.trim()
        .split(/\r?\n/)
        .filter(line => line.trim() !== '');  // Remove empty lines
    
    // Convert to tree structure and display
    const treeOutput = convertToTreeStructure(files);
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
    const maxLength = Math.max(...lines.map(line => {
        // Get base length without any formatting
        return line.length;
    }));

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
    const orderMap = new Map(); // Track insertion order

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

        // Check if this is a file (has extension and is last part)
        const isFile = remainingParts.length === 0 && currentPart.includes('.');
        if (isFile) return;

        // Create node if it doesn't exist and track its order
        if (!node[currentPart]) {
            node[currentPart] = {};
            orderMap.set(currentPart, order);
        }
        
        // Process remaining path parts
        addPathToTree(node[currentPart], remainingParts, order);
    }

    /**
     * Generates ASCII tree representation of the directory structure
     * @param {Object} node - Current node in the tree
     * @param {string} prefix - Current line prefix for ASCII art
     * @returns {string} ASCII tree representation
     */
    function buildTree(node, prefix = '') {
        const entries = Object.keys(node)
            .sort((a, b) => orderMap.get(a) - orderMap.get(b)); // Sort by insertion order
        
        return entries
            .map((entry, index) => {
                const isLast = index === entries.length - 1;
                const branch = isLast ? '└── ' : '├── ';
                const nextPrefix = prefix + (isLast ? '    ' : '│   ');
                const subTree = buildTree(node[entry], nextPrefix);
                
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

function filterTreeOutput(treeOutput) {
    const searchText = document.getElementById('searchInput').value.trim();
    console.log(`searching for ${searchText}`)
    if (!searchText) return treeOutput;

    // Split search text into patterns
    const patterns = searchText.split(/\s+/).filter(p => p);
    
    // Separate include and exclude patterns and prepare regex
    const includePatterns = patterns
        .filter(p => !p.startsWith('!'))
        .map(p => {
            const pattern = escapeRegExp(p);
            // If pattern doesn't contain slash, make it match with or without slashes around it
            return new RegExp(pattern.includes('/') ? pattern : `.*[/]?${pattern}[/]?.*`, 'i');
        });
    
    const excludePatterns = patterns
        .filter(p => p.startsWith('!'))
        .map(p => {
            const pattern = escapeRegExp(p.slice(1));
            // If pattern doesn't contain slash, make it match with or without slashes around it
            return new RegExp(pattern.includes('/') ? pattern : `.*[/]?${pattern}[/]?.*`, 'i');
        });

    // Filter lines
    const lines = treeOutput.split('\n');
    const filteredLines = lines.filter(line => {
        // Always keep the root line
        if (line === '.') return true;

        // Check exclude patterns first
        if (excludePatterns.some(pattern => pattern.test(line))) {
            return false;
        }

        // If there are include patterns, at least one must match
        if (includePatterns.length > 0) {
            let included = includePatterns.some(pattern => pattern.test(line));
            console.log(`line ${line} included ${included}`)
            return included;
        }

        // If no include patterns, keep the line
        return true;
    });

    // Ensure tree structure remains valid
    return maintainTreeStructure(filteredLines);
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

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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