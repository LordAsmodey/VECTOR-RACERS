"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useCallback, useMemo, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import styles from "@/app/(auth)/auth.module.css";
import { getFirstFieldError, register, toAuthApiError } from "@/lib/auth/api";
import { AUTH_VALIDATION_MESSAGES } from "@/lib/auth/constants";
import { registerSchema } from "@/lib/auth/schemas";

const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z
      .string({ error: AUTH_VALIDATION_MESSAGES.passwordRequired })
      .min(1, AUTH_VALIDATION_MESSAGES.passwordRequired),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

type RegisterFormInput = z.input<typeof registerFormSchema>;
type RegisterFormOutput = z.output<typeof registerFormSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const inFlightRef = useRef(false);

  const defaultValues = useMemo<RegisterFormInput>(
    () => ({
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      rememberMe: false,
    }),
    [],
  );

  const {
    register: registerField,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput, undefined, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    mode: "onBlur",
    defaultValues,
  });

  const onValidSubmit = useCallback(
    async (values: RegisterFormOutput) => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      try {
        await register({
          username: values.username,
          email: values.email,
          password: values.password,
          rememberMe: values.rememberMe,
        });
        router.replace("/lobby");
      } catch (error) {
        const authError = toAuthApiError(error);

        const usernameError = getFirstFieldError(authError.fieldErrors?.username);
        const emailError = getFirstFieldError(authError.fieldErrors?.email);
        const passwordError = getFirstFieldError(authError.fieldErrors?.password);

        if (usernameError) {
          setError("username", {
            type: "server",
            message: usernameError,
          });
        }

        if (emailError) {
          setError("email", {
            type: "server",
            message: emailError,
          });
        }

        if (passwordError) {
          setError("password", {
            type: "server",
            message: passwordError,
          });
        }

        if (!usernameError && !emailError && !passwordError) {
          setError("root", {
            type: "server",
            message: authError.message || "Unable to register right now. Please try again.",
          });
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [router, setError],
  );

  const onSubmit = handleSubmit(onValidSubmit);

  return (
    <main className={styles.authShell}>
      <article className={styles.authCard}>
        <h1 className={styles.title}>Create account</h1>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">
              Display name
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="NeonDriver"
              className={`${styles.input} ${errors.username ? styles.errorInput : ""}`}
              disabled={isSubmitting}
              {...registerField("username")}
            />
            <p className={styles.hint}>3-24 characters for your in-game identity.</p>
            {errors.username ? (
              <p className={styles.error} role="alert">
                {errors.username.message}
              </p>
            ) : null}
          </div>

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
              disabled={isSubmitting}
              {...registerField("email")}
            />
            {errors.email ? (
              <p className={styles.error} role="alert">
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
              autoComplete="new-password"
              placeholder="••••••••"
              className={`${styles.input} ${errors.password ? styles.errorInput : ""}`}
              disabled={isSubmitting}
              {...registerField("password")}
            />
            <p className={styles.hint}>At least 8 characters.</p>
            {errors.password ? (
              <p className={styles.error} role="alert">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className={`${styles.input} ${errors.confirmPassword ? styles.errorInput : ""}`}
              disabled={isSubmitting}
              {...registerField("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className={styles.error} role="alert">
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              disabled={isSubmitting}
              {...registerField("rememberMe")}
            />
            <span>Remember me on this device</span>
          </label>

          {errors.root?.message ? (
            <p className={styles.formError} role="alert">
              {errors.root.message}
            </p>
          ) : null}

          <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register"}
          </button>
        </form>

        <p className={styles.altLink}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </article>
    </main>
  );
}
