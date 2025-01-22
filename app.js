document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const outputText = document.getElementById('outputText');
    const copyBtn = document.getElementById('copyBtn');

    // Load saved text from localStorage if it exists
    const savedText = localStorage.getItem('mirrorText');
    if (savedText) {
        inputText.value = savedText;
        outputText.textContent = savedText;
    }

    // Update output and save to localStorage when input changes
    inputText.addEventListener('input', (e) => {
        const text = e.target.value;
        outputText.textContent = text;
        localStorage.setItem('mirrorText', text);
    });

    // Copy button functionality
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(inputText.value)
            .then(() => {
                // Optional: Show some feedback that text was copied
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