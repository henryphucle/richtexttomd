# CLAUDE.md — AI Assistant Guide for richtexttomd

## Project Overview

**richtexttomd** is a privacy-first, serverless web application for bidirectional conversion between Rich Text and Markdown. It runs entirely in the browser with zero backend, no build step, and no npm dependencies.

**Key capabilities:**
- Real-time Rich Text ↔ Markdown conversion
- AI-powered text polish and summarization (Google Gemini)
- PDF import via Gemini multimodal API
- Markdown file export
- Full session persistence via `localStorage`

---

## Repository Structure

```
richtexttomd/
├── index.html      # Single-page app shell, CDN imports, HTML structure
├── app.js          # All application logic (~634 lines)
├── styles.css      # Complete design system and layout (~784 lines)
└── README.md       # User-facing documentation
```

No `package.json`, no `node_modules`, no build tools. This is pure vanilla HTML/CSS/JS.

---

## Architecture

### Technology Stack

All dependencies are loaded via CDN `<script>` and `<link>` tags in `index.html`:

| Library | Purpose |
|---|---|
| Quill 2.0 | Rich text editor |
| Turndown | HTML → Markdown conversion |
| Turndown GFM Plugin | GitHub Flavored Markdown (tables, task lists) |
| Marked | Markdown → HTML parsing |
| Font Awesome 6.4.0 | Icons |
| Google Fonts | Inter, Outfit, JetBrains Mono |
| Google Gemini API | AI polish, summarize, PDF import (via `fetch`) |

### app.js Structure

| Lines | Section | Responsibility |
|---|---|---|
| 1–21 | Constants & State | `APP_VERSION`, sync flags, debounce timers |
| 23–48 | DOM Map | All interactive elements mapped to `DOM` object |
| 54–110 | Library Init | `initQuill()`, `initTurndown()` |
| 111–148 | Toast / UI Helpers | `showToast()`, `showLoading()`, `hideLoading()` |
| 150–308 | Conversion Logic | `syncRTtoMD()`, `syncMDtoRT()`, HTML prep/fix helpers |
| 310–335 | Local Storage | `saveToLocal()`, `loadFromLocal()` |
| 337–355 | Export | `exportMarkdown()` |
| 357–533 | AI Features | `generateAIContent()`, polish, summarize, PDF upload |
| 536–634 | Event Listeners | All UI event bindings |

### styles.css Structure

| Lines | Section |
|---|---|
| 1–73 | CSS variables (palette, shadows, radii, transitions) |
| 74–373 | Layout: header, workspace, panels, columns |
| 374–598 | Components: buttons, toggles, modals, toasts, editors |
| 599–784 | Responsive: tablet (≤1024px), mobile (≤640px) |

---

## Key Code Patterns

### State Management

```js
const STATE = {
  isSyncingFromRT: false,
  isSyncingFromMD: false,
  liveSyncEnabled: false,
  saveTimeout: null,
  syncTimeout: null,
};
```

Sync flags prevent infinite loops when a change in one editor triggers an update in the other.

### Conversion Flow

**Rich Text → Markdown:**
1. `quill.getSemanticHTML()` produces HTML
2. `prepareHTMLForMarkdown(html)` transforms Quill's flat list structure to nested `<ul>/<ol>` and normalizes table headers
3. `turndownService.turndown(html)` converts to Markdown string

**Markdown → Rich Text:**
1. `marked.parse(md)` converts Markdown to HTML
2. `fixHTMLForQuill(html)` collapses `<thead>`/`<tbody>`, converts `<th>` to `<td>`
3. `quill.clipboard.dangerouslyPasteHTML(html)` inserts into editor

### AI Integration

All AI calls go through `generateAIContent(prompt, fileData?)`:
- Uses `fetch` directly to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- API key retrieved from `localStorage.getItem('geminiApiKey')`
- PDF uploads are base64-encoded and passed as `inlineData` with `mime_type: 'application/pdf'`
- Wraps calls with `showLoading()` / `hideLoading()` for UX

### Local Storage Keys

| Key | Content |
|---|---|
| `rtContent` | Quill Delta JSON (rich text content) |
| `mdContent` | Raw Markdown string |
| `filename` | Export filename (without `.md` extension) |
| `geminiApiKey` | User's Gemini API key |

---

## Naming Conventions

**JavaScript:**
- `camelCase` for functions and variables: `handleRTChange`, `isSyncingFromRT`
- `UPPER_SNAKE_CASE` for top-level constants: `APP_VERSION`
- Descriptive names that indicate direction or purpose: `prepareHTMLForMarkdown`, `fixHTMLForQuill`, `syncRTtoMD`
- DOM elements named by role: `aiPolishBtn`, `markdownInput`, `settingsModal`

**CSS:**
- Hyphen-separated class names: `btn-primary`, `panel-header`, `toggle-live-sync`
- CSS custom properties use `--` prefix with semantic grouping: `--color-primary-500`, `--shadow-lg`
- Utility-style classes for state: `.active`, `.visible`, `.loading`

---

## Development Workflow

### Running the App

No build or install step needed. Open `index.html` directly in a browser, or serve with any static file server:

```bash
# Using Python
python3 -m http.server 8080

# Using Node (if available)
npx serve .
```

### Making Changes

1. Edit `app.js`, `styles.css`, or `index.html` directly
2. Refresh the browser — changes are immediately reflected
3. No transpilation, bundling, or hot-reload tooling exists

### Testing

No automated test suite exists. Test manually in browser:
- Verify Rich Text → Markdown conversion with headers, lists, tables, bold/italic
- Verify Markdown → Rich Text round-trip
- Test live sync toggle
- Test export to `.md` file
- Test AI features (requires Gemini API key in Settings)
- Test PDF import with a real PDF file
- Test responsive layout at mobile (≤640px), tablet (≤1024px), and desktop (≥1024px)

---

## Privacy & Security Constraints

- **No data leaves the browser** except direct API calls to Google Gemini
- The Gemini API key is stored only in `localStorage` — never log it, never send it anywhere else
- Document content is stored only in `localStorage` — do not add any analytics or telemetry
- Maintain the zero-server architecture: all logic must remain client-side

---

## Common Tasks for AI Assistants

### Adding a new conversion feature
1. Add helper functions near the existing `prepareHTMLForMarkdown` / `fixHTMLForQuill` functions (lines 200–308 of `app.js`)
2. Hook into `syncRTtoMD()` or `syncMDtoRT()` as appropriate
3. Test round-trip fidelity (RT → MD → RT should be lossless where possible)

### Adding a new AI feature
1. Add a new handler function following the pattern of `handleAIPolish()` or `handleAISummarize()`
2. Call `generateAIContent(prompt)` with a descriptive prompt
3. Always wrap async work with `showLoading()` / `hideLoading()`
4. Show user feedback with `showToast(message, type)` where `type` is `'success'`, `'error'`, or `'info'`
5. Add a corresponding button in `index.html` and register its event listener at the bottom of `app.js`

### Modifying the UI layout
- The three-panel workspace uses CSS Flexbox — see styles.css around line 100
- Breakpoints: `640px` (mobile) and `1024px` (tablet/desktop) — update both when changing layout
- CSS variables for colors/spacing are defined at the top of `styles.css` (lines 6–48) — use these instead of hardcoding values

### Adding external libraries
- Add a `<script src="...">` tag in `index.html` before the closing `</body>` or in `<head>` as appropriate
- Document the new dependency in this file and in `README.md`
- Prefer CDN links with pinned versions (e.g., `@2.0.0`) for reproducibility

---

## Git Conventions

- Commit messages follow `type: description` format (e.g., `feat: add ...`, `fix: ...`, `refactor: ...`)
- Feature branches use the pattern `claude/<description>-<id>`
- The main branch is `master`
