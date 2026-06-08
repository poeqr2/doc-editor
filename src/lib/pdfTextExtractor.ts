/**
 * Extract text from PDF → editable HTML.
 * DUMB approach: just dump all text in reading order.
 * No fancy grouping. TipTap handles formatting.
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

  const html = buildSimpleHtml(allBlocks);
  return { html, blocks: allBlocks, pageDimensions };
}

function buildSimpleHtml(blocks: TextBlock[]): string {
  if (blocks.length === 0) return "<p></p>";

  // Group by page
  const pages = new Map<number, TextBlock[]>();
  for (const b of blocks) {
    if (!pages.has(b.pageNum)) pages.set(b.pageNum, []);
    pages.get(b.pageNum)!.push(b);
  }

  const result: string[] = [];

  for (const pageNum of Array.from(pages.keys()).sort((a, b) => a - b)) {
    const pageBlocks = pages.get(pageNum)!;

    // Sort: top-to-bottom, then left-to-right
    // Use a reasonable Y tolerance — items on the same visual line
    // have Y values within ~2px of each other
    pageBlocks.sort((a, b) => {
      // Primary sort by Y (top = small Y first)
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 2) return yDiff;
      // Secondary sort by X (left = small X first)
      return a.x - b.x;
    });

    // Walk through and build lines
    // A "line" = consecutive items where Y barely changes
    let currentLineY = -9999;
    let currentLineItems: string[] = [];

    const flushLine = () => {
      if (currentLineItems.length > 0) {
        result.push(currentLineItems.join(" "));
        currentLineItems = [];
      }
    };

    for (const block of pageBlocks) {
      const yDelta = Math.abs(block.y - currentLineY);

      if (currentLineY < -9000) {
        // First item on this page
        currentLineY = block.y;
        currentLineItems.push(block.text);
      } else if (yDelta <= 2) {
        // Same line (Y barely changed)
        // Add space if there's a horizontal gap
        if (currentLineItems.length > 0) {
          currentLineItems.push(" ");
        }
        currentLineItems.push(block.text);
      } else {
        // New line
        flushLine();
        currentLineY = block.y;
        currentLineItems.push(block.text);
      }
    }
    flushLine();
  }

  // Wrap each line in <p> tags — TipTap will handle it
  if (result.length === 0) return "<p></p>";
  return result.map((line) => `<p>${esc(line)}</p>`).join("");
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
