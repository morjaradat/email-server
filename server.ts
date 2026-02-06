import { createTransport } from "nodemailer";
import Handlebars from "handlebars";
import * as path from "path";
import * as fs from "fs";
import { EmailRequestSchema, validateTemplateRequirements, type EmailRequest } from "./lib/schemas";

const PORT = Number(Bun.env.PORT) || 3005;
const API_KEY = Bun.env.API_KEY;

// Bun doesn't expose global types automatically in all envs without tsconfig, 
// but we'll assume basic web types are available.

// --- Config & Helpers ---

const transporter = createTransport({
    host: Bun.env.SMTP_HOST,
    port: Number(Bun.env.SMTP_PORT) || 465,
    secure: Bun.env.SMTP_SECURE === "true",
    auth: {
        user: Bun.env.SMTP_USER,
        pass: Bun.env.SMTP_PASS,
    },
});
// @ts-ignore
transporter.verify((error) => {
    if (error) console.error("SMTP Connection Error:", error);
    else console.log("Server is ready to take our messages");
});

interface LogEntry {
    id: string;
    timestamp: string;
    to: string;
    template: string;
    status: string;
}

const logEmail = async (emailData: { messageId: string, to: string, template?: string | null }) => {
    const logFile = path.join(import.meta.dir, "data", "history.json");
    const logEntry: LogEntry = {
        id: emailData.messageId,
        timestamp: new Date().toISOString(),
        to: emailData.to,
        template: emailData.template || "raw",
        status: "sent",
    };

    let history: LogEntry[] = [];
    const file = Bun.file(logFile);
    if (await file.exists()) {
        try {
            history = await file.json();
        } catch (err) {
            console.error("Error reading history file:", err);
        }
    }
    history.push(logEntry);
    await Bun.write(logFile, JSON.stringify(history, null, 2));
};

// --- Server ---

console.log(`Bun Server running on port ${PORT}`);

Bun.serve({
    port: PORT,
    async fetch(req: Request) {
        const url = new URL(req.url);

        // CORS Headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key",
        };

        if (req.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // Static Files (/public)
        if (url.pathname.startsWith("/public/")) {
            const filePath = path.join(import.meta.dir, url.pathname);
            const file = Bun.file(filePath);
            if (await file.exists()) return new Response(file);
            return new Response("Not Found", { status: 404 });
        }

        // API Validation
        if (url.pathname.startsWith("/api/")) {
            const reqApiKey = req.headers.get("x-api-key");

            // Allow bypassing auth if API_KEY is not set (dev mode), but if set, enforce it.
            if (API_KEY) {
                if (API_KEY !== reqApiKey) {
                    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
                        status: 401,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
            }
        }

        // Router
        if (req.method === "GET" && url.pathname === "/health") {
            return new Response(JSON.stringify({ status: "ok" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (req.method === "GET" && url.pathname === "/api/history") {
            const logFile = Bun.file(path.join(import.meta.dir, "data", "history.json"));
            if (await logFile.exists()) {
                return new Response(await logFile.text(), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            return new Response("[]", {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (req.method === "POST" && url.pathname === "/api/send-email") {
            let body: any;
            try {
                body = await req.json();
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
            }

            // ZOD VALIDATION
            const zodResult = EmailRequestSchema.safeParse(body);
            if (!zodResult.success) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Validation failed",
                    details: zodResult.error.flatten().fieldErrors
                }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { to, subject, text, html: reqHtml, template, data, logo_url } = zodResult.data;
            let finalHtml = reqHtml;

            // Template Logic
            if (template) {
                // strict validation
                const reqPath = path.join(import.meta.dir, "data", "template-requirements.json");
                const reqFile = Bun.file(reqPath);
                if (await reqFile.exists()) {
                    try {
                        const requirements = await reqFile.json();
                        // Validate requirement keys
                        const missingKeys = validateTemplateRequirements(template, data, requirements);

                        if (missingKeys.length > 0) {
                            return new Response(JSON.stringify({
                                success: false,
                                error: `Missing required data for template '${template}': ${missingKeys.join(', ')}`,
                                missingKeys
                            }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                        }
                    } catch (e) { console.error("Req load error", e) }
                }

                // Load Template
                const standardPath = path.join(import.meta.dir, "templates", `${template}.html`);
                const customPath = path.join(import.meta.dir, "data", "email-templates", `${template}.js`);

                let templateSource = "";

                if (fs.existsSync(standardPath)) {
                    templateSource = fs.readFileSync(standardPath, "utf8");
                } else if (fs.existsSync(customPath)) {
                    try {
                        // Type-safe dynamic require is tricky, we treat as any
                        delete require.cache[require.resolve(customPath)];
                        const mod = require(customPath);
                        if (mod && mod.html) templateSource = mod.html;
                        else throw new Error("Missing html prop");
                    } catch (e) {
                        return new Response(JSON.stringify({ error: "Failed to load custom template" }), { status: 500, headers: corsHeaders });
                    }
                } else {
                    return new Response(JSON.stringify({ success: false, error: `Template '${template}' not found` }), { status: 400, headers: corsHeaders });
                }

                try {
                    templateSource = templateSource.replace(/{{&gt;/g, '{{>');

                    const fallbackLogo = `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTu8DGs15SG9WeqaunMgdfekvhYF4_VgmxxEA&s`;
                    const logoToUse = logo_url || fallbackLogo;
                    const logoHtml = `<div class="app-logo"><img src="${logoToUse}" alt="App Logo" style="max-width: 150px; height: auto;" /></div>`;
                    const logoPartial = Handlebars.compile(logoHtml);

                    Handlebars.registerHelper('escapeURIs', (text) => new Handlebars.SafeString(text));

                    const compiled = Handlebars.compile(templateSource);
                    finalHtml = compiled(data || {}, {
                        partials: {
                            app_logo: logoPartial
                        }
                    });
                } catch (err: any) {
                    return new Response(JSON.stringify({ success: false, error: "Template rendering failed", details: err.message }), { status: 500, headers: corsHeaders });
                }
            }

            try {
                const info = await transporter.sendMail({
                    from: Bun.env.EMAIL_FROM,
                    to,
                    subject,
                    text,
                    html: finalHtml
                });
                console.log("Message sent: %s", info.messageId);
                await logEmail({ messageId: info.messageId, to, template: template || null });

                return new Response(JSON.stringify({
                    success: true,
                    message: "Email sent successfully",
                    messageId: info.messageId
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

            } catch (error: any) {
                console.error("Send Mail Error:", error);
                return new Response(JSON.stringify({ success: false, error: "Failed to send email", details: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        return new Response("Not Found", { status: 404 });
    },
});
