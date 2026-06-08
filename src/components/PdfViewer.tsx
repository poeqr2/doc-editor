     1|"use client";
     2|
     3|import { useState, useEffect, useRef, useCallback } from "react";
     4|import { Document, Page, pdfjs } from "react-pdf";
     5|import "react-pdf/dist/Page/TextLayer.css";
     6|import "react-pdf/dist/Page/AnnotationLayer.css";
     7|import type { Tool, Annotation } from "@/app/pdf/page";
     8|
     9|// Set up the PDF.js worker — use unpkg CDN pinned to the exact installed version
    10|pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    11|
    12|interface PdfViewerProps {
    13|  url: string;
    14|  currentPage: number;
    15|  zoom: number;
    16|  activeTool: Tool | null;
    17|  color: string;
    18|  lineWidth: number;
    19|  fontSize: number;
    20|  annotations: Annotation[];
    21|  onAnnotationAdd: (ann: Annotation) => void;
    22|  onAnnotationUpdate: (updater: (ann: Annotation) => Annotation) => void;
    23|  onAnnotationRemove: (id: string) => void;
    24|  onUndoStart: () => void;
    25|  onPageCountChange: (n: number) => void;
    26|  currentPageNum: number;
    27|}
    28|
    29|export default function PdfViewer({
    30|  url,
    31|  currentPage,
    32|  zoom,
    33|  activeTool,
    34|  color,
    35|  lineWidth,
    36|  fontSize,
    37|  annotations,
    38|  onAnnotationAdd,
    39|  onAnnotationUpdate,
    40|  onAnnotationRemove,
    41|  onUndoStart,
    42|  onPageCountChange,
    43|  currentPageNum,
    44|}: PdfViewerProps) {
    45|  const canvasRef = useRef<HTMLCanvasElement>(null);
    46|  const [drawing, setDrawing] = useState(false);
    47|  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
    48|  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
    49|  const [textInputValue, setTextInputValue] = useState("");
    50|  const [pageWidth, setPageWidth] = useState(800);
    51|  const [numPages, setNumPages] = useState(0);
    52|  const containerRef = useRef<HTMLDivElement>(null);
    53|
    54|  const onDocumentLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    55|    setNumPages(n);
    56|    onPageCountChange(n);
    57|  }, [onPageCountChange]);
    58|
    59|  const onRenderSuccess = useCallback(() => {
    60|    // Re-render annotations whenever page renders
    61|    redrawCanvas();
    62|  }, [redrawCanvas]);
    63|
    64|  // Draw annotations on canvas
    65|  const redrawCanvas = useCallback(() => {
    66|    const canvas = canvasRef.current;
    67|    if (!canvas) return;
    68|    const ctx = canvas.getContext("2d");
    69|    if (!ctx) return;
    70|
    71|    ctx.clearRect(0, 0, canvas.width, canvas.height);
    72|
    73|    for (const ann of annotations) {
    74|      if (ann.tool === "draw" || ann.tool === "highlight") {
    75|        if (!ann.points || ann.points.length < 2) continue;
    76|        ctx.beginPath();
    77|        ctx.strokeStyle = ann.color;
    78|        ctx.lineWidth = ann.tool === "highlight" ? (ann.lineWidth || 10) : (ann.lineWidth || 3);
    79|        ctx.globalAlpha = ann.tool === "highlight" ? 0.3 : 1;
    80|        ctx.lineCap = "round";
    81|        ctx.lineJoin = "round";
    82|        ctx.moveTo(ann.points[0].x, ann.points[0].y);
    83|        for (let i = 1; i < ann.points.length; i++) {
    84|          ctx.lineTo(ann.points[i].x, ann.points[i].y);
    85|        }
    86|        ctx.stroke();
    87|        ctx.globalAlpha = 1;
    88|      }
    89|
    90|      if (ann.tool === "rectangle" && ann.x !== undefined && ann.y !== undefined) {
    91|        ctx.beginPath();
    92|        ctx.strokeStyle = ann.color;
    93|        ctx.lineWidth = ann.lineWidth || 2;
    94|        ctx.strokeRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
    95|      }
    96|
    97|      if (ann.tool === "text" && ann.text && ann.x !== undefined && ann.y !== undefined) {
    98|        ctx.fillStyle = ann.color;
    99|        ctx.font = `${ann.fontSize || 16}px Arial`;
   100|        ctx.fillText(ann.text, ann.x, ann.y + (ann.fontSize || 16));
   101|      }
   102|    }
   103|  }, [annotations]);
   104|
   105|  useEffect(() => {
   106|    // Small delay to ensure canvas is ready after page render
   107|    const timer = setTimeout(() => redrawCanvas(), 50);
   108|    return () => clearTimeout(timer);
   109|  }, [annotations, redrawCanvas, currentPageNum]);
   110|
   111|  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
   112|    const canvas = canvasRef.current;
   113|    if (!canvas) return { x: 0, y: 0 };
   114|    const rect = canvas.getBoundingClientRect();
   115|    return {
   116|      x: e.clientX - rect.left,
   117|      y: e.clientY - rect.top,
   118|    };
   119|  };
   120|
   121|  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
   122|    if (!activeTool) return;
   123|    const coords = getCanvasCoords(e);
   124|
   125|    if (activeTool === "eraser") {
   126|      // Find and remove annotation under cursor
   127|      for (const ann of annotations) {
   128|        if (ann.tool === "draw" || ann.tool === "highlight") {
   129|          if (ann.points) {
   130|            for (const p of ann.points) {
   131|              if (Math.abs(p.x - coords.x) < 10 && Math.abs(p.y - coords.y) < 10) {
   132|                onUndoStart();
   133|                onAnnotationRemove(ann.id);
   134|                return;
   135|              }
   136|            }
   137|          }
   138|        }
   139|        if (ann.tool === "rectangle" && ann.x !== undefined && ann.y !== undefined) {
   140|          if (
   141|            coords.x >= ann.x && coords.x <= ann.x + (ann.width || 0) &&
   142|            coords.y >= ann.y && coords.y <= ann.y + (ann.height || 0)
   143|          ) {
   144|            onUndoStart();
   145|            onAnnotationRemove(ann.id);
   146|            return;
   147|          }
   148|        }
   149|        if (ann.tool === "text" && ann.x !== undefined && ann.y !== undefined) {
   150|          if (Math.abs(coords.x - ann.x) < 50 && Math.abs(coords.y - ann.y) < 20) {
   151|            onUndoStart();
   152|            onAnnotationRemove(ann.id);
   153|            return;
   154|          }
   155|        }
   156|      }
   157|      return;
   158|    }
   159|
   160|    if (activeTool === "text") {
   161|      setTextInputPos(coords);
   162|      setTextInputValue("");
   163|      return;
   164|    }
   165|
   166|    onUndoStart();
   167|    setDrawing(true);
   168|    setStartPoint(coords);
   169|
   170|    if (activeTool === "draw" || activeTool === "highlight") {
   171|      onAnnotationAdd({
   172|        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   173|        tool: activeTool,
   174|        color,
   175|        points: [coords],
   176|        pageNum: currentPageNum,
   177|        lineWidth: activeTool === "highlight" ? lineWidth * 3 : lineWidth,
   178|      });
   179|    }
   180|
   181|    if (activeTool === "rectangle") {
   182|      onAnnotationAdd({
   183|        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   184|        tool: "rectangle",
   185|        color,
   186|        x: coords.x,
   187|        y: coords.y,
   188|        width: 0,
   189|        height: 0,
   190|        pageNum: currentPageNum,
   191|        lineWidth,
   192|      });
   193|    }
   194|  };
   195|
   196|  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
   197|    if (!drawing || !activeTool || !startPoint) return;
   198|    const coords = getCanvasCoords(e);
   199|
   200|    if (activeTool === "draw" || activeTool === "highlight") {
   201|      onAnnotationUpdate((ann) => ({
   202|        ...ann,
   203|        points: [...(ann.points || []), coords],
   204|      }));
   205|    }
   206|
   207|    if (activeTool === "rectangle") {
   208|      onAnnotationUpdate((ann) => ({
   209|        ...ann,
   210|        width: coords.x - startPoint.x,
   211|        height: coords.y - startPoint.y,
   212|      }));
   213|    }
   214|  };
   215|
   216|  const handleMouseUp = () => {
   217|    setDrawing(false);
   218|    setStartPoint(null);
   219|  };
   220|
   221|  const submitText = () => {
   222|    if (textInputPos && textInputValue.trim()) {
   223|      onUndoStart();
   224|      onAnnotationAdd({
   225|        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   226|        tool: "text",
   227|        color,
   228|        text: textInputValue,
   229|        x: textInputPos.x,
   230|        y: textInputPos.y,
   231|        pageNum: currentPageNum,
   232|        fontSize,
   233|      });
   234|    }
   235|    setTextInputPos(null);
   236|    setTextInputValue("");
   237|  };
   238|
   239|  const cursorStyle = activeTool
   240|    ? activeTool === "text"
   241|      ? "text"
   242|      : activeTool === "eraser"
   243|      ? "not-allowed"
   244|      : "crosshair"
   245|    : "default";
   246|
   247|  return (
   248|    <div ref={containerRef} className="relative inline-block" style={{ position: "relative" }}>
   249|      <Document
   250|        file={url}
   251|        onLoadSuccess={onDocumentLoad}
   252|        loading={
   253|          <div className="flex items-center justify-center h-96">
   254|            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
   255|          </div>
   256|        }
   257|        error={<div className="text-red-400 p-8">Failed to load PDF. Please try another file.</div>}
   258|      >
   259|        <Page
   260|          pageNumber={currentPage}
   261|          scale={zoom}
   262|          renderTextLayer={true}
   263|          renderAnnotationLayer={true}
   264|          onRenderSuccess={onRenderSuccess}
   265|          width={pageWidth}
   266|        />
   267|      </Document>
   268|
   269|      {/* Overlay canvas */}
   270|      <canvas
   271|        ref={canvasRef}
   272|        width={pageWidth * zoom}
   273|        height={1100 * zoom}
   274|        className="absolute top-0 left-0 annotation-canvas"
   275|        style={{ cursor: cursorStyle }}
   276|        onMouseDown={handleMouseDown}
   277|        onMouseMove={handleMouseMove}
   278|        onMouseUp={handleMouseUp}
   279|        onMouseLeave={handleMouseUp}
   280|      />
   281|
   282|      {/* Text input overlay */}
   283|      {textInputPos && (
   284|        <div
   285|          className="absolute z-10"
   286|          style={{ left: textInputPos.x, top: textInputPos.y }}
   287|        >
   288|          <input
   289|            type="text"
   290|            autoFocus
   291|            value={textInputValue}
   292|            onChange={(e) => setTextInputValue(e.target.value)}
   293|            onKeyDown={(e) => {
   294|              if (e.key === "Enter") submitText();
   295|              if (e.key === "Escape") {
   296|                setTextInputPos(null);
   297|                setTextInputValue("");
   298|              }
   299|            }}
   300|            onBlur={submitText}
   301|            className="bg-transparent border border-primary outline-none px-1 text-foreground"
   302|            style={{ fontSize: `${fontSize}px`, color, minWidth: "100px" }}
   303|            placeholder="Type text..."
   304|          />
   305|        </div>
   306|      )}
   307|    </div>
   308|  );
   309|}
   310|