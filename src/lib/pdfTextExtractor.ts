/**
 * Extract text from PDF and convert to editable HTML.
 * Uses pdf.js to get text content with positions, then groups into paragraphs.
 */
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
  const { pdfjs } = await import("pdfjs-dist");
  
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  // Decode base64 data URL
  const base64 = pdfDataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const allBlocks: TextBlock[] = [];
  const pageDimensions: { width: number; height: number }[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    pageDimensions.push({ width: viewport.width, height: viewport.height });

    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const tx = item.transform;
      // pdf.js transform matrix: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      allBlocks.push({
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5], // convert to top-down
        width: item.width,
        height: item.height,
        fontSize: Math.abs(tx[3]) || 12,
        fontName: item.fontName || "unknown",
        pageNum,
      });
    }
  }

  // Group blocks into paragraphs by proximity (same page, similar Y, sequential)
  const html = buildHtmlFromBlocks(allBlocks);

  return { html, blocks: allBlocks, pageDimensions };
}

function buildHtmlFromBlocks(blocks: TextBlock[]): string {
  if (blocks.length === 0) return "<p></p>";

  const pages = new Map<number, TextBlock[]>();
  for (const b of blocks) {
    if (!pages.has(b.pageNum)) pages.set(b.pageNum, []);
    pages.get(b.pageNum)!.push(b);
  }

  const paragraphs: string[] = [];

  for (const [, pageBlocks] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
    // Sort blocks top-to-bottom, left-to-right
    pageBlocks.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 5) return yDiff;
      return a.x - b.x;
    });

    // Group into lines (similar Y position)
    const lines: TextBlock[][] = [];
    let currentLine: TextBlock[] = [];
    let lastY = -999;

    for (const block of pageBlocks) {
      if (Math.abs(block.y - lastY) > 3) {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [block];
        lastY = block.y;
      } else {
        currentLine.push(block);
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // Group lines into paragraphs (gap > fontSize threshold = new paragraph)
    let currentPara: string[] = [];
    let lastLineY = -999;
    let lastFontSize = 12;

    for (const line of lines) {
      const lineText = line.map((b) => b.text).join(" ");
      const avgY = line.reduce((s, b) => s + b.y, 0) / line.length;
      const avgFontSize = line.reduce((s, b) => s + b.fontSize, 0) / line.length;

      // Determine if new paragraph
      const gap = lastLineY > 0 ? avgY - lastLineY : 0;
      const isNewPara = lastLineY > 0 && gap > lastFontSize * 1.5;

      if (isNewPara && currentPara.length > 0) {
        paragraphs.push(makeParagraph(currentPara.join(" "), lastFontSize));
        currentPara = [];
      }

      currentPara.push(lineText);
      lastLineY = avgY;
      lastFontSize = avgFontSize;
    }

    if (currentPara.length > 0) {
      paragraphs.push(makeParagraph(currentPara.join(" "), lastFontSize));
    }
  }

  return paragraphs.join("\n") || "<p></p>";
}

function makeParagraph(text: string, fontSize: number): string {
  // Detect headings by font size (rough heuristic)
  if (fontSize > 20) return `<h1>${escapeHtml(text)}</h1>`;
  if (fontSize > 16) return `<h2>${escapeHtml(text)}</h2>`;
  if (fontSize > 14) return `<h3>${escapeHtml(text)}</h3>`;
  return `<p>${escapeHtml(text)}</p>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
