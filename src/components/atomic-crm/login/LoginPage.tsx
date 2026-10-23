import { useEffect, useRef, useState } from "react";
import {
  Form,
  minLength,
  required,
  useLogin,
  useNotify,
  useTranslate,
} from "ra-core";
import type { SubmitHandler, FieldValues } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/admin/text-input";
import { Notification } from "@/components/admin/notification";
import { cn } from "@/lib/utils";
import { useConfigurationContext } from "@/components/atomic-crm/root/ConfigurationContext.tsx";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { SSOAuthButton } from "./SSOAuthButton";
import {
  disableEmailPasswordAuthentication,
  googleWorkplaceDomain,
} from "./authConfig";

const SIGNUP_CLOSED_MESSAGE =
  "Sign-up is by invitation. Ask an administrator for an invitation.";

// Reads the reason from a failed function call: the function answers with { message, code }.
const readFunctionError = async (error: unknown) => {
  const response = (error as { context?: Response })?.context;
  const body = await response?.json?.().catch(() => null);
  return {
    message: (body?.message as string | undefined) ?? null,
    code: (body?.code as string | undefined) ?? null,
  };
};

/**
 * Login page displayed when authentication is enabled and the user is not authenticated.
 *
 * One card holds both forms. The coloured panel slides between "Sign in" and
 * "Create account" on click; on a phone the forms stack and a link switches between them.
 *
 * Automatically shown when an unauthenticated user tries to access a protected route.
 * Handles login via authProvider.login() and displays error notifications on failure.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/loginpage LoginPage documentation}
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/security Security documentation}
 */
export const LoginPage = (props: { redirectTo?: string }) => {
  const { darkModeLogo, title } = useConfigurationContext();
  const { redirectTo } = props;
  const [loading, setLoading] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const hasDisplayedRecoveryNotification = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const notify = useNotify();
  const translate = useTranslate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldNotify = searchParams.get("passwordRecoveryEmailSent") === "1";

    if (!shouldNotify || hasDisplayedRecoveryNotification.current) {
      return;
    }

    hasDisplayedRecoveryNotification.current = true;
    notify("crm.auth.recovery_email_sent", {
      type: "success",
      messageArgs: {
        _: "If you're a registered user, you should receive a password recovery email shortly.",
      },
    });

    searchParams.delete("passwordRecoveryEmailSent");
    const nextSearch = searchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, notify]);

  const handleSubmit: SubmitHandler<FieldValues> = (values) => {
    setLoading(true);
    login(values, redirectTo)
      .then(() => {
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        notify(
          typeof error === "string"
            ? error
            : typeof error === "undefined" || !error.message
              ? "ra.auth.sign_in_error"
              : error.message,
          {
            type: "error",
            messageArgs: {
              _:
                typeof error === "string"
                  ? error
                  : error && error.message
                    ? error.message
                    : undefined,
            },
          },
        );
      });
  };

  const handleSignUp: SubmitHandler<FieldValues> = async (values) => {
    setLoading(true);
    setSignupMessage(null);
    const { error } = await getSupabaseClient().functions.invoke("onboard", {
      body: values,
    });
    setLoading(false);
    if (error) {
      const { message, code } = await readFunctionError(error);
      setSignupMessage(
        code === "signup_closed"
          ? SIGNUP_CLOSED_MESSAGE
          : (message ?? "The account could not be created. Try again."),
      );
      return;
    }
    notify("Your account is ready. Sign in with your email and password.", {
      type: "success",
    });
    setSigningUp(false);
  };

  const switchMode = () => {
    setSignupMessage(null);
    setSigningUp((current) => !current);
  };

  // Both forms stay mounted so the slide is smooth. On a phone only the active one shows.
  const signInPaneClass = cn(
    "w-full px-8 py-10 transition-all duration-700 ease-in-out motion-reduce:transition-none md:absolute md:inset-y-0 md:left-0 md:w-1/2 md:flex md:flex-col md:justify-center",
    signingUp
      ? "hidden md:flex md:-translate-x-6 md:opacity-0 md:pointer-events-none"
      : "flex flex-col justify-center",
  );
  const signUpPaneClass = cn(
    "w-full px-8 py-10 transition-all duration-700 ease-in-out motion-reduce:transition-none md:absolute md:inset-y-0 md:left-1/2 md:w-1/2 md:flex md:flex-col md:justify-center",
    signingUp
      ? "flex flex-col justify-center"
      : "hidden md:flex md:translate-x-6 md:opacity-0 md:pointer-events-none",
  );
  // Sits on the right beside the sign-in form, and slides across to the left for sign-up.
  const overlayClass = cn(
    "hidden flex-col items-center justify-center gap-4 overflow-hidden bg-black p-10 text-center text-white transition-transform duration-700 ease-in-out motion-reduce:transition-none md:absolute md:inset-y-0 md:left-1/2 md:flex md:w-1/2",
    signingUp ? "md:-translate-x-full" : "md:translate-x-0",
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-500 px-4 py-8">
      {/* Blurred backdrop: black at the top left, blue at the bottom left, grey on the right */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[70%] w-[55%] rounded-full bg-black blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-32 h-[80%] w-[60%] rounded-full bg-blue-800 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-zinc-400/70 blur-2xl"
      />
      <div className="relative w-full max-w-4xl">
        <div className="relative min-h-[560px] overflow-hidden rounded-2xl border bg-card shadow-2xl">
          {/* Sign in */}
          <div className={signInPaneClass} aria-hidden={signingUp}>
            <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight md:text-left">
              {translate("ra.auth.sign_in")}
            </h1>
            {disableEmailPasswordAuthentication ? null : (
              <Form className="space-y-6" onSubmit={handleSubmit}>
                <TextInput
                  label="ra.auth.email"
                  source="email"
                  type="email"
                  validate={required()}
                />
                <TextInput
                  label="ra.auth.password"
                  source="password"
                  type="password"
                  validate={required()}
                />
                <Button
                  type="submit"
                  className="w-full cursor-pointer"
                  disabled={loading || signingUp}
                >
                  {translate("ra.auth.sign_in")}
                </Button>
              </Form>
            )}
            {googleWorkplaceDomain ? (
              <SSOAuthButton
                className="mt-4 w-full"
                domain={googleWorkplaceDomain}
              >
                {translate("crm.auth.sign_in_google_workspace", {
                  _: "Sign in with Google Workplace",
                })}
              </SSOAuthButton>
            ) : null}
            {disableEmailPasswordAuthentication ? null : (
              <Link
                to={"/forgot-password"}
                className="mt-4 block text-center text-sm hover:underline md:text-left"
              >
                {translate("ra-supabase.auth.forgot_password", {
                  _: "Forgot password?",
                })}
              </Link>
            )}
            <button
              type="button"
              onClick={switchMode}
              className="mt-6 text-center text-sm text-muted-foreground hover:underline md:hidden"
            >
              New here? Create an account
            </button>
          </div>

          {/* Create account */}
          <div className={signUpPaneClass} aria-hidden={!signingUp}>
            <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight md:text-left">
              Create account
            </h2>
            <Form className="space-y-5" onSubmit={handleSignUp}>
              <TextInput
                label="Business name"
                source="organisation_name"
                validate={required()}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="First name"
                  source="first_name"
                  validate={required()}
                />
                <TextInput
                  label="Last name"
                  source="last_name"
                  validate={required()}
                />
              </div>
              <TextInput
                label="ra.auth.email"
                source="email"
                type="email"
                validate={required()}
              />
              <TextInput
                label="ra.auth.password"
                source="password"
                type="password"
                validate={[required(), minLength(10)]}
              />
              {signupMessage ? (
                <p role="status" className="text-sm text-destructive">
                  {signupMessage}
                </p>
              ) : null}
              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={loading || !signingUp}
              >
                Sign up
              </Button>
            </Form>
            <button
              type="button"
              onClick={switchMode}
              className="mt-6 text-center text-sm text-muted-foreground hover:underline md:hidden"
            >
              Already have an account? Sign in
            </button>
          </div>

          {/* Coloured panel: invites the other form on wide screens */}
          <div className={overlayClass} aria-hidden="true">
            {/* Vertical blue light streaks, brightest at the bottom */}
            <div
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, transparent 0 18px, rgba(37, 99, 235, 0.9) 22px, rgba(37, 99, 235, 0) 30px, transparent 38px 56px)",
                maskImage:
                  "linear-gradient(to top, black 0%, black 35%, transparent 80%)",
                WebkitMaskImage:
                  "linear-gradient(to top, black 0%, black 35%, transparent 80%)",
                filter: "blur(1px)",
              }}
            />
            <img
              className="relative mb-2 h-8 brightness-0 invert"
              src={darkModeLogo}
              alt=""
            />
            <h2 className="relative text-3xl font-semibold tracking-tight">
              {signingUp ? "Welcome Back!" : "New to " + title + "?"}
            </h2>
            <p className="relative max-w-xs text-sm opacity-90">
              {signingUp
                ? "Sign in to pick up your pipeline, orders and messages where you left them."
                : "Set up your business on ReplyFlow and invite your team."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="relative cursor-pointer rounded-full border-white bg-transparent text-white hover:bg-white hover:text-black"
              onClick={switchMode}
            >
              {signingUp ? "Sign in" : "Create account"}
            </Button>
          </div>
        </div>
        <a
          href="/privacy.html"
          className="mt-4 block text-center text-xs text-muted-foreground hover:underline"
        >
          Privacy policy
        </a>
      </div>
      <Notification />
    </div>
  );
};
