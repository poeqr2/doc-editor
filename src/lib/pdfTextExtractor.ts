/**
 * Extract text from PDF → editable HTML.
 * Robust approach: sort all items into reading order, then dump.
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

    // Step 1: Sort into rough reading order
    // Use row-binning: group items into rows by Y proximity, then sort rows top-to-bottom,
    // and within each row sort left-to-right.
    const sorted = sortIntoReadingOrder(pageBlocks);

    // Step 2: Walk through sorted items and build lines
    let lines: string[][] = [[]];
    let lastY = -9999;

    for (const block of sorted) {
      // New line if Y changed by more than half the font size
      const yDelta = Math.abs(block.y - lastY);
      const threshold = block.fontSize * 0.6;

      if (lastY > -9000 && yDelta > threshold) {
        lines.push([]);
      }
      lines[lines.length - 1].push(block.text);
      lastY = block.y;
    }

    // Convert lines to text
    for (const line of lines) {
      if (line.length > 0) {
        result.push(line.join(" "));
      }
    }
  }

  // Wrap each line in <p> tags
  if (result.length === 0) return "<p></p>";
  return result.map((line) => `<p>${esc(line)}</p>`).join("");
}

/**
 * Sort blocks into reading order using row-binning.
 * Items with similar Y values are grouped into rows,
 * rows are sorted top-to-bottom, items within row sorted left-to-right.
 */
function sortIntoReadingOrder(blocks: TextBlock[]): TextBlock[] {
  if (blocks.length <= 1) return blocks;

  // Find the median font size to determine row height threshold
  const sizes = blocks.map((b) => b.fontSize).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)];
  const rowThreshold = medianSize * 0.6;

  // Bin items into rows by Y proximity
  const rows: TextBlock[][] = [];
  const sorted = [...blocks].sort((a, b) => a.y - b.y);

  for (const block of sorted) {
    // Find an existing row this item belongs to
    let placed = false;
    for (const row of rows) {
      // Check if block's Y is close to the row's average Y
      const avgY = row.reduce((s, b) => s + b.y, 0) / row.length;
      if (Math.abs(block.y - avgY) <= rowThreshold) {
        row.push(block);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([block]);
    }
  }

  // Sort rows by average Y, then items within each row by X
  rows.sort((a, b) => {
    const avgA = a.reduce((s, b) => s + b.y, 0) / a.length;
    const avgB = b.reduce((s, b) => s + b.y, 0) / b.length;
    return avgA - avgB;
  });

  const result: TextBlock[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    result.push(...row);
  }
  return result;
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
