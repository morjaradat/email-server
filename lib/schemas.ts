import { z } from "zod";

// --- Email Request Schema ---

export const EmailRequestSchema = z.object({
    to: z.string().email({ message: "Invalid recipient email format" }),
    subject: z.string().min(1, { message: "Subject is required" }),
    text: z.string().optional(),
    html: z.string().optional(),
    template: z.string().optional(),
    logo_url: z.string().url().optional(),
    data: z.record(z.string(), z.any()).optional(),
}).refine((data) => data.template || data.text || data.html, {
    message: "Email content (text, html, or template) is required",
    path: ["template"], // Attach error to template field (or generally)
});

export type EmailRequest = z.infer<typeof EmailRequestSchema>;

// --- Template Validation Helper ---

// We will load requirements at runtime, but defining a helper type here is useful.
export function validateTemplateRequirements(templateName: string, data: any, requirements: Record<string, string[]>): string[] {
    const requiredKeys = requirements[templateName];
    if (!requiredKeys) return [];

    // Filter out known ignored keys (helpers/globals)
    // This matches the logic existing in server.js
    const keysToCheck = requiredKeys.filter((k) => !['escapeURIs', 'app', 'invitation'].includes(k));

    const missingKeys: string[] = [];

    for (const key of keysToCheck) {
        const parts = key.split('.');
        let current = data || {};
        let found = true;

        for (const part of parts) {
            if (current[part] === undefined || current[part] === null) {
                found = false;
                break;
            }
            current = current[part];
        }

        if (!found) missingKeys.push(key);
    }

    return missingKeys;
}
