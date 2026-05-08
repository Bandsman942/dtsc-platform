"use client";

import { forwardRef, useRef, useState, type ChangeEvent, type ClipboardEvent, type MouseEvent, type MutableRefObject } from "react";
import { AlignCenter, AlignLeft, Bold, ImagePlus, Italic, List, ListOrdered, Palette, Trash2, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";

type RichTextEditorProps = {
  textName: string;
  htmlName: string;
  placeholder?: string;
  disabled?: boolean;
  defaultValue?: string;
  minHeightClassName?: string;
  allowImageUpload?: boolean;
  onContentChange?: (content: { text: string; html: string }) => void;
};

const MAX_EDITOR_IMAGE_WIDTH = 960;
const MAX_EDITOR_IMAGE_HEIGHT = 540;
const EDITOR_IMAGE_QUALITY = 0.84;

type ImageDeletePosition = {
  top: number;
  left: number;
} | null;

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
  { textName, htmlName, placeholder, disabled, defaultValue = "", minHeightClassName = "min-h-44", allowImageUpload = false, onContentChange },
  ref
) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<Range | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const [plainText, setPlainText] = useState(defaultValue.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const [html, setHtml] = useState(defaultValue);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [editorMessage, setEditorMessage] = useState("");
  const [imageDeletePosition, setImageDeletePosition] = useState<ImageDeletePosition>(null);

  function sync() {
    const editor = editorRef.current;
    const nextText = editor?.innerText.trim() || "";
    const nextHtml = editor?.innerHTML || "";
    setPlainText(nextText);
    setHtml(nextHtml);
    onContentChange?.({ text: nextText, html: nextHtml });
  }

  function updateImageDeletePosition(image = selectedImageRef.current) {
    const shell = shellRef.current;
    if (!shell || !image) {
      setImageDeletePosition(null);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const buttonSize = 40;
    setImageDeletePosition({
      top: Math.max(56, imageRect.top - shellRect.top + 10),
      left: Math.min(Math.max(10, imageRect.right - shellRect.left - buttonSize - 10), shellRect.width - buttonSize - 10),
    });
  }

  function selectImageForDeletion(target: EventTarget | null) {
    if (!allowImageUpload || disabled || !(target instanceof HTMLImageElement) || !editorRef.current?.contains(target)) {
      selectedImageRef.current = null;
      setImageDeletePosition(null);
      return;
    }

    selectedImageRef.current = target;
    updateImageDeletePosition(target);
  }

  function removeSelectedImage() {
    if (disabled || !selectedImageRef.current) {
      return;
    }

    const image = selectedImageRef.current;
    const removable = image.closest("figure") || image;
    removable.remove();
    selectedImageRef.current = null;
    setImageDeletePosition(null);
    setEditorMessage("Image retirée du contenu. Enregistrez pour appliquer la modification.");
    sync();
  }

  function command(name: string, value?: string) {
    if (disabled) {
      return;
    }
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    sync();
  }

  function rememberSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
      return selectionRef.current;
    }

    return selectionRef.current;
  }

  function restoreSelection(range?: Range | null) {
    const selection = window.getSelection();
    const targetRange = range || selectionRef.current;
    if (!selection || !targetRange) {
      editorRef.current?.focus();
      return;
    }

    editorRef.current?.focus();
    selection.removeAllRanges();
    selection.addRange(targetRange);
  }

  function insertHtml(htmlContent: string, range?: Range | null) {
    restoreSelection(range);
    document.execCommand("insertHTML", false, htmlContent);
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

  async function optimizeImage(file: File) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const element = new Image();
      element.onload = () => {
        URL.revokeObjectURL(url);
        resolve(element);
      };
      element.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image illisible"));
      };
      element.src = url;
    });

    const scale = Math.min(1, MAX_EDITOR_IMAGE_WIDTH / image.naturalWidth, MAX_EDITOR_IMAGE_HEIGHT / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Optimisation image indisponible");
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Compression image impossible"));
          }
        },
        "image/webp",
        EDITOR_IMAGE_QUALITY
      );
    });

    const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "-") || "publication-image";
    return new File([blob], `${cleanName}.webp`, { type: "image/webp" });
  }

  async function uploadImage(file: File) {
    const optimizedFile = await optimizeImage(file);
    const formData = new FormData();
    formData.append("file", optimizedFile);

    const response = await fetch("/api/admin/publications/images", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || "Impossible d'envoyer l'image");
    }

    return payload.url;
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function insertUploadedImage(file: File, range?: Range | null) {
    setIsUploadingImage(true);
    setEditorMessage("Optimisation et insertion de l'image en cours...");
    try {
      const url = await uploadImage(file);
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Image de publication DTSC";
      insertHtml(
        `<figure class="dtsc-publication-image"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(alt)}</figcaption></figure>`,
        range
      );
      setEditorMessage("Image ajoutée à la publication.");
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Impossible d'ajouter l'image.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function replacePastedDataImages(htmlContent: string) {
    let processedHtml = htmlContent;
    const matches = [...htmlContent.matchAll(/<img[^>]+src=["'](data:image\/[^"']+)["'][^>]*>/gi)];
    for (const [index, match] of matches.entries()) {
      const dataUrl = match[1];
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `image-collee-${index + 1}.${blob.type.includes("png") ? "png" : "jpg"}`, {
        type: blob.type || "image/png",
      });
      const url = await uploadImage(file);
      processedHtml = processedHtml.replace(dataUrl, url);
    }

    return processedHtml;
  }

  async function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled) {
      event.preventDefault();
      return;
    }

    const range = rememberSelection();
    const pastedImages = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (allowImageUpload && pastedImages.length) {
      event.preventDefault();
      for (const file of pastedImages) {
        await insertUploadedImage(file, range);
      }
      return;
    }

    const htmlContent = event.clipboardData.getData("text/html");
    if (!htmlContent) {
      return;
    }

    event.preventDefault();
    if (allowImageUpload && htmlContent.includes("data:image/")) {
      setIsUploadingImage(true);
      setEditorMessage("Optimisation des images collées...");
      try {
        insertHtml(await replacePastedDataImages(htmlContent), range);
        setEditorMessage("Contenu collé avec images optimisées.");
      } catch (error) {
        setEditorMessage(error instanceof Error ? error.message : "Impossible d'optimiser les images collées.");
      } finally {
        setIsUploadingImage(false);
      }
      return;
    }

    insertHtml(htmlContent, range);
  }

  function handleInput() {
    rememberSelection();
    updateImageDeletePosition();
    sync();
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>) {
    rememberSelection();
    selectImageForDeletion(event.target);
  }

  function handleEditorScroll() {
    updateImageDeletePosition();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    await insertUploadedImage(file, selectionRef.current);
  }

  return (
    <div ref={shellRef} className="relative overflow-hidden rounded-xl border border-dtsc-border bg-dtsc-surface">
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
        {allowImageUpload && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isUploadingImage}
              onMouseDown={() => rememberSelection()}
              onClick={() => fileInputRef.current?.click()}
              title="Ajouter une image optimisée à l'emplacement du curseur."
              className="rounded-lg"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
          </>
        )}
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
        {allowImageUpload && editorMessage && (
          <span className="rounded-full border border-dtsc-border bg-dtsc-page px-3 py-1 text-xs font-bold text-dtsc-blue">
            {editorMessage}
          </span>
        )}
      </div>
      <div
        ref={setRefs}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onPaste={handlePaste}
        onInput={handleInput}
        onClick={handleEditorClick}
        onKeyUp={rememberSelection}
        onScroll={handleEditorScroll}
        className={`${minHeightClassName} max-h-80 w-full overflow-y-auto px-3 py-3 text-sm leading-7 text-dtsc-ink outline-none empty:before:text-dtsc-muted empty:before:content-[attr(data-placeholder)] [&_a]:font-bold [&_a]:text-dtsc-blue [&_a]:underline [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:font-bold [&_figcaption]:text-dtsc-muted [&_figure]:mx-auto [&_figure]:my-4 [&_figure]:max-w-[640px] [&_img]:max-h-[320px] [&_img]:w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-dtsc-border [&_img]:bg-dtsc-page [&_img]:object-contain [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6`}
        data-placeholder={placeholder || "Rédigez votre message..."}
        aria-label={placeholder || "Editeur de contenu riche"}
        dangerouslySetInnerHTML={defaultValue ? { __html: defaultValue } : undefined}
      />
      {allowImageUpload && imageDeletePosition && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={removeSelectedImage}
          title="Supprimer cette image de la publication."
          aria-label="Supprimer cette image de la publication"
          className="absolute z-20 flex h-10 w-10 items-center justify-center rounded-full border border-red-300/70 bg-red-600 text-white shadow-[0_14px_34px_rgba(185,28,28,0.28)] transition hover:bg-red-700"
          style={{ top: imageDeletePosition.top, left: imageDeletePosition.left }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <input type="hidden" name={textName} value={plainText} />
      <input type="hidden" name={htmlName} value={html} />
    </div>
  );
});
