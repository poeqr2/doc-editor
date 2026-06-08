/**
 * Extract text from PDF and convert to editable HTML.
 * Strategy: use pdf.js text content items (already in reading order),
 * join with spaces, break on Y-position changes, paragraph on bigger gaps.
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
  // @ts-ignore — pdfjs-dist v6
  const pdfjs = await import("pdfjs-dist") as any;

  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
      allBlocks.push({
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5],
        width: item.width,
        height: item.height,
        fontSize: Math.abs(tx[3]) || 12,
        fontName: item.fontName || "unknown",
        pageNum,
      });
    }
  }

  const html = buildHtmlFromBlocks(allBlocks);
  return { html, blocks: allBlocks, pageDimensions };
}

function buildHtmlFromBlocks(blocks: TextBlock[]): string {
  if (blocks.length === 0) return "<p></p>";

  // Group by page
  const pages = new Map<number, TextBlock[]>();
  for (const b of blocks) {
    if (!pages.has(b.pageNum)) pages.set(b.pageNum, []);
    pages.get(b.pageNum)!.push(b);
  }

  const paragraphs: string[] = [];

  for (const pageNum of [...pages.keys()].sort((a, b) => a - b)) {
    const pageBlocks = pages.get(pageNum)!;

    // Sort top-to-bottom, left-to-right
    pageBlocks.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.x - b.x;
    });

    // Calculate average line height for gap detection
    const fontSizes = pageBlocks.map((b) => b.fontSize);
    const medianFontSize =
      fontSizes.length > 0
        ? fontSizes.sort((a, b) => a - b)[Math.floor(fontSizes.length / 2)]
        : 12;

    // Build lines by walking through sorted blocks
    const lines: { text: string; y: number; fontSize: number }[] = [];
    let lineText = "";
    let lineY = -9999;
    let lineFontSize = medianFontSize;
    let lineX = -9999;

    for (const block of pageBlocks) {
      const yDiff = Math.abs(block.y - lineY);

      if (lineY < -9000 || yDiff <= medianFontSize * 0.5) {
        // Same line
        if (lineX > -9000) {
          const gap = block.x - lineX;
          if (gap > medianFontSize * 0.3) {
            lineText += " "; // horizontal gap = space
          }
        }
        lineText += block.text;
        lineX = block.x + block.width;
        lineY = block.y;
        lineFontSize = block.fontSize;
      } else {
        // New line
        if (lineText.trim()) {
          lines.push({ text: lineText.trim(), y: lineY, fontSize: lineFontSize });
        }
        lineText = block.text;
        lineY = block.y;
        lineX = block.x + block.width;
        lineFontSize = block.fontSize;
      }
    }
    if (lineText.trim()) {
      lines.push({ text: lineText.trim(), y: lineY, fontSize: lineFontSize });
    }

    // Group lines into paragraphs
    // A new paragraph = gap between lines is > 1.4x the typical line spacing
    let paraLines: string[] = [];
    let prevY = -9999;

    for (const line of lines) {
      const gap = prevY > -9000 ? line.y - prevY : 0;

      // New paragraph if gap is significantly larger than line height
      if (prevY > -9000 && gap > medianFontSize * 1.8) {
        if (paraLines.length > 0) {
          paragraphs.push(`<p>${escapeHtml(paraLines.join(" "))}</p>`);
          paraLines = [];
        }
      }

      paraLines.push(line.text);
      prevY = line.y;
    }

    if (paraLines.length > 0) {
      paragraphs.push(`<p>${escapeHtml(paraLines.join(" "))}</p>`);
    }
  }

  return paragraphs.join("\n") || "<p></p>";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
