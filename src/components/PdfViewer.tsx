"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { Tool, Annotation } from "@/app/pdf/page";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  currentPage: number;
  zoom: number;
  activeTool: Tool | null;
  color: string;
  lineWidth: number;
  fontSize: number;
  annotations: Annotation[];
  onAnnotationAdd: (ann: Annotation) => void;
  onAnnotationUpdate: (updater: (ann: Annotation) => Annotation) => void;
  onAnnotationRemove: (id: string) => void;
  onUndoStart: () => void;
  onPageCountChange: (n: number) => void;
  currentPageNum: number;
}

export default function PdfViewer({
  url, currentPage, zoom, activeTool, color, lineWidth, fontSize,
  annotations, onAnnotationAdd, onAnnotationUpdate, onAnnotationRemove,
  onUndoStart, onPageCountChange, currentPageNum,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const [textInputValue, setTextInputValue] = useState("");
  const [pageWidth, setPageWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  // Use ref to always have latest annotations for canvas drawing
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const onDocumentLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    onPageCountChange(n);
  }, [onPageCountChange]);

  // Draw annotations on canvas — reads from ref so always fresh
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const anns = annotationsRef.current;
    for (const ann of anns) {
      if (ann.tool === "draw" || ann.tool === "highlight") {
        if (!ann.points || ann.points.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.tool === "highlight" ? (ann.lineWidth || 10) : (ann.lineWidth || 3);
        ctx.globalAlpha = ann.tool === "highlight" ? 0.3 : 1;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (ann.tool === "rectangle" && ann.x !== undefined && ann.y !== undefined) {
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.lineWidth || 2;
        ctx.strokeRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
      }
      if (ann.tool === "text" && ann.text && ann.x !== undefined && ann.y !== undefined) {
        ctx.fillStyle = ann.color;
        ctx.font = `${ann.fontSize || 16}px Arial`;
        ctx.fillText(ann.text, ann.x, ann.y + (ann.fontSize || 16));
      }
    }
  }, []); // No deps — reads from ref

  const onRenderSuccess = useCallback(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    redrawCanvas();
  }, [annotations, currentPageNum]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTool) return;
    const coords = getCanvasCoords(e);

    if (activeTool === "eraser") {
      for (const ann of annotations) {
        if (ann.tool === "draw" || ann.tool === "highlight") {
          if (ann.points) {
            for (const p of ann.points) {
              if (Math.abs(p.x - coords.x) < 10 && Math.abs(p.y - coords.y) < 10) {
                onUndoStart();
                onAnnotationRemove(ann.id);
                return;
              }
            }
          }
        }
        if (ann.tool === "rectangle" && ann.x !== undefined && ann.y !== undefined) {
          if (coords.x >= ann.x && coords.x <= ann.x + (ann.width || 0) &&
              coords.y >= ann.y && coords.y <= ann.y + (ann.height || 0)) {
            onUndoStart();
            onAnnotationRemove(ann.id);
            return;
          }
        }
        if (ann.tool === "text" && ann.x !== undefined && ann.y !== undefined) {
          if (Math.abs(coords.x - ann.x) < 50 && Math.abs(coords.y - ann.y) < 20) {
            onUndoStart();
            onAnnotationRemove(ann.id);
            return;
          }
        }
      }
      return;
    }

    if (activeTool === "text") {
      setTextInputPos(coords);
      setTextInputValue("");
      return;
    }

    onUndoStart();
    setDrawing(true);
    setStartPoint(coords);

    if (activeTool === "draw" || activeTool === "highlight") {
      onAnnotationAdd({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tool: activeTool, color, points: [coords], pageNum: currentPageNum,
        lineWidth: activeTool === "highlight" ? lineWidth * 3 : lineWidth,
      });
    }
    if (activeTool === "rectangle") {
      onAnnotationAdd({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tool: "rectangle", color, x: coords.x, y: coords.y, width: 0, height: 0,
        pageNum: currentPageNum, lineWidth,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !activeTool || !startPoint) return;
    const coords = getCanvasCoords(e);
    if (activeTool === "draw" || activeTool === "highlight") {
      onAnnotationUpdate((ann) => ({ ...ann, points: [...(ann.points || []), coords] }));
    }
    if (activeTool === "rectangle") {
      onAnnotationUpdate((ann) => ({
        ...ann, width: coords.x - startPoint.x, height: coords.y - startPoint.y,
      }));
    }
  };

  const handleMouseUp = () => { setDrawing(false); setStartPoint(null); };

  const submitText = () => {
    if (textInputPos && textInputValue.trim()) {
      onUndoStart();
      onAnnotationAdd({
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tool: "text", color, text: textInputValue,
        x: textInputPos.x, y: textInputPos.y, pageNum: currentPageNum, fontSize,
      });
    }
    setTextInputPos(null);
    setTextInputValue("");
  };

  const cursorStyle = activeTool
    ? activeTool === "text" ? "text" : activeTool === "eraser" ? "not-allowed" : "crosshair"
    : "default";

  return (
    <div ref={containerRef} className="relative inline-block">
      <Document
        file={url}
        onLoadSuccess={onDocumentLoad}
        loading={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>}
        error={<div className="text-red-400 p-8">Failed to load PDF. Please try another file.</div>}
      >
        <Page
          pageNumber={currentPage}
          scale={zoom}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          onRenderSuccess={onRenderSuccess}
          width={pageWidth}
        />
      </Document>

      <canvas
        ref={canvasRef}
        width={pageWidth * zoom}
        height={1100 * zoom}
        className="absolute top-0 left-0 annotation-canvas"
        style={{ cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {textInputPos && (
        <div className="absolute z-10" style={{ left: textInputPos.x, top: textInputPos.y }}>
          <input
            type="text" autoFocus value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitText();
              if (e.key === "Escape") { setTextInputPos(null); setTextInputValue(""); }
            }}
            onBlur={submitText}
            className="bg-white dark:bg-gray-800 border border-primary outline-none px-1 text-black dark:text-white"
            style={{ fontSize: `${fontSize}px`, color, minWidth: "100px" }}
            placeholder="Type text..."
          />
        </div>
      )}
    </div>
  );
}
