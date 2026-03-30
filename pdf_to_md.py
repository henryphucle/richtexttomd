"""
Convert BABOK.pdf to Markdown format.
Font size hierarchy discovered:
  48.0 BoldCn  -> chapter number (skip, part of H1)
  24.0 BoldCn  -> # Chapter title (H1)
  18.0 BoldCn  -> ## Section title (H2)
  14.0 BoldCn  -> ### Subsection title (H3)
  11.5 BoldCn/Bold -> **bold inline** (figure/table captions, inline bold)
  11.5 Light/Italic -> body text / italic
  10.0          -> running headers/footers (skip)
   8.0          -> superscripts (skip)
"""

import fitz
import re
from pathlib import Path

PDF_PATH = "d:/Projects/BABOK-assistant/BABOK/BABOK.pdf"
OUT_PATH = "d:/Projects/BABOK-assistant/BABOK/BABOK.md"

SKIP_PATTERNS = [
    r"^Complimentary IIBA",
    r"^Not for Distribution",
    r"^\d+\s*$",               # standalone page numbers
    r"^[ivxlcdmIVXLCDM]+\s*$", # Roman numeral page numbers
]

def should_skip_line(text: str) -> bool:
    text = text.strip()
    if not text:
        return True
    for pat in SKIP_PATTERNS:
        if re.match(pat, text):
            return True
    return False


def spans_to_markdown(spans: list) -> str:
    """Merge spans in a line into markdown-formatted text."""
    parts = []
    bold_run = []
    italic_run = []

    def flush_bold():
        if bold_run:
            t = "".join(bold_run).strip()
            if t:
                parts.append(f"**{t}**")
            bold_run.clear()

    def flush_italic():
        if italic_run:
            t = "".join(italic_run).strip()
            if t:
                parts.append(f"*{t}*")
            italic_run.clear()

    for span in spans:
        text = span["text"]
        size = span["size"]
        font = span["font"]
        is_bold = "Bold" in font and "BoldCn" not in font
        is_italic = "Italic" in font or "Itali" in font

        if size <= 8.5:          # superscripts / trademark symbols
            continue
        if size >= 14.0:         # headings — handled at block level
            flush_bold()
            flush_italic()
            parts.append(text)
            continue

        if is_bold and not is_italic:
            flush_italic()
            bold_run.append(text)
        elif is_italic and not is_bold:
            flush_bold()
            italic_run.append(text)
        else:
            flush_bold()
            flush_italic()
            parts.append(text)

    flush_bold()
    flush_italic()
    return "".join(parts)


def classify_heading(size: float, font: str) -> str | None:
    if size >= 20.0 and "Bold" in font:
        return "h1"
    if size >= 16.0 and "Bold" in font:
        return "h2"
    if size >= 13.0 and "Bold" in font:
        return "h3"
    return None


def process_page(page) -> list[str]:
    lines_out = []
    blocks = page.get_text("dict")["blocks"]

    for block in blocks:
        if block["type"] != 0:  # skip image blocks
            continue

        for line in block["lines"]:
            spans = line["spans"]
            if not spans:
                continue

            # Determine dominant size/font for this line
            dominant = max(spans, key=lambda s: s["size"])
            dom_size = dominant["size"]
            dom_font = dominant["font"]

            # Skip running headers/footers (size ~10 or less)
            if dom_size <= 10.5:
                continue

            # Collect full text of line
            raw_text = "".join(s["text"] for s in spans).strip()
            if not raw_text or should_skip_line(raw_text):
                continue

            heading = classify_heading(dom_size, dom_font)

            if heading == "h1":
                # Skip the giant chapter number (48pt), keep chapter title (24pt)
                if dom_size >= 40:
                    continue
                # Skip single-letter/number headings (alphabetical dividers in glossary/index)
                if re.match(r"^[A-Za-z0-9]$", raw_text.strip()):
                    continue
                lines_out.append(f"\n# {raw_text}\n")
            elif heading == "h2":
                lines_out.append(f"\n## {raw_text}\n")
            elif heading == "h3":
                lines_out.append(f"\n### {raw_text}\n")
            else:
                # Bullet points — PDF uses "•" or "■" or similar
                if raw_text.startswith(("•", "■", "◆", "▪", "●", "–", "—")):
                    bullet_text = spans_to_markdown(spans).lstrip("•■◆▪●–— ").strip()
                    lines_out.append(f"- {bullet_text}")
                else:
                    lines_out.append(spans_to_markdown(spans))

    return lines_out


def merge_paragraph_lines(raw_lines: list[str]) -> list[str]:
    """
    Join continuation lines into paragraphs, preserving headings and bullets.
    Also merges consecutive headings of the same level (PDF line-wrap artifacts).
    """
    result = []
    buffer = []

    def flush():
        if buffer:
            result.append(" ".join(buffer))
            buffer.clear()

    for line in raw_lines:
        if line.startswith(("\n#", "\n##", "\n###")):
            # Only merge if this heading looks like a continuation of the previous one
            # (starts with lowercase or connective word = line-wrap artifact in PDF)
            stripped = line.strip()
            level = len(stripped) - len(stripped.lstrip("#"))
            prefix = "#" * level + " "
            heading_text = stripped[level + 1:].strip()
            CONNECTIVES = ("and ", "or ", "of ", "the ", "in ", "for ", "to ", "a ", "an ",
                           "definition", "planning", "monitoring", "management", "guide")
            ht_lower = heading_text.lower()
            is_continuation = (
                heading_text
                and (
                    heading_text[0].islower()
                    or any(ht_lower == w or ht_lower.startswith(w + " ") for w in CONNECTIVES)
                )
            )
            # Also merge if previous heading is just a section number (e.g. "## 1.1")
            prev_is_number = bool(
                result
                and re.match(r"^#+\s+\d[\d.]*\s*$", result[-1].lstrip("\n"))
            )
            if (is_continuation or prev_is_number) and result and result[-1].lstrip("\n").startswith(prefix):
                result[-1] = result[-1].rstrip() + " " + heading_text
            else:
                flush()
                result.append(line)
        elif line.startswith("- "):
            flush()
            result.append(line)
        elif line == "":
            flush()
            result.append("")
        else:
            buffer.append(line.strip())

    flush()
    return result


def main():
    doc = fitz.open(PDF_PATH)
    total = doc.page_count
    print(f"Processing {total} pages...")

    all_lines = []
    for page_num in range(total):
        if page_num % 50 == 0:
            print(f"  Page {page_num+1}/{total}")
        page_lines = process_page(doc[page_num])
        all_lines.extend(page_lines)
        all_lines.append("")  # blank line between pages

    merged = merge_paragraph_lines(all_lines)

    # Collapse 3+ consecutive blank lines into 2
    output_lines = []
    blank_count = 0
    for line in merged:
        if line.strip() == "":
            blank_count += 1
            if blank_count <= 2:
                output_lines.append("")
        else:
            blank_count = 0
            output_lines.append(line)

    out = Path(OUT_PATH)
    out.write_text("\n".join(output_lines), encoding="utf-8")
    print(f"\nDone! Written to {OUT_PATH}")
    print(f"Output size: {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
