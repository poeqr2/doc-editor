/**
 * Extract text from PDF → editable HTML.
 * Simplest possible: page by page, items in stream order, line breaks on Y change.
 * NO sorting, NO fancy grouping. Just raw text dump with page separation.
 */
export async function extractPdfTextViaDom(pdfDataUrl: string): Promise<string> {
  // @ts-ignore — pdfjs-dist v6
  const pdfjs = await import("pdfjs-dist") as any;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const base64 = pdfDataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    // Collect all items with their raw positions
    const items: { text: string; y: number; x: number }[] = [];

    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const tx = item.transform;
      items.push({
        text: item.str,
        y: tx[5], // raw PDF Y (bottom-up)
        x: tx[4],
      });
    }

    if (items.length === 0) continue;

    // Sort by Y descending (top of page = highest Y in PDF coords), then X ascending
    items.sort((a, b) => {
      const yDiff = b.y - a.y; // descending
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.x - b.x;
    });

    // Build text: group items on same line (similar Y), separate lines
    const lines: string[] = [];
    let currentLine: string[] = [];
    let lastY = items[0].y;

    for (const item of items) {
      if (Math.abs(item.y - lastY) > 2) {
        // New line
        lines.push(currentLine.join(" "));
        currentLine = [];
      }
      currentLine.push(item.text);
      lastY = item.y;
    }
    if (currentLine.length > 0) lines.push(currentLine.join(" "));

    pages.push(lines.join("\n"));
  }

  if (pages.length === 0) return "<p></p>";

  // Wrap each page's text, separated by page breaks
  const result: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      // Page break marker
      result.push('<div style="page-break-before: always; border-top: 2px dashed #ccc; margin: 20px 0; padding-top: 10px; font-size: 11px; color: #999;">— Page ' + (i + 1) + ' —</div>');
    }
    // Each line becomes a paragraph
    const lines = pages[i].split("\n");
    for (const line of lines) {
      if (line.trim()) {
        result.push(`<p>${esc(line)}</p>`);
      }
    }
  }

  return result.join("\n");
}

// Keep interface for backwards compat
export interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  pageNum: number;
}

export async function extractPdfText(pdfDataUrl: string): Promise<{
  html: string;
  blocks: TextBlock[];
  pageDimensions: { width: number; height: number }[];
}> {
  // @ts-ignore — pdfjs-dist v6
  const pdfjs = await import("pdfjs-dist") as any;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const base64 = pdfDataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const allBlocks: TextBlock[] = [];
  const pageDimensions: { width: number; height: number }[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    pageDimensions.push({ width: vp.width, height: vp.height });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const tx = item.transform;
      allBlocks.push({
        text: item.str,
        x: tx[4],
        y: vp.height - tx[5],
        width: item.width,
        height: item.height,
        fontSize: Math.abs(tx[3]) || 12,
        fontName: item.fontName || "",
        pageNum,
      });
    }
  }

  const html = await extractPdfTextViaDom(pdfDataUrl);
  return { html, blocks: allBlocks, pageDimensions };
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
