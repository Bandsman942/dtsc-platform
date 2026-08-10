"use client";

import { forwardRef, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eraser,
  Heading1,
  Heading2,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ProfessionalNoteEditorHandle = {
  getContent: () => { html: string; text: string };
  focus: () => void;
};

type ProfessionalNoteRichEditorProps = {
  initialHtml: string;
  placeholder: string;
  english: boolean;
  className?: string;
};

const TEXT_COLORS = [
  ["DTSC", "#00a7c7"],
  ["Blue", "#1d4ed8"],
  ["Green", "#047857"],
  ["Red", "#b91c1c"],
  ["Orange", "#c2410c"],
  ["Violet", "#6d28d9"],
  ["Grey", "#475569"],
  ["Black", "#111827"],
] as const;

const FONT_FAMILIES = [
  ["Inter", "Inter, Arial, sans-serif"],
  ["Arial", "Arial, sans-serif"],
  ["Georgia", "Georgia, serif"],
  ["Verdana", "Verdana, sans-serif"],
] as const;

const FONT_SIZES = [
  ["Small", "2"],
  ["Normal", "3"],
  ["Large", "5"],
  ["Title", "6"],
] as const;

const LINE_HEIGHTS = ["1", "1.15", "1.5", "1.75", "2", "2.5"] as const;
const PARAGRAPH_SPACINGS = ["0px", "4px", "8px", "12px", "16px", "24px", "32px"] as const;

export const ProfessionalNoteRichEditor = forwardRef<ProfessionalNoteEditorHandle, ProfessionalNoteRichEditorProps>(
  function ProfessionalNoteRichEditor({ initialHtml, placeholder, english, className }, ref) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const selectionRef = useRef<Range | null>(null);
    const initializedRef = useRef(false);
    const caretFrameRef = useRef(0);

    useImperativeHandle(ref, () => ({
      getContent: () => ({
        html: editorRef.current?.innerHTML || "",
        text: editorRef.current?.innerText.trim() || "",
      }),
      focus: () => editorRef.current?.focus(),
    }), []);

    function setEditorRef(node: HTMLDivElement | null) {
      editorRef.current = node;
      if (node && !initializedRef.current) {
        node.innerHTML = initialHtml;
        initializedRef.current = true;
      }
    }

    function rememberSelection() {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return selectionRef.current;
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        selectionRef.current = range.cloneRange();
      }
      return selectionRef.current;
    }

    function restoreSelection() {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection) return;
      editor.focus({ preventScroll: true });
      if (!selectionRef.current) return;
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }

    function preserveSelection(event: ReactPointerEvent<HTMLElement>) {
      rememberSelection();
      event.preventDefault();
    }

    function scheduleCaretVisibility() {
      window.cancelAnimationFrame(caretFrameRef.current);
      caretFrameRef.current = window.requestAnimationFrame(() => {
        const editor = editorRef.current;
        const selection = window.getSelection();
        if (!editor || !selection || selection.rangeCount === 0 || document.activeElement !== editor) return;
        const range = selection.getRangeAt(0).cloneRange();
        if (!editor.contains(range.commonAncestorContainer)) return;
        range.collapse(false);
        const caretRect = range.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        const topBoundary = editorRect.top + 24;
        const bottomBoundary = editorRect.bottom - 48;
        if (caretRect.bottom > bottomBoundary) {
          editor.scrollTop += caretRect.bottom - bottomBoundary + 12;
        } else if (caretRect.top < topBoundary) {
          editor.scrollTop -= topBoundary - caretRect.top + 12;
        }
      });
    }

    function command(name: string, value?: string) {
      restoreSelection();
      document.execCommand(name, false, value);
      rememberSelection();
      scheduleCaretVisibility();
    }

    function selectedBlocks() {
      const editor = editorRef.current;
      const range = selectionRef.current;
      if (!editor || !range) return [] as HTMLElement[];
      const selector = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre";
      const blocks = Array.from(editor.querySelectorAll<HTMLElement>(selector)).filter((element) => {
        try {
          return range.intersectsNode(element);
        } catch {
          return false;
        }
      });
      if (blocks.length) return blocks;
      const container = range.commonAncestorContainer instanceof HTMLElement
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      const block = container?.closest<HTMLElement>(selector) || null;
      return block && editor.contains(block) ? [block] : [];
    }

    function applyBlockStyle(property: "line-height" | "margin-bottom", value: string) {
      if (!value) return;
      restoreSelection();
      let blocks = selectedBlocks();
      if (!blocks.length) {
        document.execCommand("formatBlock", false, "p");
        rememberSelection();
        blocks = selectedBlocks();
      }
      blocks.forEach((block) => block.style.setProperty(property, value));
      rememberSelection();
    }

    function insertLink() {
      const selectedRange = rememberSelection();
      const value = window.prompt(english ? "Link address (https://…)" : "Adresse du lien (https://…)", "https://");
      if (!value || !selectedRange) return;
      const candidate = /^(?:https?:\/\/|mailto:)/i.test(value) ? value.trim() : `https://${value.trim()}`;
      try {
        const url = new URL(candidate);
        if (!["http:", "https:", "mailto:"].includes(url.protocol)) return;
        restoreSelection();
        document.execCommand("createLink", false, url.toString());
        rememberSelection();
      } catch {
        return;
      }
    }

    const iconButtonClass = "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-dtsc-border bg-dtsc-page text-dtsc-ink transition hover:border-cyan-400 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300";
    const selectClass = "h-10 shrink-0 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-xs font-black text-dtsc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300";

    return (
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface", className)}>
        <div className="shrink-0 border-b border-dtsc-border bg-dtsc-surface/95 backdrop-blur" role="toolbar" aria-label={english ? "Rich text formatting" : "Mise en forme riche"}>
          <div className="flex min-w-max flex-nowrap items-center gap-2 overflow-x-auto px-2 py-2 [scrollbar-width:thin] sm:px-3">
            <EditorButton label={english ? "Undo" : "Annuler"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("undo")}><Undo2 className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Redo" : "Rétablir"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("redo")}><Redo2 className="h-4 w-4" /></EditorButton>
            <ToolbarDivider />
            <EditorButton label={english ? "Bold" : "Gras"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("bold")}><Bold className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Italic" : "Italique"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("italic")}><Italic className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Underline" : "Souligné"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("underline")}><Underline className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Strike through" : "Barré"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("strikeThrough")}><Strikethrough className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Highlight" : "Surligner"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("hiliteColor", "#fef08a")}><Highlighter className="h-4 w-4" /></EditorButton>
            <ToolbarDivider />
            <EditorButton label={english ? "Heading 1" : "Titre 1"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("formatBlock", "h1")}><Heading1 className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Heading 2" : "Titre 2"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("formatBlock", "h2")}><Heading2 className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Quote" : "Citation"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("formatBlock", "blockquote")}><Quote className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Code block" : "Bloc de code"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("formatBlock", "pre")}><Code2 className="h-4 w-4" /></EditorButton>
            <ToolbarDivider />
            <EditorButton label={english ? "Bullet list" : "Liste à puces"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("insertUnorderedList")}><List className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Numbered list" : "Liste numérotée"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("insertOrderedList")}><ListOrdered className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Decrease indent" : "Diminuer le retrait"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("outdent")}><IndentDecrease className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Increase indent" : "Augmenter le retrait"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("indent")}><IndentIncrease className="h-4 w-4" /></EditorButton>
            <ToolbarDivider />
            <EditorButton label={english ? "Align left" : "Aligner à gauche"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("justifyLeft")}><AlignLeft className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Center" : "Centrer"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("justifyCenter")}><AlignCenter className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Align right" : "Aligner à droite"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("justifyRight")}><AlignRight className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Justify" : "Justifier"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("justifyFull")}><AlignJustify className="h-4 w-4" /></EditorButton>
            <ToolbarDivider />
            <select defaultValue="" onPointerDown={rememberSelection} onChange={(event) => { if (event.target.value) command("foreColor", event.target.value); event.currentTarget.value = ""; }} className={selectClass} aria-label={english ? "Text color" : "Couleur du texte"}>
              <option value="">{english ? "Color" : "Couleur"}</option>
              {TEXT_COLORS.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select defaultValue="" onPointerDown={rememberSelection} onChange={(event) => { if (event.target.value) command("fontName", event.target.value); event.currentTarget.value = ""; }} className={selectClass} aria-label={english ? "Font" : "Police"}>
              <option value="">{english ? "Font" : "Police"}</option>
              {FONT_FAMILIES.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select defaultValue="" onPointerDown={rememberSelection} onChange={(event) => { if (event.target.value) command("fontSize", event.target.value); event.currentTarget.value = ""; }} className={selectClass} aria-label={english ? "Font size" : "Taille du texte"}>
              <option value="">{english ? "Size" : "Taille"}</option>
              {FONT_SIZES.map(([label, value]) => <option key={value} value={value}>{english ? label : label === "Small" ? "Petit" : label === "Large" ? "Grand" : label === "Title" ? "Titre" : "Normal"}</option>)}
            </select>
            <select defaultValue="" onPointerDown={rememberSelection} onChange={(event) => { applyBlockStyle("line-height", event.target.value); event.currentTarget.value = ""; }} className={selectClass} aria-label={english ? "Line height" : "Interligne"}>
              <option value="">{english ? "Line height" : "Interligne"}</option>
              {LINE_HEIGHTS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select defaultValue="" onPointerDown={rememberSelection} onChange={(event) => { applyBlockStyle("margin-bottom", event.target.value); event.currentTarget.value = ""; }} className={selectClass} aria-label={english ? "Paragraph spacing" : "Espacement des paragraphes"}>
              <option value="">{english ? "Paragraph spacing" : "Espacement"}</option>
              {PARAGRAPH_SPACINGS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <ToolbarDivider />
            <EditorButton label={english ? "Add link" : "Ajouter un lien"} className={iconButtonClass} onPointerDown={(event) => { rememberSelection(); event.preventDefault(); }} onClick={insertLink}><Link2 className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Remove link" : "Retirer le lien"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("unlink")}><Unlink className="h-4 w-4" /></EditorButton>
            <EditorButton label={english ? "Clear formatting" : "Effacer la mise en forme"} className={iconButtonClass} onPointerDown={preserveSelection} onClick={() => command("removeFormat")}><Eraser className="h-4 w-4" /></EditorButton>
          </div>
        </div>

        <div
          ref={setEditorRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          aria-label={placeholder}
          onFocus={rememberSelection}
          onClick={rememberSelection}
          onKeyUp={() => { rememberSelection(); scheduleCaretVisibility(); }}
          onInput={() => { rememberSelection(); scheduleCaretVisibility(); }}
          className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-auto overflow-y-auto overscroll-contain px-4 py-4 text-[16px] leading-7 text-dtsc-ink outline-none scroll-pb-32 empty:before:pointer-events-none empty:before:text-dtsc-muted empty:before:content-[attr(data-placeholder)] sm:px-5 sm:py-5 sm:text-sm [&_a]:font-bold [&_a]:text-dtsc-blue [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-cyan-400 [&_blockquote]:bg-dtsc-page [&_blockquote]:px-4 [&_blockquote]:py-2 [&_code]:rounded [&_code]:bg-dtsc-soft [&_code]:px-1 [&_h1]:text-3xl [&_h1]:font-black [&_h2]:text-2xl [&_h2]:font-black [&_h3]:text-xl [&_h3]:font-black [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-6"
        />
      </div>
    );
  },
);

function EditorButton({
  label,
  className,
  onPointerDown,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" title={label} aria-label={label} className={className} onPointerDown={onPointerDown} onClick={onClick}>
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="h-7 w-px shrink-0 bg-dtsc-border" aria-hidden="true" />;
}
