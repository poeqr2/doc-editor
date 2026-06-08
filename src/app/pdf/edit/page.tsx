"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { extractPdfText } from "@/lib/pdfTextExtractor";
import { PDFDocument, StandardFonts } from "pdf-lib";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  ),
});

export default function PdfTextEditorPage() {
  const { theme, toggle } = useTheme();
  const [pdfName, setPdfName] = useState<string>("document.pdf");
  const [html, setHtml] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(true);
  const htmlRef = useRef<string>("");
  const pdfDataUrlRef = useRef<string>("");

  useEffect(() => {
    const dataUrl = sessionStorage.getItem("pdf-file");
    const name = sessionStorage.getItem("pdf-name");
    if (!dataUrl) {
      window.location.href = "/";
      return;
    }
    if (name) setPdfName(name);
    pdfDataUrlRef.current = dataUrl;

    const extract = async () => {
      try {
        setExtracting(true);
        const result = await extractPdfText(dataUrl);
        htmlRef.current = result.html;
        setHtml(result.html);
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to extract PDF text:", err);
        setError("Failed to extract text from PDF. Try another file.");
      } finally {
        setExtracting(false);
      }
    };

    extract();
  }, []);

  const handleContentChange = useCallback((newHtml: string) => {
    htmlRef.current = newHtml;
  }, []);

  const exportPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      // Create a new PDF from the edited HTML
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Parse HTML back to text blocks
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlRef.current, "text/html");
      const elements = doc.body.children;

      const pageWidth = 595; // A4
      const pageHeight = 842;
      const margin = 50;
      const lineHeight = 16;
      let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      for (const el of Array.from(elements)) {
        const tag = el.tagName.toLowerCase();
        const text = el.textContent?.trim() || "";
        if (!text) continue;

        let fontSize = 12;
        let usedFont = font;

        if (tag === "h1") { fontSize = 24; usedFont = fontBold; }
        else if (tag === "h2") { fontSize = 18; usedFont = fontBold; }
        else if (tag === "h3") { fontSize = 14; usedFont = fontBold; }

        // Word wrap
        const maxLineWidth = pageWidth - margin * 2;
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const textWidth = usedFont.widthOfTextAtSize(testLine, fontSize);
          if (textWidth > maxLineWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);

        // Check if we need a new page
        const totalHeight = lines.length * (fontSize + 4);
        if (y - totalHeight < margin) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }

        // Draw each line
        for (const line of lines) {
          if (y < margin) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          currentPage.drawText(line, {
            x: margin,
            y,
            size: fontSize,
            font: usedFont,
          });
          y -= fontSize + 4;
        }

        y -= 4; // gap between paragraphs
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edited-${pdfName}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export PDF. See console for details.");
    } finally {
      setIsExporting(false);
    }
  }, [pdfName]);

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-2 border-b border-card-border bg-card-bg/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/pdf" className="text-primary font-bold text-lg hover:opacity-80">
            ← PDF Editor
          </Link>
          <span className="text-muted text-sm truncate max-w-[200px]">{pdfName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="p-2 rounded-lg hover:bg-surface transition-colors"
            title="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={exportPdf}
            disabled={isExporting || !isLoaded}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? "Exporting..." : "⬇ Download PDF"}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 flex justify-center">
        <div className="w-full max-w-4xl">
          {error ? (
            <div className="text-red-400 p-8 text-center">{error}</div>
          ) : extracting ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted text-sm">Extracting text from PDF...</p>
            </div>
          ) : isLoaded ? (
            <div className="bg-card-bg border border-card-border rounded-xl overflow-hidden shadow-lg">
              <div className="px-4 py-2 bg-surface/50 border-b border-card-border">
                <p className="text-xs text-muted">
                  ✏️ Edit the text below — changes will be saved when you download.
                </p>
              </div>
              <RichTextEditor
                content={html}
                onChange={handleContentChange}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
