"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import { useEffect, useRef } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  // FIX: Track whether initial content has been loaded.
  // The original code ran setContent() on every `content` prop change,
  // which would reset the editor cursor/content whenever the parent re-rendered.
  const initializedRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Start typing..." }),
      TextStyle,
      FontFamily,
      Color,
    ],
    content: "",
    editorProps: { attributes: { class: "tiptap focus:outline-none" } },
    onUpdate: ({ editor }) => { onChange(editor.getHTML()); },
  });

  // Only set content once when the initial HTML arrives from mammoth.
  // After that, the editor owns its state — don't overwrite it.
  useEffect(() => {
    if (editor && content && !initializedRef.current) {
      editor.commands.setContent(content);
      initializedRef.current = true;
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-card-border bg-surface/50 sticky top-0 z-10">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><strong>B</strong></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></Btn>
        <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></Btn>
        <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strike"><s>S</s></Btn>
        <Div />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="H1">H1</Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="H2">H2</Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="H3">H3</Btn>
        <Div />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullets">•</Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbers">1.</Btn>
        <Div />
        <Btn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Left">⫷</Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Center">≡</Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Right">⫸</Btn>
        <Div />
        <select
          className="bg-surface border border-card-border rounded px-2 py-1 text-xs text-foreground"
          title="Font"
          value=""
          onChange={(e) => {
            if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run();
          }}
        >
          <option value="">Font</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times</option>
          <option value="Courier New">Courier</option>
          <option value="Verdana">Verdana</option>
        </select>
        <div className="relative" title="Text color">
          <div
            className="w-6 h-6 rounded border border-card-border"
            style={{ backgroundColor: editor.getAttributes("textStyle").color || "#000000" }}
          />
          <input
            type="color"
            value={editor.getAttributes("textStyle").color || "#000000"}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            title="Color"
          />
        </div>
        <Div />
        <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">"</Btn>
        <Btn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Code">&lt;/&gt;</Btn>
        <Div />
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">↩</Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">↪</Btn>
      </div>
      <EditorContent editor={editor} className="min-h-[600px] max-h-[80vh] overflow-auto p-6 bg-card-bg" />
    </div>
  );
}

function Btn({ children, onClick, active, disabled, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`w-8 h-8 rounded flex items-center justify-center text-sm transition-colors ${active ? "bg-primary text-white" : "text-muted hover:text-foreground hover:bg-surface"} ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
      {children}
    </button>
  );
}

function Div() { return <div className="w-px h-6 bg-card-border mx-1" />; }
