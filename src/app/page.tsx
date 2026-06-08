"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function Home() {
  const { theme, toggle } = useTheme();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const wordInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState<"pdf" | "word" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateAndRedirect = (file: File, type: "pdf" | "word") => {
    setError(null);
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
      return;
    }

    const url = URL.createObjectURL(file);
    if (type === "pdf") {
      sessionStorage.setItem("pdf-file", url);
      sessionStorage.setItem("pdf-name", file.name);
      window.location.href = "/pdf";
    } else {
      sessionStorage.setItem("docx-file", url);
      sessionStorage.setItem("docx-name", file.name);
      window.location.href = "/word";
    }
  };

  const handleDrop = (e: React.DragEvent, type: "pdf" | "word") => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (type === "pdf" && file.type === "application/pdf") {
        validateAndRedirect(file, "pdf");
      } else if (type === "word" && (file.name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
        validateAndRedirect(file, "word");
      } else {
        setError(`Please upload a ${type === "pdf" ? "PDF" : "DOCX"} file.`);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "pdf" | "word") => {
    const file = e.target.files?.[0];
    if (file) validateAndRedirect(file, type);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-primary">Doc</span>Craft
          </h1>
          <p className="text-muted mt-1">Edit documents right in your browser</p>
        </div>
        <button
          onClick={toggle}
          className="p-3 rounded-xl bg-surface border border-card-border hover:border-primary transition-colors"
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm animate-fade-in">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* PDF Editor Card */}
        <div
          className={`group relative p-8 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
            ${dragOver === "pdf" 
              ? "border-primary bg-primary/10 scale-105" 
              : "border-card-border bg-card-bg hover:border-primary hover:bg-surface hover:scale-[1.02]"
            }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver("pdf"); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleDrop(e, "pdf")}
          onClick={() => pdfInputRef.current?.click()}
        >
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => handleFileSelect(e, "pdf")}
          />
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30 transition-colors">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">PDF Editor</h2>
              <p className="text-muted text-sm">
                Highlight, draw, add text and shapes. Annotate your PDFs with ease.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary text-sm font-medium group-hover:bg-primary/30 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload PDF
            </span>
          </div>
        </div>

        {/* Word Editor Card */}
        <div
          className={`group relative p-8 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
            ${dragOver === "word" 
              ? "border-primary bg-primary/10 scale-105" 
              : "border-card-border bg-card-bg hover:border-primary hover:bg-surface hover:scale-[1.02]"
            }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver("word"); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleDrop(e, "word")}
          onClick={() => wordInputRef.current?.click()}
        >
          <input
            ref={wordInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => handleFileSelect(e, "word")}
          />
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
              <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Word Editor</h2>
              <p className="text-muted text-sm">
                Rich text editing with formatting. Open and edit your DOCX files.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary text-sm font-medium group-hover:bg-primary/30 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload DOCX
            </span>
          </div>
        </div>
      </div>

      <p className="mt-12 text-muted text-xs text-center">
        🔒 All processing happens in your browser. Your files never leave your device.
      </p>
    </main>
  );
}
