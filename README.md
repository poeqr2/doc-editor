# DocCraft — PDF & Word Editor

A modern, browser-based document editor for PDFs and Word files. All processing happens client-side — your files never leave your device.

## Features

### PDF Editor
- 📄 Render all pages with pdf.js
- ✏️ Draw freehand annotations
- 🖍️ Highlight text
- 📝 Add text annotations
- ⬜ Draw rectangles
- 🧹 Eraser tool
- 🎨 Color picker & line width control
- ↩️ Undo support
- 🔍 Zoom in/out & page navigation
- ⬇️ Download annotated PDF

### Word Editor
- 📝 Rich text editing with TipTap
- 🔤 Bold, Italic, Underline, Strikethrough
- 📐 Headings (H1, H2, H3)
- 📋 Bullet & numbered lists
- ↔️ Text alignment (left, center, right)
- 🎨 Font family & color picker
- 💬 Blockquote & code blocks
- ↩️ Undo/Redo
- ⬇️ Export back to DOCX

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **PDF:** pdf.js (react-pdf) + pdf-lib
- **DOCX:** mammoth.js + docx library
- **Editor:** TipTap (rich text)
- **Theme:** Dark/Light toggle

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/doc-editor)

## Privacy

All processing is client-side. Your files never leave your browser.
