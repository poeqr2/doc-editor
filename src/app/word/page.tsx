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
    const url = sessionStorage.getItem("docx-file");
    const name = sessionStorage.getItem("docx-name");
    if (!url) {
      window.location.href = "/";
      return;
    }
    if (name) setDocxName(name);

    // Load and parse DOCX
    const loadDocx = async () => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
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

  const handleContentChange = useCallback((newHtml: string) => {
    htmlRef.current = newHtml;
  }, []);

  const exportDocx = useCallback(async () => {
    setIsExporting(true);
    try {
      const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, TabStopType } = await import("docx");

      // Parse the HTML back to docx paragraphs
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlRef.current, "text/html");
      const paragraphs: any[] = [];

      const processNode = (node: ChildNode, inheritedAlign?: (typeof AlignmentType)[keyof typeof AlignmentType]): void => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          if (text.trim()) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun({ text, bold: false, italics: false })],
                alignment: inheritedAlign || AlignmentType.LEFT,
              })
            );
          }
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        let align: (typeof AlignmentType)[keyof typeof AlignmentType] = inheritedAlign || AlignmentType.LEFT;
        const textAlign = el.style.textAlign;
        if (textAlign === "center") align = AlignmentType.CENTER;
        else if (textAlign === "right") align = AlignmentType.RIGHT;
        else if (textAlign === "justify") align = AlignmentType.JUSTIFIED;

        let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
        if (tag === "h1") heading = HeadingLevel.HEADING_1;
        else if (tag === "h2") heading = HeadingLevel.HEADING_2;
        else if (tag === "h3") heading = HeadingLevel.HEADING_3;
        else if (tag === "h4") heading = HeadingLevel.HEADING_4;

        if (heading) {
          const text = el.textContent || "";
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text, bold: true })],
              heading,
              alignment: align,
            })
          );
          return;
        }

        if (tag === "p" || tag === "div") {
          const text = el.textContent || "";
          const runs: any[] = [];

          // Process inline formatting
          el.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
              runs.push(new TextRun({ text: child.textContent || "" }));
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              const childEl = child as HTMLElement;
              const childTag = childEl.tagName.toLowerCase();
              runs.push(
                new TextRun({
                  text: childEl.textContent || "",
                  bold: childTag === "strong" || childTag === "b",
                  italics: childTag === "em" || childTag === "i",
                  underline: childTag === "u" ? {} : undefined,
                })
              );
            }
          });

          if (runs.length === 0) {
            runs.push(new TextRun({ text }));
          }

          paragraphs.push(
            new Paragraph({
              children: runs,
              alignment: align,
              numbering: undefined,
            })
          );
          return;
        }

        if (tag === "ul" || tag === "ol") {
          el.childNodes.forEach((li) => {
            if (li.nodeType === Node.ELEMENT_NODE && (li as HTMLElement).tagName.toLowerCase() === "li") {
              const liRuns: any[] = [];
              li.childNodes.forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                  liRuns.push(new TextRun({ text: child.textContent || "" }));
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                  const childEl = child as HTMLElement;
                  const childTag = childEl.tagName.toLowerCase();
                  liRuns.push(
                    new TextRun({
                      text: childEl.textContent || "",
                      bold: childTag === "strong" || childTag === "b",
                      italics: childTag === "em" || childTag === "i",
                    })
                  );
                }
              });
              if (liRuns.length === 0) {
                liRuns.push(new TextRun({ text: li.textContent || "" }));
              }
              paragraphs.push(
                new Paragraph({
                  children: liRuns,
                  numbering: { reference: "default-list", level: 0 },
                })
              );
            }
          });
          return;
        }

        if (tag === "br") {
          paragraphs.push(new Paragraph({ children: [] }));
          return;
        }

        // Recurse into other elements
        el.childNodes.forEach((child) => processNode(child, align));
      };

      doc.body.childNodes.forEach((node) => processNode(node));

      if (paragraphs.length === 0) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      }

      const docx = new DocxDocument({
        sections: [{
          children: paragraphs,
        }],
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
