/**
 * richtexttomd - Modern Rich Text to Markdown Logic
 * Features:
 * - Real-time sync (optional)
 * - Turndown integration for HTML -> MD
 * - Marked integration for MD -> HTML
 * - LocalStorage persistence
 * - Premium Toast notifications
 */

// App Configuration
const APP_VERSION = '1.0.0';

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
        appVersion: document.getElementById('app-version'),
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
        toastIcon: document.getElementById('toast-icon'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingTitle: document.querySelector('.loading-title'),
        loadingSubtitle: document.querySelector('.loading-subtitle'),
        rtCopyBtn: document.getElementById('rt-copy-btn'),
        rtPasteBtn: document.getElementById('rt-paste-btn'),
        mdCopyBtn: document.getElementById('md-copy-btn'),
        mdPasteBtn: document.getElementById('md-paste-btn')
    };
}

function getApiKey() {
    return localStorage.getItem('richtexttomd_gemini_key') || "";
}

// --- Library Setup ---
let quill;
let turndownService;

function initQuill() {
    // Register a custom icon for table deletion
    const icons = Quill.import('ui/icons');
    icons['table-delete'] = '<i class="fa-solid fa-trash-can" style="font-size: 14px;"></i>';

    quill = new Quill('#editor', {
        theme: 'snow',
        placeholder: 'Start writing your rich text...',
        modules: {
            table: true, // Enabled table module in v2
            toolbar: {
                container: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    ['blockquote', 'code-block'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['link', 'table', 'table-delete', 'clean'] // Added table-delete
                ],
                handlers: {
                    'table-delete': function() {
                        const tableModule = quill.getModule('table');
                        if (tableModule) {
                            tableModule.deleteTable();
                        }
                    }
                }
            }
        }
    });

    // Add a tooltip to our custom button
    const deleteBtn = document.querySelector('.ql-table-delete');
    if (deleteBtn) {
        deleteBtn.setAttribute('title', 'Delete Table');
    }

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
    
    // Add Github Flavored Markdown (GFM) support for tables, task lists, etc.
    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }
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

    // Get a clone of the editor's content to manipulate safely
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = quill.root.innerHTML;
    
    // Convert Quill's flat list structure and handle tables for GFM compatibility
    prepareHTMLForMarkdown(tempDiv);
    
    const md = turndownService.turndown(tempDiv.innerHTML);
    DOM.markdownInput.value = md;

    STATE.isSyncingFromRT = false;
    console.log('RT -> MD Synced');
}

/**
 * Transforms Quill's flat list structure into standard nested HTML (ol/ul > li > ol/ul > li).
 * This allows Turndown to perceive the nesting and generate correct indented Markdown.
 */
/**
 * Prepares Quill-generated HTML for cleaner Markdown conversion.
 * - Transforms flat list structure into standard nested HTML.
 * - Converts the first row of tables to header rows (th) for GFM compatibility.
 */
function prepareHTMLForMarkdown(container) {
    // 1. Handle Lists
    const lists = container.querySelectorAll('ol, ul');
    lists.forEach(originalList => {
        const items = Array.from(originalList.querySelectorAll(':scope > li'));
        if (items.length === 0) return;
        
        const newRoot = document.createElement(originalList.tagName);
        let stack = [{ level: 0, list: newRoot }];
        
        items.forEach(item => {
            const match = item.className.match(/ql-indent-(\d+)/);
            const level = match ? parseInt(match[1], 10) : 0;
            
            while (stack.length > 1 && level < stack[stack.length - 1].level) {
                stack.pop();
            }
            
            if (level > stack[stack.length - 1].level) {
                const lastLi = stack[stack.length - 1].list.lastElementChild;
                if (lastLi) {
                    const subList = document.createElement(originalList.tagName);
                    lastLi.appendChild(subList);
                    stack.push({ level: level, list: subList });
                }
            }
            
            const itemClone = item.cloneNode(true);
            const classesToRemove = Array.from(itemClone.classList).filter(c => c.startsWith('ql-indent-'));
            if (classesToRemove.length > 0) {
                itemClone.classList.remove(...classesToRemove);
            }
            if (itemClone.classList.length === 0) {
                itemClone.removeAttribute('class');
            }
            
            stack[stack.length - 1].list.appendChild(itemClone);
        });
        
        originalList.replaceWith(newRoot);
    });

    // 2. Handle Tables (GFM requires <th> in the first row to detect a table)
    const tables = container.getElementsByTagName('table');
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const rows = table.getElementsByTagName('tr');
        if (rows.length > 0) {
            const firstRow = rows[0];
            const cells = Array.from(firstRow.getElementsByTagName('td'));
            cells.forEach(td => {
                const th = document.createElement('th');
                th.innerHTML = td.innerHTML;
                // Copy over attributes (important for Quill's data-row identifiers)
                for (let k = 0; k < td.attributes.length; k++) {
                    const attr = td.attributes[k];
                    th.setAttribute(attr.name, attr.value);
                }
                if (td.parentNode) {
                    td.parentNode.replaceChild(th, td);
                }
            });
        }
    }
}

/**
 * Standardizes HTML (from Marked or AI) to ensure it plays nicely with Quill 2.0.
 * - Collapses <thead> into <tbody> for tables.
 * - Converts <th> to <td> to avoid fragmentation.
 */
function fixHTMLForQuill(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const tables = doc.querySelectorAll('table');
    tables.forEach(table => {
        let thead = table.querySelector('thead');
        let tbody = table.querySelector('tbody');
        
        if (thead) {
            if (!tbody) {
                tbody = document.createElement('tbody');
                table.appendChild(tbody);
            }
            const headRows = Array.from(thead.querySelectorAll('tr'));
            headRows.reverse().forEach(row => {
                tbody.prepend(row);
            });
            thead.remove();
        }

        const ths = table.querySelectorAll('th');
        ths.forEach(th => {
            const td = document.createElement('td');
            td.innerHTML = th.innerHTML;
            if (th.className) td.className = th.className;
            th.replaceWith(td);
        });

        // Aggressively remove whitespace-only text nodes within the table to avoid Quill fragmentation
        const cleanWhitespace = (node) => {
            const children = Array.from(node.childNodes);
            children.forEach(child => {
                if (child.nodeType === 3 && !child.textContent.trim()) {
                    child.remove();
                } else if (child.nodeType === 1) {
                    cleanWhitespace(child);
                }
            });
        };
        cleanWhitespace(table);
    });

    return doc.body.innerHTML;
}

function syncMDtoRT() {
    if (STATE.isSyncingFromRT) return;
    STATE.isSyncingFromMD = true;

    const md = DOM.markdownInput.value;
    let html = marked.parse(md);
    
    // Standardize HTML (tables, etc.) for better Quill 2.0 compatibility
    html = fixHTMLForQuill(html);
    
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

// --- Clipboard Handlers ---

async function handleCopy(type) {
    let content = "";
    if (type === 'rt') {
        content = quill.root.innerHTML;
        // For RT, we also want plain text fallback
        const plain = quill.getText();
        
        try {
            const blobHtml = new Blob([content], { type: 'text/html' });
            const blobText = new Blob([plain], { type: 'text/plain' });
            const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
            await navigator.clipboard.write(data);
            showToast("Rich Text Copied to Clipboard");
        } catch (err) {
            // Fallback to text-only if ClipboardItem fails
            await navigator.clipboard.writeText(plain);
            showToast("Text Copied (HTML export failed)", "fa-circle-exclamation");
        }
    } else {
        content = DOM.markdownInput.value;
        if (!content.trim()) return showToast("Nothing to copy!", "fa-circle-exclamation");
        await navigator.clipboard.writeText(content);
        showToast("Markdown Copied to Clipboard");
    }
}

async function handlePaste(type) {
    try {
        const text = await navigator.clipboard.readText();
        if (!text) return showToast("Clipboard is empty!", "fa-circle-exclamation");
        
        if (type === 'rt') {
            // Determine if it's likely HTML
            if (text.includes('<') && text.includes('>')) {
                quill.clipboard.dangerouslyPasteHTML(text);
            } else {
                quill.insertText(quill.getSelection()?.index || 0, text);
            }
            showToast("Pasted into Rich Text");
        } else {
            const start = DOM.markdownInput.selectionStart;
            const end = DOM.markdownInput.selectionEnd;
            const current = DOM.markdownInput.value;
            DOM.markdownInput.value = current.substring(0, start) + text + current.substring(end);
            DOM.markdownInput.selectionStart = DOM.markdownInput.selectionEnd = start + text.length;
            handleMDChange();
            showToast("Pasted into Markdown");
        }
    } catch (err) {
        console.error(err);
        showToast("Paste Failed: Check browser permissions", "fa-circle-exclamation");
    }
}

async function handleAIPolish() {
    const html = quill.root.innerHTML;
    if (!quill.getText().trim()) return showToast("Nothing to polish!", "fa-circle-exclamation");

    DOM.aiPolishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> POLISHING...';
    DOM.aiPolishBtn.disabled = true;
    DOM.loadingOverlay.classList.add('active');
    document.querySelector('.loading-title').innerText = "AI Polishing";
    document.querySelector('.loading-subtitle').innerText = "Gemini is improving your text for clarity and grammar...";

    const prompt = `Polish this HTML content for clarity and grammar. Return ONLY valid HTML.\n\n${html}`;
    const system = "You are a professional editor. Output only clean, valid HTML matching the input's structure.";
    const result = await generateAIContent(prompt, system);

    if (result) {
        const clean = result.replace(/^```html\s*/i, '').replace(/```\s*$/i, '');
        quill.clipboard.dangerouslyPasteHTML(fixHTMLForQuill(clean));
        saveToLocal();
        showToast("AI Polish Applied");
    }

    DOM.aiPolishBtn.innerHTML = '<i class="fa-solid fa-sparkles"></i> POLISH';
    DOM.aiPolishBtn.disabled = false;
    DOM.loadingOverlay.classList.remove('active');
}

async function handleAISummarize() {
    const text = quill.getText().trim();
    if (!text) return showToast("Nothing to summarize!", "fa-circle-exclamation");

    DOM.aiSummarizeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SUMMARIZING...';
    DOM.aiSummarizeBtn.disabled = true;
    DOM.loadingOverlay.classList.add('active');
    document.querySelector('.loading-title').innerText = "AI Summarizing";
    document.querySelector('.loading-subtitle').innerText = "Gemini is creating a summary of your content...";

    const prompt = `Summarize this content as a short HTML paragraph starting with '✨ AI Summary:'.\n\n${text}`;
    const system = "Output ONLY a single HTML paragraph (<p>...).";
    const result = await generateAIContent(prompt, system);

    if (result) {
        const clean = result.replace(/^```html\s*/i, '').replace(/```\s*$/i, '');
        quill.clipboard.dangerouslyPasteHTML(fixHTMLForQuill(clean) + "<br>" + quill.root.innerHTML);
        saveToLocal();
        showToast("AI Summary Added");
    }

    DOM.aiSummarizeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> SUMMARIZE';
    DOM.aiSummarizeBtn.disabled = false;
    DOM.loadingOverlay.classList.remove('active');
}

/**
 * PDFConverter - Local PDF to Markdown Parser
 * Logic ported and enhanced from pdf_to_md.py
 * Features:
 * - Dynamic font hierarchy detection (H1, H2, H3 from top sizes)
 * - Text item grouping into lines
 * - Bold/Italic preservation
 * - Paragraph merging
 */
const PDFConverter = {
    async convert(file, onProgress) {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        let allPagesContent = [];
        let fontSizeFreq = {};

        // Pass 1: Extract all text items and analyze font sizes
        for (let i = 1; i <= totalPages; i++) {
            if (onProgress) onProgress(i, totalPages, 'Analyzing');
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Wait for commonObjs to be ready
            await page.getOperatorList(); 

            // Collect font info
            const items = textContent.items.map(item => {
                const fontSize = Math.round(item.transform[0] * 10) / 10;
                if (fontSize > 5) { // Skip tiny noise
                    fontSizeFreq[fontSize] = (fontSizeFreq[fontSize] || 0) + item.str.length;
                }
                
                // Try to resolve font style from commonObjs
                let isBold = false;
                let isItalic = false;
                if (item.fontName) {
                    const fontInfo = page.commonObjs.get(item.fontName);
                    if (fontInfo && fontInfo.name) {
                        const name = fontInfo.name.toLowerCase();
                        isBold = name.includes('bold') || name.includes('condensed');
                        isItalic = name.includes('italic') || name.includes('oblique');
                    }
                }

                return {
                    text: item.str,
                    x: item.transform[4],
                    y: item.transform[5],
                    size: fontSize,
                    isBold,
                    isItalic
                };
            });

            allPagesContent.push({ items });
        }

        // Determine dynamic hierarchy
        const sortedSizes = Object.keys(fontSizeFreq)
            .map(Number)
            .sort((a, b) => b - a); // Largest first

        // Find the most frequent size as the "Body" text size
        const bodySize = Number(Object.entries(fontSizeFreq).reduce((a, b) => a[1] > b[1] ? a : b)[0]);
        const headingSizes = sortedSizes.filter(s => s > bodySize);

        const H1_SIZE = headingSizes[0] || 24;
        const H2_SIZE = headingSizes[1] || 18;
        const H3_SIZE = headingSizes[2] || 14;

        console.log(`Detected Sizes: H1=${H1_SIZE}, H2=${H2_SIZE}, H3=${H3_SIZE}, Body=${bodySize}`);

        let markdownLines = [];

        // Pass 2: Grouping items into lines and classifying
        for (let i = 0; i < allPagesContent.length; i++) {
            if (onProgress) onProgress(i + 1, totalPages, 'Converting');
            const { items } = allPagesContent[i];
            
            // Group by Y (within a small threshold)
            const linesMap = new Map();
            items.forEach(item => {
                const y = Math.round(item.y);
                let found = false;
                for (let [ly, lineItems] of linesMap) {
                    if (Math.abs(y - ly) < 3) {
                        lineItems.push(item);
                        found = true;
                        break;
                    }
                }
                if (!found) linesMap.set(y, [item]);
            });

            // Sort lines by Y descending
            const sortedLines = Array.from(linesMap.entries())
                .sort((a, b) => b[0] - a[0])
                .map(([y, lineItems]) => lineItems.sort((a, b) => a.x - b.x));

            sortedLines.forEach(lineItems => {
                const domItem = lineItems.reduce((a, b) => a.size * a.text.length > b.size * b.text.length ? a : b);
                const rawLineText = lineItems.map(it => it.text).join('').trim();
                
                if (!rawLineText) return;

                // Handle inline formatting
                const lineTextFormatted = lineItems.map(it => {
                    let t = it.text;
                    if (it.isBold && it.size <= H3_SIZE) t = `**${t}**`;
                    if (it.isItalic && it.size <= H3_SIZE) t = `*${t}*`;
                    return t;
                }).join('').trim();

                // Skip running headers/footers
                if (domItem.size <= 10.5 && (rawLineText.match(/^\d+$/) || rawLineText.length < 5)) return;

                if (domItem.size >= H1_SIZE && domItem.isBold) {
                    markdownLines.push(`# ${rawLineText}\n`);
                } else if (domItem.size >= H2_SIZE && domItem.isBold) {
                    markdownLines.push(`## ${rawLineText}\n`);
                } else if (domItem.size >= H3_SIZE && domItem.isBold) {
                    markdownLines.push(`### ${rawLineText}\n`);
                } else if (rawLineText.startsWith('•') || rawLineText.startsWith('■') || rawLineText.startsWith('-')) {
                    markdownLines.push(`- ${rawLineText.replace(/^[•■-]\s*/, '')}`);
                } else {
                    markdownLines.push(lineTextFormatted);
                }
            });
            markdownLines.push(""); 
        }

        return this.mergeParagraphs(markdownLines);
    },

    mergeParagraphs(lines) {
        const result = [];
        let buffer = [];

        const flush = () => {
            if (buffer.length > 0) {
                result.push(buffer.join(' ').replace(/\s+/g, ' '));
                buffer = [];
            }
        };

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                flush();
                result.push("");
                return;
            }

            if (trimmed.startsWith('#') || trimmed.startsWith('-')) {
                flush();
                result.push(trimmed);
            } else {
                buffer.push(trimmed);
            }
        });

        flush();

        return result.filter((l, i, arr) => !(l === "" && arr[i-1] === "")).join('\n');
    }
};

async function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Increased limit to 50MB for local processing
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        showToast("File is too large! Maximum size is 50MB.", "fa-circle-exclamation");
        e.target.value = '';
        return;
    }

    const uploadBtn = document.getElementById('upload-pdf-btn');
    const originalHtml = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PARSING...';
    uploadBtn.disabled = true;

    DOM.loadingOverlay.classList.add('active');
    
    try {
        const md = await PDFConverter.convert(file, (current, total, phase) => {
            if (DOM.loadingTitle) DOM.loadingTitle.innerText = `${phase} PDF`;
            if (DOM.loadingSubtitle) DOM.loadingSubtitle.innerText = `Page ${current} of ${total}...`;
        });

        if (md) {
            // Load to RT first
            const html = marked.parse(md);
            quill.clipboard.dangerouslyPasteHTML(html);

            // Then sync to MD editor
            DOM.markdownInput.value = md;

            saveToLocal();

            if (DOM.loadingTitle) DOM.loadingTitle.innerText = "All Set!";
            if (DOM.loadingSubtitle) DOM.loadingSubtitle.innerText = "Your content has been imported to the editor.";

            setTimeout(() => {
                DOM.loadingOverlay.classList.remove('active');
                uploadBtn.innerHTML = originalHtml;
                uploadBtn.disabled = false;
                showToast("PDF Converted Locally");
            }, 1000);
        } else {
            throw new Error("No content found");
        }

    } catch (err) {
        console.error("PDF Parsing Error:", err);
        showToast(`PDF Failed: ${err.message}`, "fa-circle-exclamation");
        DOM.loadingOverlay.classList.remove('active');
        uploadBtn.innerHTML = originalHtml;
        uploadBtn.disabled = false;
    } finally {
        e.target.value = '';
    }
}


// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
    initDOM();
    
    if (DOM.appVersion) {
        DOM.appVersion.textContent = `v${APP_VERSION}`;
    }

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

    DOM.rtCopyBtn.addEventListener('click', () => handleCopy('rt'));
    DOM.mdCopyBtn.addEventListener('click', () => handleCopy('md'));
    DOM.rtPasteBtn.addEventListener('click', () => handlePaste('rt'));
    DOM.mdPasteBtn.addEventListener('click', () => handlePaste('md'));

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

    DOM.filenameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            exportMarkdown();
        }
    });

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
