"use client";

import { forwardRef, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type MouseEvent, type MutableRefObject } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Code2, Eraser, Heading1, Heading2, Highlighter, ImagePlus, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, Minus, Palette, Quote, Redo2, SmilePlus, Strikethrough, Table2, Trash2, Underline, Undo2, Unlink, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

type RichTextEditorProps = {
  textName: string;
  htmlName: string;
  placeholder?: string;
  disabled?: boolean;
  defaultValue?: string;
  minHeightClassName?: string;
  allowImageUpload?: boolean;
  allowVideoEmbed?: boolean;
  imageUploadUrl?: string;
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

const textColors = [
  { label: "Accent DTSC", value: "#00a7c7" },
  { label: "Bleu", value: "#1d4ed8" },
  { label: "Vert", value: "#047857" },
  { label: "Rouge", value: "#b91c1c" },
  { label: "Orange", value: "#c2410c" },
  { label: "Violet", value: "#6d28d9" },
  { label: "Gris", value: "#475569" },
  { label: "Noir", value: "#111827" },
  { label: "Cyan", value: "#0e7490" },
  { label: "Amber", value: "#b45309" },
];

const listStyles = [
  { label: "Puce simple", value: "disc" },
  { label: "Puce cercle", value: "circle" },
  { label: "Puce carré", value: "square" },
  { label: "Numérotée", value: "decimal" },
  { label: "Alphabétique", value: "lower-alpha" },
  { label: "Checklist", value: "checklist" },
  { label: "Tirets", value: "dash" },
];

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor(
  { textName, htmlName, placeholder, disabled, defaultValue = "", minHeightClassName = "min-h-44", allowImageUpload = false, allowVideoEmbed = false, imageUploadUrl = "/api/admin/publications/images", onContentChange },
  ref
) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef<Range | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const initializedRef = useRef(false);
  const htmlRef = useRef(defaultValue);
  const [plainText, setPlainText] = useState(defaultValue.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const [html, setHtml] = useState(defaultValue);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [editorMessage, setEditorMessage] = useState("");
  const [imageDeletePosition, setImageDeletePosition] = useState<ImageDeletePosition>(null);

  useEffect(() => {
    if (defaultValue === htmlRef.current || defaultValue === editorRef.current?.innerHTML) {
      return;
    }
    if (document.activeElement === editorRef.current) {
      return;
    }

    const nextText = defaultValue.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    setPlainText(nextText);
    setHtml(defaultValue);
    htmlRef.current = defaultValue;
    selectedImageRef.current = null;
    setImageDeletePosition(null);
    if (editorRef.current && editorRef.current.innerHTML !== defaultValue) {
      editorRef.current.innerHTML = defaultValue;
    }
  }, [defaultValue]);

  function sync() {
    const editor = editorRef.current;
    const nextText = editor?.innerText.trim() || "";
    const nextHtml = editor?.innerHTML || "";
    setPlainText(nextText);
    setHtml(nextHtml);
    htmlRef.current = nextHtml;
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

  function applyListStyle(value: string) {
    if (!value) {
      return;
    }
    if (value === "checklist") {
      insertHtml('<ul class="dtsc-checklist"><li>☐ Élément à compléter</li></ul>');
      return;
    }
    if (value === "dash") {
      insertHtml('<ul class="dtsc-dash-list"><li>Élément de liste</li></ul>');
      return;
    }
    if (value === "decimal" || value === "lower-alpha") {
      insertHtml(`<ol style="list-style-type: ${value};"><li>Élément de liste</li></ol>`);
      return;
    }
    insertHtml(`<ul style="list-style-type: ${value};"><li>Élément de liste</li></ul>`);
  }

  function setRefs(node: HTMLDivElement | null) {
    editorRef.current = node;
    if (node && !initializedRef.current) {
      node.innerHTML = defaultValue;
      initializedRef.current = true;
    }
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

    const response = await fetch(imageUploadUrl, {
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
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) {
      return;
    }

    for (const file of files) {
      await insertUploadedImage(file, selectionRef.current);
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled || !allowImageUpload) {
      return;
    }
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      return;
    }
    event.preventDefault();
    const range = rememberSelection();
    for (const file of files) {
      await insertUploadedImage(file, range);
    }
  }

  function insertLink() {
    const range = rememberSelection();
    const value = window.prompt("Adresse du lien (https://…)", "https://");
    if (!value) return;
    const href = normalizeEditorUrl(value);
    if (!href) {
      setEditorMessage("Adresse de lien invalide.");
      return;
    }
    restoreSelection(range);
    document.execCommand("createLink", false, href);
    sync();
  }

  function insertVideo() {
    const range = rememberSelection();
    const value = window.prompt("Adresse HTTPS de la vidéo", "https://");
    if (!value) return;
    const href = normalizeEditorUrl(value);
    if (!href) {
      setEditorMessage("Adresse de vidéo invalide.");
      return;
    }
    const escaped = escapeHtml(href);
    const directVideo = /\.(?:mp4|webm|ogg)(?:[?#].*)?$/i.test(href);
    insertHtml(directVideo
      ? `<figure class="dtsc-publication-video"><video controls preload="metadata" src="${escaped}"></video><figcaption>Vidéo intégrée</figcaption></figure>`
      : `<figure class="dtsc-publication-video-card"><a href="${escaped}" target="_blank" rel="noopener noreferrer nofollow">🎬 Ouvrir la vidéo</a><figcaption>${escaped}</figcaption></figure>`, range);
  }

  function insertTable() {
    const range = rememberSelection();
    insertHtml('<table class="dtsc-rich-table"><thead><tr><th>Colonne 1</th><th>Colonne 2</th><th>Colonne 3</th></tr></thead><tbody><tr><td>Valeur</td><td>Valeur</td><td>Valeur</td></tr><tr><td>Valeur</td><td>Valeur</td><td>Valeur</td></tr></tbody></table><p><br></p>', range);
  }

  function insertEmoji(value: string) {
    if (!value) return;
    insertHtml(escapeHtml(value));
  }

  function normalizeEditorUrl(value: string) {
    const candidate = /^(?:https?:\/\/|mailto:)/i.test(value) ? value.trim() : `https://${value.trim()}`;
    try {
      const parsed = new URL(candidate);
      return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  return (
    <div ref={shellRef} className="relative overflow-hidden rounded-xl border border-dtsc-border bg-dtsc-surface">
      <div className="sticky top-0 z-10 max-h-60 overflow-y-auto border-b border-dtsc-border bg-dtsc-surface/95 px-3 py-2 backdrop-blur" role="toolbar" aria-label="Outils d’édition riche">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("undo")} title="Annuler"><Undo2 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("redo")} title="Rétablir"><Redo2 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("bold")} title="Gras"><Bold className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("italic")} title="Italique"><Italic className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("underline")} title="Souligné"><Underline className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("strikeThrough")} title="Barré"><Strikethrough className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("hiliteColor", "#fef08a")} title="Surligner"><Highlighter className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={() => rememberSelection()} onClick={insertLink} title="Ajouter un lien"><Link2 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("unlink")} title="Retirer le lien"><Unlink className="h-4 w-4" /></Button>
          <select disabled={disabled} defaultValue="" onMouseDown={() => rememberSelection()} onChange={(event) => { if (event.target.value) command("formatBlock", event.target.value); event.currentTarget.value = ""; }} title="Style de paragraphe" className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink">
            <option value="">Paragraphe</option><option value="p">Texte normal</option><option value="h1">Titre 1</option><option value="h2">Titre 2</option><option value="h3">Titre 3</option><option value="blockquote">Citation</option><option value="pre">Bloc de code</option>
          </select>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("formatBlock", "h1")} title="Titre principal"><Heading1 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("formatBlock", "h2")} title="Sous-titre"><Heading2 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("formatBlock", "blockquote")} title="Citation"><Quote className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("formatBlock", "pre")} title="Bloc de code"><Code2 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("insertUnorderedList")} title="Liste à puces"><List className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("insertOrderedList")} title="Liste numérotée"><ListOrdered className="h-4 w-4" /></Button>
          <select disabled={disabled} defaultValue="" onMouseDown={() => rememberSelection()} onChange={(event) => { applyListStyle(event.target.value); event.currentTarget.value = ""; }} title="Type de liste" className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink"><option value="">Type de liste</option>{listStyles.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}</select>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("outdent")} title="Diminuer le retrait"><IndentDecrease className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("indent")} title="Augmenter le retrait"><IndentIncrease className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("justifyLeft")} title="Aligner à gauche"><AlignLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("justifyCenter")} title="Centrer"><AlignCenter className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("justifyRight")} title="Aligner à droite"><AlignRight className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("justifyFull")} title="Justifier"><AlignJustify className="h-4 w-4" /></Button>
          <select disabled={disabled} defaultValue="" onMouseDown={() => rememberSelection()} onChange={(event) => { selectCommand("foreColor", event.target.value); event.currentTarget.value = ""; }} title="Couleur du texte" className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink"><option value="">Couleur</option>{textColors.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}</select>
          <select disabled={disabled} defaultValue="" onMouseDown={() => rememberSelection()} onChange={(event) => { selectCommand("fontName", event.target.value); event.currentTarget.value = ""; }} title="Police" className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink"><option value="">Police</option>{fontFamilies.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}</select>
          <select disabled={disabled} defaultValue="" onMouseDown={() => rememberSelection()} onChange={(event) => { selectCommand("fontSize", event.target.value); event.currentTarget.value = ""; }} title="Taille" className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink"><option value="">Taille</option>{fontSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}</select>
          <select disabled={disabled} defaultValue="" onMouseDown={() => rememberSelection()} onChange={(event) => { insertEmoji(event.target.value); event.currentTarget.value = ""; }} title="Insérer un émoji" className="h-9 rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-xs font-bold text-dtsc-ink"><option value="">Émoji</option><option value="✅">✅</option><option value="📌">📌</option><option value="📣">📣</option><option value="🚀">🚀</option><option value="💡">💡</option><option value="🎯">🎯</option><option value="👏">👏</option><option value="❤️">❤️</option></select>
          <SmilePlus className="h-4 w-4 text-dtsc-muted" aria-hidden="true" />
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={() => rememberSelection()} onClick={insertTable} title="Insérer un tableau"><Table2 className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={() => rememberSelection()} onClick={() => insertHtml("<hr>")} title="Insérer un séparateur"><Minus className="h-4 w-4" /></Button>
          {allowVideoEmbed ? <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={() => rememberSelection()} onClick={insertVideo} title="Insérer une vidéo"><Video className="h-4 w-4" /></Button> : null}
          {allowImageUpload ? <><Button type="button" variant="outline" size="sm" disabled={disabled || isUploadingImage} onMouseDown={() => rememberSelection()} onClick={() => fileInputRef.current?.click()} title="Ajouter une image"><ImagePlus className="h-4 w-4" /></Button><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={handleFileChange} /></> : null}
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => command("removeFormat")} title="Effacer la mise en forme"><Eraser className="h-4 w-4" /></Button>
          <Palette className="h-4 w-4 text-dtsc-muted" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xs leading-5 text-dtsc-muted">Titres, citations, code, liens, tableaux, listes, alignements, images, vidéos, couleurs, historique et émojis sont disponibles dans cette primitive partagée.</p>
        {editorMessage ? <span className="mt-2 inline-flex rounded-full border border-dtsc-border bg-dtsc-page px-3 py-1 text-xs font-bold text-dtsc-blue">{editorMessage}</span> : null}
      </div>
      <div
        ref={setRefs}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={allowImageUpload ? (event) => event.preventDefault() : undefined}
        onInput={handleInput}
        onClick={handleEditorClick}
        onKeyUp={rememberSelection}
        onScroll={handleEditorScroll}
        className={`${minHeightClassName} max-h-80 w-full overflow-y-auto px-3 py-3 text-sm leading-7 text-dtsc-ink outline-none empty:before:text-dtsc-muted empty:before:content-[attr(data-placeholder)] [&_a]:font-bold [&_a]:text-dtsc-blue [&_a]:underline [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:font-bold [&_figcaption]:text-dtsc-muted [&_figure]:mx-auto [&_figure]:my-4 [&_figure]:max-w-[640px] [&_img]:max-h-[320px] [&_img]:w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-dtsc-border [&_img]:bg-dtsc-page [&_img]:object-contain [&_blockquote]:border-l-4 [&_blockquote]:border-cyan-400 [&_blockquote]:bg-dtsc-page [&_blockquote]:px-4 [&_blockquote]:py-2 [&_code]:rounded [&_code]:bg-dtsc-soft [&_code]:px-1 [&_hr]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:text-slate-100 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-dtsc-border [&_td]:p-2 [&_th]:border [&_th]:border-dtsc-border [&_th]:bg-dtsc-soft [&_th]:p-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6`}
        data-placeholder={placeholder || "Rédigez votre message..."}
        aria-label={placeholder || "Editeur de contenu riche"}
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
