"use client";

import { forwardRef, useRef, useState, type ClipboardEvent, type MutableRefObject } from "react";
import { AlignCenter, AlignLeft, Bold, Italic, List, ListOrdered, Palette, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";

type RichTextEditorProps = {
  textName: string;
  htmlName: string;
  placeholder?: string;
  disabled?: boolean;
  defaultValue?: string;
  minHeightClassName?: string;
};

const fontFamilies = [
  { label: "Inter", value: "Inter, Arial, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const fontSizes = [
  { label: "Petit", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Grand", value: "5" },
  { label: "Titre", value: "6" },
];

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor(
  { textName, htmlName, placeholder, disabled, defaultValue = "", minHeightClassName = "min-h-44" },
  ref
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [plainText, setPlainText] = useState(defaultValue.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const [html, setHtml] = useState(defaultValue);

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

  function selectCommand(name: string, value: string) {
    if (!value) {
      return;
    }
    command(name, value);
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

  function handleInput() {
    sync();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-dtsc-border bg-dtsc-surface">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-dtsc-border bg-dtsc-surface/95 px-3 py-2 backdrop-blur">
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
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("insertUnorderedList")} title="Créer une liste à puces professionnelle." className="rounded-lg">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("insertOrderedList")} title="Créer une numérotation." className="rounded-lg">
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("justifyLeft")} title="Aligner à gauche." className="rounded-lg">
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("justifyCenter")} title="Centrer le texte sélectionné." className="rounded-lg">
          <AlignCenter className="h-4 w-4" />
        </Button>
        <select
          disabled={disabled}
          defaultValue=""
          onChange={(event) => selectCommand("fontName", event.target.value)}
          title="Changer la police du texte sélectionné."
          className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink"
        >
          <option value="">Police</option>
          {fontFamilies.map((font) => (
            <option key={font.label} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <select
          disabled={disabled}
          defaultValue=""
          onChange={(event) => selectCommand("fontSize", event.target.value)}
          title="Changer la taille du texte sélectionné."
          className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink"
        >
          <option value="">Taille</option>
          {fontSizes.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>
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
        className={`${minHeightClassName} max-h-80 w-full overflow-y-auto px-3 py-3 text-sm leading-7 text-dtsc-ink outline-none empty:before:text-dtsc-muted empty:before:content-[attr(data-placeholder)] [&_a]:font-bold [&_a]:text-dtsc-blue [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6`}
        data-placeholder={placeholder || "Rédigez votre message..."}
        aria-label={placeholder || "Editeur de contenu riche"}
        dangerouslySetInnerHTML={defaultValue ? { __html: defaultValue } : undefined}
      />
      <input type="hidden" name={textName} value={plainText} />
      <input type="hidden" name={htmlName} value={html} />
    </div>
  );
});
