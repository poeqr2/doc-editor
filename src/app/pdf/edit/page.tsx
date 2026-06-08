"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { extractPdfText } from "@/lib/pdfTextExtractor";

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

  const editorContainerRef = useRef<HTMLDivElement>(null);

  const handleContentChange = useCallback((newHtml: string) => {
    htmlRef.current = newHtml;
  }, []);

  const exportPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      // Capture the editor content as an image
      const el = editorContainerRef.current;
      if (!el) throw new Error("Editor not found");

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      // Create PDF from canvas
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pdf = new jsPDF("p", "mm", "a4");

      let yPos = 0;
      const pageHeight = 297; // A4 height in mm

      // Handle multi-page
      while (yPos < imgHeight) {
        if (yPos > 0) pdf.addPage();

        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          0,
          -yPos,
          imgWidth,
          imgHeight
        );

        yPos += pageHeight;
      }

      pdf.save(`edited-${pdfName}`);
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
            <div ref={editorContainerRef} className="bg-card-bg border border-card-border rounded-xl overflow-hidden shadow-lg">
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
