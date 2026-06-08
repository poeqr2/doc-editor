"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import mammoth from "mammoth";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  ),
});

export default function WordEditorPage() {
  const { theme, toggle } = useTheme();
  const [docxName, setDocxName] = useState<string>("document.docx");
  const [html, setHtml] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const htmlRef = useRef<string>("");

  useEffect(() => {
    // FIX 1: Was fetch()-ing a blob URL that's dead after navigation.
    // Now we read the base64 data URL from sessionStorage and decode it directly.
    const dataUrl = sessionStorage.getItem("docx-file");
    const name = sessionStorage.getItem("docx-name");
    if (!dataUrl) {
      window.location.href = "/";
      return;
    }
    if (name) setDocxName(name);

    const loadDocx = async () => {
      try {
        // Decode base64 data URL → ArrayBuffer
        const base64 = dataUrl.split(",")[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        const result = await mammoth.convertToHtml({ arrayBuffer });
        const parsedHtml = result.value || "<p></p>";
        setHtml(parsedHtml);
        htmlRef.current = parsedHtml;
        setIsLoaded(true);
        if (result.messages && result.messages.length > 0) {
          console.warn("Mammoth messages:", result.messages);
        }
      } catch (err) {
        console.error("Failed to parse DOCX:", err);
        setError("Failed to parse DOCX file. Please try another file.");
      }
    };

    loadDocx();
  }, []);

  // FIX 2: handleContentChange must update htmlRef AND html state.
  // Previously only htmlRef was updated, so html state was stale causing
  // RichTextEditor to reset content on every re-render.
  const handleContentChange = useCallback((newHtml: string) => {
    htmlRef.current = newHtml;
    // Note: we intentionally don't setHtml here to avoid re-render loop,
    // htmlRef.current is the source of truth for export.
  }, []);

  const exportDocx = useCallback(async () => {
    setIsExporting(true);
    try {
      const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlRef.current, "text/html");
      const paragraphs: InstanceType<typeof Paragraph>[] = [];

      // FIX 3: List numbering config was referencing "default-list" which was
      // never defined in the DocxDocument, causing export to crash.
      // We track lists and build proper numbering config.
      let listCounter = 0;
      const listConfigs: any[] = [];

      const processElement = (el: HTMLElement, inheritedAlign?: (typeof AlignmentType)[keyof typeof AlignmentType]): void => {
        const tag = el.tagName.toLowerCase();

        let align: (typeof AlignmentType)[keyof typeof AlignmentType] = inheritedAlign || AlignmentType.LEFT;
        const textAlign = el.style.textAlign || el.getAttribute("data-text-align") || "";
        if (textAlign === "center") align = AlignmentType.CENTER;
        else if (textAlign === "right") align = AlignmentType.RIGHT;
        else if (textAlign === "justify") align = AlignmentType.JUSTIFIED;

        // Headings
        let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
        if (tag === "h1") heading = HeadingLevel.HEADING_1;
        else if (tag === "h2") heading = HeadingLevel.HEADING_2;
        else if (tag === "h3") heading = HeadingLevel.HEADING_3;
        else if (tag === "h4") heading = HeadingLevel.HEADING_4;

        if (heading) {
          paragraphs.push(
            new Paragraph({
              children: buildRuns(el),
              heading,
              alignment: align,
            })
          );
          return;
        }

        // Paragraph / div
        if (tag === "p" || tag === "div") {
          const runs = buildRuns(el);
          paragraphs.push(
            new Paragraph({
              children: runs.length > 0 ? runs : [new TextRun({ text: "" })],
              alignment: align,
            })
          );
          return;
        }

        // FIX 3 continued: properly build numbered/bulleted lists
        if (tag === "ul" || tag === "ol") {
          const refId = `list-${++listCounter}`;
          listConfigs.push({
            reference: refId,
            levels: [{
              level: 0,
              format: tag === "ol" ? "decimal" : "bullet",
              text: tag === "ol" ? "%1." : "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            }],
          });

          el.querySelectorAll(":scope > li").forEach((li) => {
            const liEl = li as HTMLElement;
            const runs = buildRuns(liEl);
            paragraphs.push(
              new Paragraph({
                children: runs.length > 0 ? runs : [new TextRun({ text: liEl.textContent || "" })],
                numbering: { reference: refId, level: 0 },
              })
            );
          });
          return;
        }

        if (tag === "br") {
          paragraphs.push(new Paragraph({ children: [] }));
          return;
        }

        if (tag === "blockquote") {
          el.childNodes.forEach((child) => {
            if (child.nodeType === Node.ELEMENT_NODE) {
              processElement(child as HTMLElement, align);
            }
          });
          return;
        }

        // Recurse into other wrappers
        el.childNodes.forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            processElement(child as HTMLElement, align);
          }
        });
      };

      // FIX 4: buildRuns now handles nested inline formatting correctly,
      // including color from style attribute (TipTap's Color extension output).
      const buildRuns = (el: HTMLElement): InstanceType<typeof TextRun>[] => {
        const runs: InstanceType<typeof TextRun>[] = [];

        const processInline = (node: ChildNode, ctx: {
          bold?: boolean; italics?: boolean; underline?: boolean;
          strike?: boolean; color?: string; font?: string;
        }) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || "";
            if (text) {
              runs.push(new TextRun({
                text,
                bold: ctx.bold,
                italics: ctx.italics,
                underline: ctx.underline ? {} : undefined,
                strike: ctx.strike,
                color: ctx.color,
                font: ctx.font,
              }));
            }
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const childEl = node as HTMLElement;
          const childTag = childEl.tagName.toLowerCase();
          const style = childEl.style;

          // Extract color from inline style (TipTap sets style="color: #rrggbb")
          let color = ctx.color;
          if (style.color) {
            // Convert rgb() to hex if needed
            const rgb = style.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgb) {
              color = [rgb[1], rgb[2], rgb[3]]
                .map((n) => parseInt(n).toString(16).padStart(2, "0"))
                .join("");
            } else if (style.color.startsWith("#")) {
              color = style.color.slice(1);
            }
          }

          const newCtx = {
            bold: ctx.bold || childTag === "strong" || childTag === "b",
            italics: ctx.italics || childTag === "em" || childTag === "i",
            underline: ctx.underline || childTag === "u",
            strike: ctx.strike || childTag === "s" || childTag === "del",
            color,
            font: style.fontFamily ? style.fontFamily.replace(/['"]/g, "") : ctx.font,
          };

          childEl.childNodes.forEach((grandchild) => processInline(grandchild, newCtx));
        };

        el.childNodes.forEach((child) => processInline(child, {}));
        return runs;
      };

      doc.body.childNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processElement(node as HTMLElement);
        }
      });

      if (paragraphs.length === 0) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      }

      const docx = new DocxDocument({
        numbering: listConfigs.length > 0 ? { config: listConfigs } : undefined,
        sections: [{ children: paragraphs }],
      });

      const blob = await Packer.toBlob(docx);
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `edited-${docxName}`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export DOCX. See console for details.");
    } finally {
      setIsExporting(false);
    }
  }, [docxName]);

  return (
    <main className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-card-border bg-card-bg/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-primary font-bold text-lg hover:opacity-80">
            ← DocCraft
          </Link>
          <span className="text-muted text-sm truncate max-w-[200px]">{docxName}</span>
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
            onClick={exportDocx}
            disabled={isExporting || !isLoaded}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? "Exporting..." : "⬇ Download DOCX"}
          </button>
        </div>
      </header>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4 flex justify-center">
        <div className="w-full max-w-4xl">
          {error ? (
            <div className="text-red-400 p-8 text-center">{error}</div>
          ) : isLoaded ? (
            <div className="bg-card-bg border border-card-border rounded-xl overflow-hidden shadow-lg">
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
