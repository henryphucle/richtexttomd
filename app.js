/**
 * richtexttomd - Modern Rich Text to Markdown Logic
 * Features:
 * - Real-time sync (optional)
 * - Turndown integration for HTML -> MD
 * - Marked integration for MD -> HTML
 * - LocalStorage persistence
 * - Premium Toast notifications
 */

// State Management
const STATE = {
    isSyncingFromRT: false,
    isSyncingFromMD: false,
    liveSyncEnabled: false,
    saveTimeout: null,
    syncTimeout: null
};

// --- DOM Elements ---
let DOM = {};

function initDOM() {
    DOM = {
        editor: document.getElementById('editor'),
        markdownInput: document.getElementById('markdown-editor'),
        convertToMdBtn: document.getElementById('convert-to-md'),
        convertToRtBtn: document.getElementById('convert-to-rt'),
        exportBtn: document.getElementById('export-btn'),
        filenameInput: document.getElementById('filename-input'),
        liveSyncToggle: document.getElementById('live-sync-toggle'),
        aiPolishBtn: document.getElementById('ai-polish-btn'),
        aiSummarizeBtn: document.getElementById('ai-summarize-btn'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        closeSettings: document.getElementById('close-settings'),
        saveSettings: document.getElementById('save-settings'),
        apiKeyInput: document.getElementById('api-key-input'),
        toast: document.getElementById('toast'),
        toastMsg: document.getElementById('toast-msg'),
        toastIcon: document.getElementById('toast-icon')
    };
}

function getApiKey() {
    return localStorage.getItem('richtexttomd_gemini_key') || "";
}

// --- Library Setup ---
let quill;
let turndownService;

function initQuill() {
    quill = new Quill('#editor', {
        theme: 'snow',
        placeholder: 'Start writing your rich text...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'clean']
            ]
        }
    });

    quill.on('text-change', () => {
        handleRTChange();
    });
}

function initTurndown() {
    turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
    });
}

// --- Core Logic ---

function showToast(message, iconClass = 'fa-circle-check') {
    DOM.toastMsg.innerText = message;
    DOM.toastIcon.className = `fa-solid ${iconClass} toast-icon`;
    DOM.toast.classList.add('visible');

    setTimeout(() => {
        DOM.toast.classList.remove('visible');
    }, 3000);
}

function handleRTChange() {
    if (STATE.isSyncingFromMD) return;

    saveToLocal();

    if (STATE.liveSyncEnabled) {
        clearTimeout(STATE.syncTimeout);
        STATE.syncTimeout = setTimeout(() => {
            syncRTtoMD();
        }, 500);
    }
}

function handleMDChange() {
    if (STATE.isSyncingFromRT) return;

    saveToLocal();

    if (STATE.liveSyncEnabled) {
        clearTimeout(STATE.syncTimeout);
        STATE.syncTimeout = setTimeout(() => {
            syncMDtoRT();
        }, 500);
    }
}

function syncRTtoMD() {
    if (STATE.isSyncingFromMD) return;
    STATE.isSyncingFromRT = true;

    const html = quill.root.innerHTML;
    const md = turndownService.turndown(html);
    DOM.markdownInput.value = md;

    STATE.isSyncingFromRT = false;
    console.log('RT -> MD Synced');
}

function syncMDtoRT() {
    if (STATE.isSyncingFromRT) return;
    STATE.isSyncingFromMD = true;

    const md = DOM.markdownInput.value;
    const html = marked.parse(md);
    quill.clipboard.dangerouslyPasteHTML(html);

    STATE.isSyncingFromMD = false;
    console.log('MD -> RT Synced');
}

function saveToLocal() {
    clearTimeout(STATE.saveTimeout);
    STATE.saveTimeout = setTimeout(() => {
        localStorage.setItem('richtexttomd_rt', quill.root.innerHTML);
        localStorage.setItem('richtexttomd_md', DOM.markdownInput.value);
        localStorage.setItem('richtexttomd_filename', DOM.filenameInput.value);
    }, 1000);
}

function loadFromLocal() {
    const cachedRT = localStorage.getItem('richtexttomd_rt');
    const cachedMD = localStorage.getItem('richtexttomd_md');
    const cachedFilename = localStorage.getItem('richtexttomd_filename');

    if (cachedRT) {
        STATE.isSyncingFromMD = true;
        quill.clipboard.dangerouslyPasteHTML(cachedRT);
        STATE.isSyncingFromMD = false;
    }
    if (cachedMD) {
        DOM.markdownInput.value = cachedMD;
    }
    if (cachedFilename) {
        DOM.filenameInput.value = cachedFilename;
    }
}

function exportMarkdown() {
    const md = DOM.markdownInput.value;
    if (!md.trim()) {
        showToast('Nothing to export!', 'fa-circle-exclamation');
        return;
    }

    const filename = DOM.filenameInput.value.trim() || 'untitled-document';
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.md`;
    a.click();

    URL.revokeObjectURL(url);
    showToast(`Exported as ${filename}.md`);
}

async function generateAIContent(prompt, systemInstruction) {
    const key = getApiKey();
    if (!key) {
        showToast("Missing Gemini API Key! Check Settings.", "fa-circle-exclamation");
        DOM.settingsModal.classList.add('active');
        return "";
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] }
            })
        });
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (err) {
        console.error(err);
        showToast("AI Request Failed", "fa-circle-exclamation");
        return "";
    }
}

async function handleAIPolish() {
    const html = quill.root.innerHTML;
    if (!quill.getText().trim()) return showToast("Nothing to polish!", "fa-circle-exclamation");

    DOM.aiPolishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> POLISHING...';
    DOM.aiPolishBtn.disabled = true;

    const prompt = `Polish this HTML content for clarity and grammar. Return ONLY valid HTML.\n\n${html}`;
    const system = "You are a professional editor. Output only clean, valid HTML matching the input's structure.";
    const result = await generateAIContent(prompt, system);

    if (result) {
        const clean = result.replace(/^```html\s*/i, '').replace(/```\s*$/i, '');
        quill.clipboard.dangerouslyPasteHTML(clean);
        saveToLocal();
        showToast("AI Polish Applied");
    }

    DOM.aiPolishBtn.innerHTML = '<i class="fa-solid fa-sparkles"></i> POLISH';
    DOM.aiPolishBtn.disabled = false;
}

async function handleAISummarize() {
    const text = quill.getText().trim();
    if (!text) return showToast("Nothing to summarize!", "fa-circle-exclamation");

    DOM.aiSummarizeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SUMMARIZING...';
    DOM.aiSummarizeBtn.disabled = true;

    const prompt = `Summarize this content as a short HTML paragraph starting with '✨ AI Summary:'.\n\n${text}`;
    const system = "Output ONLY a single HTML paragraph (<p>...).";
    const result = await generateAIContent(prompt, system);

    if (result) {
        const clean = result.replace(/^```html\s*/i, '').replace(/```\s*$/i, '');
        quill.clipboard.dangerouslyPasteHTML(clean + "<br>" + quill.root.innerHTML);
        saveToLocal();
        showToast("AI Summary Added");
    }

    DOM.aiSummarizeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> SUMMARIZE';
    DOM.aiSummarizeBtn.disabled = false;
}

async function handlePdfUpload(e) {
    const key = getApiKey();
    if (!key) {
        showToast("Missing Gemini API Key! Check Settings.", "fa-circle-exclamation");
        DOM.settingsModal.classList.add('active');
        e.target.value = '';
        return;
    }

    const file = e.target.files[0];
    if (!file) return;

    const uploadBtn = document.getElementById('upload-pdf-btn');
    const originalHtml = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> UPLOADING...';
    uploadBtn.disabled = true;

    try {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            const prompt = "Convert this PDF to well-formatted Markdown. Return ONLY markdown.";

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: "application/pdf", data: base64 } }
                        ]
                    }]
                })
            });
            const data = await response.json();
            const md = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            if (md) {
                DOM.markdownInput.value = md.replace(/^```markdown\s*/i, '').replace(/```\s*$/i, '');
                syncMDtoRT();
                showToast("PDF Converted Successfully");
            }
        };
        reader.readAsDataURL(file);
    } catch (err) {
        showToast("PDF Conversion Failed", "fa-circle-exclamation");
    } finally {
        uploadBtn.innerHTML = originalHtml;
        uploadBtn.disabled = false;
        e.target.value = '';
    }
}

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initQuill();
    initTurndown();
    loadFromLocal();

    // Event Listeners
    DOM.convertToMdBtn.addEventListener('click', () => {
        syncRTtoMD();
        showToast('Converted to Markdown');
    });

    DOM.convertToRtBtn.addEventListener('click', () => {
        syncMDtoRT();
        showToast('Converted to Rich Text');
    });

    DOM.exportBtn.addEventListener('click', exportMarkdown);
    DOM.aiPolishBtn.addEventListener('click', handleAIPolish);
    DOM.aiSummarizeBtn.addEventListener('click', handleAISummarize);

    // Settings Listeners
    DOM.settingsBtn.addEventListener('click', () => {
        DOM.apiKeyInput.value = getApiKey();
        DOM.settingsModal.classList.add('active');
    });

    DOM.closeSettings.addEventListener('click', () => {
        DOM.settingsModal.classList.remove('active');
    });

    DOM.saveSettings.addEventListener('click', () => {
        const key = DOM.apiKeyInput.value.trim();
        localStorage.setItem('richtexttomd_gemini_key', key);
        showToast("Settings Saved Locally");
        DOM.settingsModal.classList.remove('active');
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === DOM.settingsModal) {
            DOM.settingsModal.classList.remove('active');
        }
    });

    const pdfBtn = document.getElementById('upload-pdf-btn');
    const pdfInput = document.getElementById('pdf-upload');
    if (pdfBtn && pdfInput) {
        pdfBtn.addEventListener('click', () => pdfInput.click());
        pdfInput.addEventListener('change', handlePdfUpload);
    }

    DOM.markdownInput.addEventListener('input', handleMDChange);

    DOM.liveSyncToggle.addEventListener('click', () => {
        STATE.liveSyncEnabled = !STATE.liveSyncEnabled;
        DOM.liveSyncToggle.classList.toggle('sync-active', STATE.liveSyncEnabled);

        if (STATE.liveSyncEnabled) {
            showToast('Live Sync Enabled', 'fa-rotate');
            syncRTtoMD(); // Initial sync
        } else {
            showToast('Live Sync Disabled', 'fa-toggle-off');
        }
        localStorage.setItem('richtexttomd_sync', STATE.liveSyncEnabled);
    });

    // Clear functionality
    const clearBtn = document.getElementById('clear-rt');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear both editors?')) {
                quill.root.innerHTML = '';
                DOM.markdownInput.value = '';
                saveToLocal();
                showToast('Editors cleared', 'fa-eraser');
            }
        });
    }

    // Load sync preference
    const savedSync = localStorage.getItem('richtexttomd_sync') === 'true';
    if (savedSync) {
        STATE.liveSyncEnabled = true;
        DOM.liveSyncToggle.classList.add('sync-active');
    }
});
