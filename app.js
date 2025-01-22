document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const outputText = document.getElementById('outputText');
    const copyBtn = document.getElementById('copyBtn');
    const commentToggle = document.getElementById('commentToggle');
    const trailingToggle = document.getElementById('trailingToggle');

    // Load saved text from localStorage if it exists
    const savedText = localStorage.getItem('mirrorText');
    if (savedText) {
        inputText.value = savedText;
        processInput(savedText);
    }

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