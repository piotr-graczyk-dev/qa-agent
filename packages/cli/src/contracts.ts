import { z } from "zod";

export const qaStatusSchema = z.enum(["passed", "failed", "blocked", "unsure"]);

export const prContextSchema = z
  .object({
    provider: z.literal("github"),
    repository: z
      .string()
      .trim()
      .regex(/^[^/\s]+\/[^/\s]+$/, "repository must use owner/name format"),
    pullRequestNumber: z
      .number()
      .int("pullRequestNumber must be an integer")
      .positive("pullRequestNumber must be positive"),
    title: z.string(),
    body: z.string(),
    labels: z.array(z.string().trim().min(1, "labels cannot be empty")),
    branchRefs: z.object({
      base: z.string().trim().min(1, "branchRefs.base is required"),
      head: z.string().trim().min(1, "branchRefs.head is required"),
    }),
    changedFilePaths: z.array(
      z.string().trim().min(1, "changedFilePaths cannot include empty paths"),
    ),
  })
  .strict();

export const qaReportIssueSchema = z
  .object({
    title: z.string().trim().min(1, "issue title is required"),
    description: z.string().trim().min(1, "issue description is required"),
    severity: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict();

export const qaReportScreenshotSchema = z
  .object({
    path: z.string().trim().min(1, "screenshot path is required"),
    caption: z.string().trim().min(1, "screenshot caption is required").optional(),
  })
  .strict();

export const qaReportSchema = z
  .object({
    status: qaStatusSchema,
    summary: z.string().trim().min(1, "summary is required"),
    checksPerformed: z.array(
      z.string().trim().min(1, "checksPerformed cannot include empty checks"),
    ),
    issuesFound: z.array(qaReportIssueSchema),
    screenshots: z.array(qaReportScreenshotSchema),
    diagnostics: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export type QaStatus = z.infer<typeof qaStatusSchema>;
export type PrContext = z.infer<typeof prContextSchema>;
export type PrContextInput = z.input<typeof prContextSchema>;
export type QaReport = z.infer<typeof qaReportSchema>;
export type QaReportInput = z.input<typeof qaReportSchema>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostics: string[] };

export function validatePrContext(input: unknown): ValidationResult<PrContext> {
  const result = prContextSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, diagnostics: formatZodIssues(result.error.issues) };
  }

  return { ok: true, value: result.data };
}

export function validateQaReport(input: unknown): ValidationResult<QaReport> {
  const result = qaReportSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, diagnostics: formatZodIssues(result.error.issues) };
  }

  return { ok: true, value: result.data };
}

export function qaReportOrBlocked(
  input: unknown,
  diagnostics: string[] = [],
): QaReport {
  const result = qaReportSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const validationDiagnostics =
    input === undefined || input === null
      ? ["QA report was not provided."]
      : formatZodIssues(result.error.issues);

  return {
    status: "blocked",
    summary: "QA Agent could not produce a valid QA Report.",
    checksPerformed: [],
    issuesFound: [],
    screenshots: [],
    diagnostics: [...sanitizeDiagnostics(diagnostics), ...validationDiagnostics],
  };
}

function sanitizeDiagnostics(diagnostics: string[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.trim()).filter(Boolean);
}

function formatZodIssues(issues: z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "report";
    return `${path}: ${issue.message}`;
  });
}
