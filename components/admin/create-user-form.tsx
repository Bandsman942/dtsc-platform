"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { adminCreateUserT, type AdminCreateUserCopyKey } from "@/components/admin/create-user-i18n";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import type { ToastTone } from "@/lib/client-toast";

type UserField =
  | "name"
  | "email"
  | "password"
  | "role"
  | "companyName"
  | "phone"
  | "dailyMessageLimit"
  | "dailyTokenLimit";

type FieldErrors = Partial<Record<UserField, string>>;
type AdminCreateUserResponse = {
  ok?: boolean;
  reasonCode?: string;
  fieldErrors?: Partial<Record<UserField, string>>;
};

const fieldErrorCopy: Record<UserField, AdminCreateUserCopyKey> = {
  name: "nameError",
  email: "emailError",
  password: "passwordError",
  role: "roleError",
  companyName: "companyError",
  phone: "phoneError",
  dailyMessageLimit: "messageLimitError",
  dailyTokenLimit: "tokenLimitError",
};

export function CreateUserForm() {
  const router = useRouter();
  const locale = useAppLocale();
  const t = (key: AdminCreateUserCopyKey) => adminCreateUserT(locale, key);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<ToastTone>("info");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useToastMessage(message, messageTone);

  function closeDialog() {
    if (busy) return;
    setOpen(false);
    setFieldErrors({});
    setMessage("");
  }

  function clearFieldError(field: UserField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validationErrorsFromResponse(body: AdminCreateUserResponse | null) {
    const next: FieldErrors = {};
    if (!body?.fieldErrors) return next;
    for (const field of Object.keys(body.fieldErrors) as UserField[]) {
      if (field in fieldErrorCopy) next[field] = t(fieldErrorCopy[field]);
    }
    return next;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setFieldErrors({});
    setBusy(true);

    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as AdminCreateUserResponse | null;

      if (!response.ok) {
        const nextFieldErrors = validationErrorsFromResponse(body);
        if (body?.reasonCode === "EMAIL_ALREADY_EXISTS") nextFieldErrors.email = t("emailExists");
        setFieldErrors(nextFieldErrors);
        setMessageTone("error");

        if (body?.reasonCode === "VALIDATION_ERROR") setMessage(t("validationError"));
        else if (body?.reasonCode === "EMAIL_ALREADY_EXISTS") setMessage(t("emailExists"));
        else if (response.status === 401 || response.status === 403) setMessage(t("accessDenied"));
        else if (body?.reasonCode === "PROVISIONING_UNAVAILABLE") setMessage(t("provisioningUnavailable"));
        else setMessage(t("unexpectedError"));
        return;
      }

      setMessageTone("success");
      setMessage(t("success"));
      form.reset();
      setOpen(false);
      router.refresh();
    } catch {
      setMessageTone("error");
      setMessage(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-dtsc-muted">{t("description")}</p>
        <Button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <UserPlus className="h-4 w-4" />
          {t("openButton")}
        </Button>
      </div>
      <Dialog
        open={open}
        title={t("dialogTitle")}
        description={t("dialogDescription")}
        onClose={closeDialog}
        className="h-[92dvh] max-w-4xl"
      >
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <FormField label={t("nameLabel")} hint={t("nameHint")} error={fieldErrors.name} required>
            <Input name="name" placeholder={t("namePlaceholder")} minLength={2} maxLength={120} required onInput={() => clearFieldError("name")} />
          </FormField>
          <FormField label={t("emailLabel")} hint={t("emailHint")} error={fieldErrors.email} required>
            <Input name="email" type="email" placeholder={t("emailPlaceholder")} maxLength={180} required onInput={() => clearFieldError("email")} />
          </FormField>
          <FormField label={t("passwordLabel")} hint={t("passwordHint")} error={fieldErrors.password} required>
            <PasswordInput
              name="password"
              placeholder={t("passwordPlaceholder")}
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              showPasswordLabel={t("showPassword")}
              hidePasswordLabel={t("hidePassword")}
              onInput={() => clearFieldError("password")}
            />
          </FormField>
          <FormField label={t("roleLabel")} hint={t("roleHint")} error={fieldErrors.role} required>
            <select
              name="role"
              required
              onChange={() => clearFieldError("role")}
              className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"
            >
              <option value="CLIENT">{t("roleClient")}</option>
              <option value="SUPPORT">{t("roleSupport")}</option>
              <option value="MANAGER">{t("roleManager")}</option>
              <option value="ADMIN">{t("roleAdmin")}</option>
            </select>
          </FormField>
          <FormField label={t("companyLabel")} hint={t("companyHint")} error={fieldErrors.companyName}>
            <Input name="companyName" placeholder={t("companyPlaceholder")} maxLength={160} onInput={() => clearFieldError("companyName")} />
          </FormField>
          <FormField label={t("phoneLabel")} hint={t("phoneHint")} error={fieldErrors.phone}>
            <Input name="phone" placeholder={t("phonePlaceholder")} maxLength={40} onInput={() => clearFieldError("phone")} />
          </FormField>
          <FormField label={t("messageLimitLabel")} hint={t("messageLimitHint")} error={fieldErrors.dailyMessageLimit} required>
            <Input name="dailyMessageLimit" type="number" defaultValue={30} min={1} max={1000} step={1} required onInput={() => clearFieldError("dailyMessageLimit")} />
          </FormField>
          <FormField label={t("tokenLimitLabel")} hint={t("tokenLimitHint")} error={fieldErrors.dailyTokenLimit} required>
            <Input name="dailyTokenLimit" type="number" defaultValue={100000} min={1000} max={2000000} step={1} required onInput={() => clearFieldError("dailyTokenLimit")} />
          </FormField>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy} aria-busy={busy} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <UserPlus className="h-4 w-4" />
              {busy ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
