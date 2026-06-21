export const REDACTED = "[REDACTED]";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const SECRET_LIKE_PATTERNS: RegExp[] = [
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["']?[^"',\s}]+/gi,
  /\b(?:sk|pk|rk|gh[pousr])_[A-Za-z0-9_=-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
];

export type SecretRedactor = (value: string) => string;

export function createSecretRedactor(
  secretValues: Iterable<string | undefined | null>,
): SecretRedactor {
  const secrets = [...secretValues]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .sort((left, right) => right.length - left.length);

  return (value) => redactSecretLikeText(value, secrets);
}

export function redactSecretLikeText(
  value: string,
  secretValues: Iterable<string> = [],
): string {
  let redacted = value;

  for (const secret of secretValues) {
    redacted = redacted.replaceAll(secret, REDACTED);
  }

  for (const pattern of SECRET_LIKE_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      const separator = match.match(/[:=]/)?.[0];
      if (!separator) {
        return REDACTED;
      }

      const [prefix] = match.split(separator, 1);
      return `${prefix}${separator}${REDACTED}`;
    });
  }

  return redacted;
}

export function redactJsonValue<T>(value: T, redactor: SecretRedactor): T {
  if (typeof value === "string") {
    return redactor(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, redactor)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactJsonValue(entry, redactor),
      ]),
    ) as T;
  }

  return value;
}

export function defaultSecretRedactor(value: string): string {
  return redactSecretLikeText(value);
}
