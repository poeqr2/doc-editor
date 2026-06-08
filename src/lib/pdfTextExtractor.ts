/**
 * Extract text from PDF by rendering it invisibly and reading the text layer DOM.
 * This uses pdf.js's built-in text extraction (which handles reading order correctly)
 * instead of manual coordinate sorting.
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
  const paragraphs: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    // Create a hidden container for text layer rendering
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;
    document.body.appendChild(container);

    // Render the text layer using pdf.js
    const textContent = await page.getTextContent();

    // pdf.js TextLayer renders spans with correct reading order positioning
    const textLayer = new pdfjs.TextLayer({
      textContentSource: textContent,
      container,
      viewport,
    });
    await textLayer.render();

    // Now read the rendered spans from DOM — they're in reading order!
    const spans = container.querySelectorAll("span");
    let lastY = -9999;
    let currentLine: string[] = [];

    for (const span of spans) {
      const text = span.textContent?.trim();
      if (!text) continue;

      // Get Y position from the span's transform
      const style = span.style;
      const transform = style.transform || "";
      // Extract Y from matrix: matrix(1, 0, 0, 1, x, y)
      const match = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)\)/);
      const y = match ? parseFloat(match[1]) : 0;

      // If Y changed significantly, it's a new line
      if (lastY > -9000 && Math.abs(y - lastY) > 2) {
        if (currentLine.length > 0) {
          paragraphs.push(currentLine.join(" "));
          currentLine = [];
        }
      }

      currentLine.push(text);
      lastY = y;
    }

    if (currentLine.length > 0) {
      paragraphs.push(currentLine.join(" "));
    }

    // Clean up
    document.body.removeChild(container);
  }

  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n");
}

// Keep the old function for backwards compatibility
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

  // Try the DOM-based extraction first, fall back to dumb approach
  try {
    const html = await extractPdfTextViaDom(pdfDataUrl);
    return { html, blocks: allBlocks, pageDimensions };
  } catch {
    // Fallback: simple concatenation without sorting
    const html = buildDumbHtml(allBlocks);
    return { html, blocks: allBlocks, pageDimensions };
  }
}

function buildDumbHtml(blocks: TextBlock[]): string {
  if (blocks.length === 0) return "<p></p>";

  const pages = new Map<number, TextBlock[]>();
  for (const b of blocks) {
    if (!pages.has(b.pageNum)) pages.set(b.pageNum, []);
    pages.get(b.pageNum)!.push(b);
  }

  const result: string[] = [];

  for (const pageNum of Array.from(pages.keys()).sort((a, b) => a - b)) {
    const pageBlocks = pages.get(pageNum)!;
    // Don't sort — use content stream order (often reading order for simple PDFs)
    let lastY = -9999;
    let line: string[] = [];

    for (const block of pageBlocks) {
      if (lastY > -9000 && Math.abs(block.y - lastY) > 3) {
        if (line.length > 0) result.push(line.join(" "));
        line = [];
      }
      line.push(block.text);
      lastY = block.y;
    }
    if (line.length > 0) result.push(line.join(" "));
  }

  if (result.length === 0) return "<p></p>";
  return result.map((l) => `<p>${esc(l)}</p>`).join("\n");
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
