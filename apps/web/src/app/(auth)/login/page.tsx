"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useCallback, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { getFirstFieldError, login, toAuthApiError } from "@/lib/auth/api";
import { loginSchema } from "@/lib/auth/schemas";
import type { LoginRequest } from "@/lib/auth/types";

import styles from "../auth.module.css";

type LoginFormInput = z.input<typeof loginSchema>;
type LoginFormOutput = z.output<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const inFlightRef = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, undefined, LoginFormOutput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
    mode: "onBlur",
  });

  const onSubmit = useCallback(
    async (values: LoginFormOutput) => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      try {
        const payload: LoginRequest = {
          email: values.email,
          password: values.password,
          rememberMe: values.rememberMe,
        };
        await login(payload);
        router.replace("/lobby");
      } catch (error) {
        const authError = toAuthApiError(error);

        const emailError = getFirstFieldError(authError.fieldErrors?.email);
        if (emailError) {
          setError("email", { type: "server", message: emailError });
        }

        const passwordError = getFirstFieldError(authError.fieldErrors?.password);
        if (passwordError) {
          setError("password", { type: "server", message: passwordError });
        }

        if (!emailError && !passwordError) {
          setError("root", {
            type: "server",
            message: authError.message || "Unable to sign in. Please try again.",
          });
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [router, setError],
  );
  const emailDescribedBy = errors.email?.message
    ? "login-email-hint login-email-error"
    : "login-email-hint";
  const passwordDescribedBy = errors.password?.message
    ? "login-password-hint login-password-error"
    : "login-password-hint";

  return (
    <main className={styles.authShell}>
      <article className={styles.authCard}>
        <h1 className={styles.title}>Sign in</h1>
        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={`${styles.input} ${errors.email ? styles.errorInput : ""}`}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={emailDescribedBy}
              disabled={isSubmitting}
              {...register("email")}
            />
            <p id="login-email-hint" className={styles.hint}>
              Use the email you registered with.
            </p>
            {errors.email?.message ? (
              <p id="login-email-error" className={styles.error} role="alert">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className={`${styles.input} ${errors.password ? styles.errorInput : ""}`}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={passwordDescribedBy}
              disabled={isSubmitting}
              {...register("password")}
            />
            <p id="login-password-hint" className={styles.hint}>
              Minimum 8 characters.
            </p>
            {errors.password?.message ? (
              <p id="login-password-error" className={styles.error} role="alert">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              disabled={isSubmitting}
              {...register("rememberMe")}
            />
            <span>Remember me on this device</span>
          </label>

          {errors.root?.message ? (
            <p className={styles.formError} role="alert">
              {errors.root.message}
            </p>
          ) : null}

          <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className={styles.altLink}>
          No account? <Link href="/register">Create one</Link>
        </p>
      </article>
    </main>
  );
}
