"use client";

import { forwardRef, useRef, useState, type ClipboardEvent, type FormEvent, type MutableRefObject } from "react";
import { Bold, Italic, Palette, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";

type RichTextEditorProps = {
  textName: string;
  htmlName: string;
  placeholder?: string;
  disabled?: boolean;
};

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor(
  { textName, htmlName, placeholder, disabled },
  ref
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [plainText, setPlainText] = useState("");
  const [html, setHtml] = useState("");

  function sync() {
    const editor = editorRef.current;
    setPlainText(editor?.innerText.trim() || "");
    setHtml(editor?.innerHTML || "");
  }

  function command(name: string, value?: string) {
    if (disabled) {
      return;
    }
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    sync();
  }

  function setRefs(node: HTMLDivElement | null) {
    editorRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      (ref as MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled) {
      event.preventDefault();
      return;
    }

    const htmlContent = event.clipboardData.getData("text/html");
    if (!htmlContent) {
      return;
    }

    event.preventDefault();
    document.execCommand("insertHTML", false, htmlContent);
    sync();
  }

  function handleInput(_: FormEvent<HTMLDivElement>) {
    sync();
  }

  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-dtsc-border px-3 py-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("bold")} title="Mettre le texte sélectionné en gras." className="rounded-lg">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("italic")} title="Mettre le texte sélectionné en italique." className="rounded-lg">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("underline")} title="Souligner le texte sélectionné." className="rounded-lg">
          <Underline className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("foreColor", "#00a7c7")} title="Appliquer la couleur d'accent DTSC." className="rounded-lg">
          <Palette className="h-4 w-4" />
        </Button>
        <span className="text-xs leading-5 text-dtsc-muted">
          Le collage conserve autant que possible le gras, l&apos;italique, les couleurs, images et émojis.
        </span>
      </div>
      <div
        ref={setRefs}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onPaste={handlePaste}
        onInput={handleInput}
        className="min-h-36 w-full px-3 py-3 text-sm leading-7 text-dtsc-ink outline-none empty:before:text-dtsc-muted empty:before:content-[attr(data-placeholder)]"
        data-placeholder={placeholder || "Rédigez votre message..."}
        aria-label={placeholder || "Editeur de contenu riche"}
      />
      <input type="hidden" name={textName} value={plainText} />
      <input type="hidden" name={htmlName} value={html} />
    </div>
  );
});
