export const AUTH_FIELD_LIMITS = {
  emailMaxLength: 254,
  passwordMinLength: 8,
  passwordMaxLength: 128,
  usernameMinLength: 3,
  usernameMaxLength: 24,
} as const;

export const AUTH_VALIDATION_MESSAGES = {
  emailRequired: "Email is required",
  emailInvalid: "Please enter a valid email address",
  passwordRequired: "Password is required",
  passwordTooShort: `Password must be at least ${AUTH_FIELD_LIMITS.passwordMinLength} characters`,
  passwordTooLong: `Password must be at most ${AUTH_FIELD_LIMITS.passwordMaxLength} characters`,
  usernameRequired: "Username is required",
  usernameTooShort: `Username must be at least ${AUTH_FIELD_LIMITS.usernameMinLength} characters`,
  usernameTooLong: `Username must be at most ${AUTH_FIELD_LIMITS.usernameMaxLength} characters`,
} as const;

export const AUTH_API_ROUTES = {
  login: "/auth/login",
  register: "/auth/register",
  me: "/auth/me",
} as const;
