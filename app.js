document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const outputText = document.getElementById('outputText');
    const copyBtn = document.getElementById('copyBtn');

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
    document.getElementById('outputText').textContent = treeOutput;
}

function convertToTreeStructure(files) {
    const root = {};

    // Build a nested structure from the file paths
    for (const file of files) {
        const parts = file.trim().split('/').filter(part => part !== '');
        let current = root;
        
        // Only process directory parts (exclude the last part which is the file name)
        for (const part of parts.slice(0, -1)) {
            current[part] = current[part] || {};
            current = current[part];
        }
    }

    // Generate ASCII tree from the nested structure
    function buildTree(node, prefix = '') {
        const entries = Object.keys(node).sort();  // Sort folders alphabetically
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

    return '.\n' + buildTree(root);
}