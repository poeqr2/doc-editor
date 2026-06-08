"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { PDFDocument } from "pdf-lib";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  ),
});

export type Tool = "highlight" | "draw" | "text" | "rectangle" | "eraser";

export interface Annotation {
  id: string;
  tool: Tool;
  color: string;
  points?: { x: number; y: number }[];
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  pageNum: number;
  lineWidth?: number;
  fontSize?: number;
}

export default function PdfEditorPage() {
  const { theme, toggle } = useTheme();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string>("document.pdf");
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [color, setColor] = useState("#ff0000");
  const [lineWidth, setLineWidth] = useState(3);
  const [fontSize, setFontSize] = useState(16);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    const dataUrl = sessionStorage.getItem("pdf-file");
    const name = sessionStorage.getItem("pdf-name");
    if (!dataUrl) {
      window.location.href = "/";
      return;
    }
    setPdfUrl(dataUrl);
    if (name) setPdfName(name);

    // Convert base64 data URL to ArrayBuffer for pdf-lib export
    try {
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      setPdfBytes(bytes.buffer);
    } catch {
      console.error("Failed to decode PDF data URL");
    }
  }, []);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-50), [...annotations]]);
  }, [annotations]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setAnnotations(prev);
  }, [undoStack]);

  const redo = useCallback(() => {
    // For simplicity, we clear redo by keeping annotations as is
    // A proper implementation would need a separate redo stack
  }, []);

  const addAnnotation = useCallback((ann: Annotation) => {
    setAnnotations((prev) => [...prev, ann]);
  }, []);

  const updateLastAnnotation = useCallback((updater: (ann: Annotation) => Annotation) => {
    setAnnotations((prev) => {
      const newAnnotations = [...prev];
      const lastIndex = newAnnotations.length - 1;
      if (lastIndex >= 0) {
        newAnnotations[lastIndex] = updater(newAnnotations[lastIndex]);
      }
      return newAnnotations;
    });
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearPageAnnotations = useCallback(() => {
    setAnnotations((prev) => prev.filter((a) => a.pageNum !== currentPage));
  }, [currentPage]);

  const exportPdf = useCallback(async () => {
    if (!pdfBytes) return;
    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // For each annotation, we add it to the PDF
      for (const ann of annotations) {
        const pageIndex = ann.pageNum - 1;
        if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
        const page = pdfDoc.getPage(pageIndex);
        const { height } = page.getSize();

        if (ann.tool === "rectangle" && ann.x !== undefined && ann.y !== undefined) {
          const r = parseInt(ann.color.slice(1, 3), 16) / 255;
          const g = parseInt(ann.color.slice(3, 5), 16) / 255;
          const b = parseInt(ann.color.slice(5, 7), 16) / 255;

          page.drawRectangle({
            x: ann.x,
            y: height - ann.y - (ann.height || 0),
            width: ann.width || 0,
            height: ann.height || 0,
            borderColor: [r, g, b] as any,
            borderWidth: ann.lineWidth || 2,
          });
        }

        if (ann.tool === "text" && ann.text && ann.x !== undefined && ann.y !== undefined) {
          const r = parseInt(ann.color.slice(1, 3), 16) / 255;
          const g = parseInt(ann.color.slice(3, 5), 16) / 255;
          const b = parseInt(ann.color.slice(5, 7), 16) / 255;

          page.drawText(ann.text, {
            x: ann.x,
            y: height - ann.y - (ann.fontSize || 16),
            size: ann.fontSize || 16,
            color: [r, g, b] as any,
          });
        }
      }

      const modifiedPdf = await pdfDoc.save();
      const blob = new Blob([modifiedPdf as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotated-${pdfName}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export PDF. See console for details.");
    } finally {
      setIsExporting(false);
    }
  }, [pdfBytes, annotations, pdfName]);

  return (
    <main className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-card-border bg-card-bg/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-primary font-bold text-lg hover:opacity-80">
            ← DocCraft
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
            disabled={isExporting || annotations.length === 0}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? "Exporting..." : "⬇ Download PDF"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <aside className="w-16 border-r border-card-border bg-card-bg/50 flex flex-col items-center py-4 gap-2 overflow-y-auto">
          <ToolButton
            icon={<HighlightIcon />}
            label="Highlight"
            active={activeTool === "highlight"}
            onClick={() => setActiveTool(activeTool === "highlight" ? null : "highlight")}
          />
          <ToolButton
            icon={<DrawIcon />}
            label="Draw"
            active={activeTool === "draw"}
            onClick={() => setActiveTool(activeTool === "draw" ? null : "draw")}
          />
          <ToolButton
            icon={<TextIcon />}
            label="Text"
            active={activeTool === "text"}
            onClick={() => setActiveTool(activeTool === "text" ? null : "text")}
          />
          <ToolButton
            icon={<RectIcon />}
            label="Rectangle"
            active={activeTool === "rectangle"}
            onClick={() => setActiveTool(activeTool === "rectangle" ? null : "rectangle")}
          />
          <ToolButton
            icon={<EraserIcon />}
            label="Eraser"
            active={activeTool === "eraser"}
            onClick={() => setActiveTool(activeTool === "eraser" ? null : "eraser")}
          />

          <div className="w-8 h-px bg-card-border my-2" />

          {/* Color picker */}
          <div className="relative group">
            <div
              className="w-8 h-8 rounded-full border-2 border-card-border cursor-pointer"
              style={{ backgroundColor: color }}
              title="Color"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>

          {/* Line width */}
          <div className="flex flex-col items-center gap-1 px-1">
            <input
              type="range"
              min="1"
              max="10"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-12 accent-primary"
              title="Line width"
              style={{ writingMode: "vertical-lr", direction: "rtl", height: "60px" }}
            />
            <span className="text-[10px] text-muted">{lineWidth}px</span>
          </div>

          {activeTool === "text" && (
            <div className="flex flex-col items-center gap-1 px-1">
              <input
                type="number"
                min="8"
                max="72"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-10 text-center bg-surface border border-card-border rounded text-xs text-foreground"
                title="Font size"
              />
              <span className="text-[10px] text-muted">pt</span>
            </div>
          )}

          <div className="w-8 h-px bg-card-border my-2" />

          <ToolButton
            icon={<UndoIcon />}
            label="Undo"
            onClick={undo}
            disabled={undoStack.length === 0}
          />

          <div className="w-8 h-px bg-card-border my-2" />

          <ToolButton
            icon={<TrashIcon />}
            label="Clear page"
            onClick={clearPageAnnotations}
          />
        </aside>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-4 flex flex-col items-center">
          {pdfUrl ? (
            <PdfViewer
              url={pdfUrl}
              currentPage={currentPage}
              zoom={zoom}
              activeTool={activeTool}
              color={color}
              lineWidth={lineWidth}
              fontSize={fontSize}
              annotations={annotations.filter((a) => a.pageNum === currentPage)}
              onAnnotationAdd={addAnnotation}
              onAnnotationUpdate={updateLastAnnotation}
              onAnnotationRemove={removeAnnotation}
              onUndoStart={pushUndo}
              onPageCountChange={setNumPages}
              currentPageNum={currentPage}
            />
          ) : (
            <div className="flex items-center justify-center h-96 text-muted">Loading PDF...</div>
          )}
        </div>
      </div>

      {/* Bottom bar — navigation */}
      {numPages > 0 && (
        <footer className="flex items-center justify-center gap-4 px-4 py-3 border-t border-card-border bg-card-bg/80 backdrop-blur-sm">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1 rounded-lg bg-surface border border-card-border hover:border-primary disabled:opacity-40 transition-colors text-sm"
          >
            ← Prev
          </button>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={numPages}
              value={currentPage}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (v >= 1 && v <= numPages) setCurrentPage(v);
              }}
              className="w-14 text-center bg-surface border border-card-border rounded-lg text-sm text-foreground py-1"
            />
            <span className="text-muted text-sm">/ {numPages}</span>
          </div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="px-3 py-1 rounded-lg bg-surface border border-card-border hover:border-primary disabled:opacity-40 transition-colors text-sm"
          >
            Next →
          </button>

          <div className="w-px h-6 bg-card-border mx-2" />

          <button
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            className="px-3 py-1 rounded-lg bg-surface border border-card-border hover:border-primary transition-colors text-sm"
          >
            −
          </button>
          <span className="text-sm text-muted min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            className="px-3 py-1 rounded-lg bg-surface border border-card-border hover:border-primary transition-colors text-sm"
          >
            +
          </button>
        </footer>
      )}
    </main>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all
        ${active ? "bg-primary text-white" : "text-muted hover:text-foreground hover:bg-surface"}
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {icon}
    </button>
  );
}

function HighlightIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function DrawIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M8 6v12m8-12v12M6 20h12" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
