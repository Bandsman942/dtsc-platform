import * as React from "react"

import { ReferenceSelect } from "@/components/ui/reference-select"
import { controlledReferenceKind } from "@/lib/forms/reference-catalog"
import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<"input"> & {
  multiline?: boolean;
  rows?: number;
};

function Input({ className, type, placeholder, title, "aria-label": ariaLabel, multiline = false, rows = 3, ...props }: InputProps) {
  const accessibleHint = typeof placeholder === "string" && placeholder.length > 0 ? placeholder : undefined;
  const referenceKind = controlledReferenceKind(typeof props.name === "string" ? props.name : undefined);

  if (referenceKind && (!type || type === "text")) {
    return (
      <ReferenceSelect
        kind={referenceKind}
        name={props.name}
        value={props.value}
        defaultValue={props.defaultValue}
        required={props.required}
        disabled={props.disabled}
        onChange={props.onChange}
        title={title ?? accessibleHint}
        ariaLabel={ariaLabel ?? accessibleHint}
        className={className}
      />
    );
  }

  const commentComposer = typeof placeholder === "string"
    && /^(ajouter|répondre|votre réponse|écrire|rédiger).*(commentaire|discussion|réponse)/i.test(placeholder.trim());
  const shouldUseTextarea = multiline || ((!type || type === "text") && commentComposer);

  if (shouldUseTextarea) {
    const textareaProps = props as unknown as React.ComponentProps<"textarea">;
    return (
      <textarea
        data-slot="input"
        data-comment-composer={commentComposer ? "true" : undefined}
        rows={rows}
        placeholder={placeholder}
        title={title ?? accessibleHint}
        aria-label={ariaLabel ?? accessibleHint}
        className={cn(
          "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex min-h-24 w-full min-w-0 resize-y rounded-md border bg-transparent px-3 py-2 text-base leading-6 shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className
        )}
        {...textareaProps}
      />
    );
  }

  return (
    <input
      type={type}
      data-slot="input"
      placeholder={placeholder}
      title={title ?? accessibleHint}
      aria-label={ariaLabel ?? accessibleHint}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
