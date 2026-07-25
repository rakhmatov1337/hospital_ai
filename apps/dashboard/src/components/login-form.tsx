import { useState, type FormEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { apiClient, errorCodeOf } from "../lib/api-client"
import type { StaffLoginResponse } from "../lib/api-types"
import { useAuth } from "../lib/auth"

/**
 * shadcn `login-01` block, wired to the staff auth flow (D1). Clinic-provisioned
 * access only — no self-registration and no social login, so the block's "Sign up"
 * and "Login with Google" affordances are intentionally removed.
 */
export function LoginForm({ className }: { className?: string }) {
  const { t } = useTranslation(["login", "common", "errors"])
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? "/queue"

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const session = await apiClient.post<StaffLoginResponse>(
        "/auth/staff/login",
        { email: email.trim(), password },
      )
      signIn(session)
      navigate(from, { replace: true })
    } catch (err) {
      const code = errorCodeOf(err)
      setError(
        code === "UNAUTHORIZED"
          ? t("login:invalidCredentials")
          : t(`errors:${code}`, { defaultValue: t("errors:default") }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Card>
        <CardHeader>
          <CardTitle>{t("login:title")}</CardTitle>
          <CardDescription>{t("login:subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t("login:emailLabel")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  placeholder={t("login:emailPlaceholder")}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">{t("login:passwordLabel")}</FieldLabel>
                  <a
                    href="#"
                    title={t("login:forgotPasswordHelp")}
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    {t("login:forgotPassword")}
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  placeholder={t("login:passwordPlaceholder")}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Field>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t("login:submitting") : t("login:submit")}
                </Button>
                <FieldDescription className="text-center">
                  {t("login:noRegistration")}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
