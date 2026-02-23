import { createTransport } from "nodemailer";
import Handlebars from "handlebars";
import * as path from "path";
import * as fs from "fs";
import { EmailRequestSchema, validateTemplateRequirements, type EmailRequest } from "./lib/schemas";

const PORT = Number(Bun.env.PORT) || 3005;
const API_KEY = Bun.env.API_KEY;

const args = Bun.argv;
const isDebug = args.includes("-env:debug=true") || process.env.DEBUG === "true";

const logger = {
    info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
    error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
    debug: (message: string, ...args: any[]) => {
        if (isDebug) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }
}

if (isDebug) {
    logger.debug("Debug mode enabled");
    logger.debug("SMTP_HOST: ", Bun.env.SMTP_HOST);
    logger.debug("SMTP_PORT: ", Bun.env.SMTP_PORT);
    logger.debug("SMTP_SECURE: ", Bun.env.SMTP_SECURE);
    logger.debug("SMTP_USER: ", Bun.env.SMTP_USER);
    // Don't log full password even in debug, just existence
    logger.debug("SMTP_PASS: ", Bun.env.SMTP_PASS ? "****" : "missing");
}

// Bun doesn't expose global types automatically in all envs without tsconfig, 
// but we'll assume basic web types are available.

// --- Config & Helpers ---

const transporter = createTransport({
    // @ts-ignore
    host: Bun.env.SMTP_HOST,
    port: Number(Bun.env.SMTP_PORT) || 465,
    secure: Bun.env.SMTP_SECURE === "true",
    address: "0.0.0.0",
    auth: {
        user: Bun.env.SMTP_USER,
        pass: Bun.env.SMTP_PASS,
    },
    // Add a timeout so it doesn't hang your whole server
    connectionTimeout: 10000,
});
// @ts-ignore
transporter.verify((error) => {
    if (error) logger.error("SMTP Connection Error:", error);
    else logger.info("Server is ready to take our messages");
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

logger.info(`Bun Server running on port ${PORT}`);

Bun.serve({
    port: PORT,
    async fetch(req: Request) {
        const url = new URL(req.url);
        // Request logging
        logger.debug(`${req.method} ${url.pathname}`);

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
            if (await file.exists()) {
                logger.debug(`Serving static file: ${filePath}`);
                return new Response(file);
            }
            logger.debug(`Static file not found: ${filePath}`);
            return new Response("Not Found", { status: 404 });
        }

        // API Validation
        if (url.pathname.startsWith("/api/")) {
            const reqApiKey = req.headers.get("x-api-key");

            // Allow bypassing auth if API_KEY is not set (dev mode), but if set, enforce it.
            if (API_KEY) {
                if (API_KEY !== reqApiKey) {
                    logger.error(`Unauthorized access attempt to ${url.pathname}`);
                    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
                        status: 401,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
            }
        }

        // Router
        if (req.method === "GET" && url.pathname === "/health") {
            logger.debug("Health check requested");
            return new Response(JSON.stringify({ status: "ok from bun", timestamp: new Date().toISOString() }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (req.method === "GET" && url.pathname === "/api/history") {
            logger.debug("History requested");
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

        if (req.method === "POST" && url.pathname === "/api/run-shell") {
            try {
                const body = await req.json();
                const scriptArgs = body.args || ["--verbose"];
                const scriptPath = path.join(import.meta.dir, "scripts", "process.sh");

                logger.info(`Spawning shell process: bash ${scriptPath} ${scriptArgs.join(' ')}`);

                // Spawn the shell script
                const proc = Bun.spawn(["bash", scriptPath, ...scriptArgs], {
                    stdin: "pipe",   // We will write to stdin
                    stdout: "pipe",  // We will capture stdout
                    stderr: "pipe",  // We will capture stderr
                    env: {
                        ...process.env,
                        DEBUG_MODE: "true" // Pass env variables
                    }
                });

                // Write payload to stdin
                if (body.payload) {
                    const inputStr = JSON.stringify(body.payload);
                    proc.stdin.write(inputStr);
                }
                proc.stdin.end(); // Close stdin

                // Read output
                const stdout = await new Response(proc.stdout).text();
                const stderr = await new Response(proc.stderr).text();
                const exitCode = await proc.exited;

                logger.info(`Shell process finished with code ${exitCode}`);
                if (stderr) logger.error(`Shell stderr: ${stderr}`);

                return new Response(JSON.stringify({
                    success: exitCode === 0,
                    stdout,
                    stderr,
                    exitCode,
                    type: "bash"
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (error: any) {
                logger.error("Shell execution failed:", error);
                return new Response(JSON.stringify({
                    success: false,
                    error: error.message
                }), { status: 500, headers: corsHeaders });
            }
        }

        if (req.method === "POST" && url.pathname === "/api/run-script") {
            try {
                const body = await req.json();
                const scriptArgs = body.args || ["json-mode"];
                const scriptPath = path.join(import.meta.dir, "scripts", "worker.ts");

                logger.info(`Spawning child process: bun ${scriptPath} ${scriptArgs.join(' ')}`);

                // Spawn the child process
                const proc = Bun.spawn(["bun", scriptPath, ...scriptArgs], {
                    stdin: "pipe",   // We will write to stdin
                    stdout: "pipe",  // We will read from stdout
                    stderr: "pipe",  // We will read from stderr
                });

                // Write data to the subprocess stdin
                if (body.payload) {
                    const inputStr = JSON.stringify(body.payload);
                    proc.stdin.write(inputStr);
                }
                proc.stdin.end(); // Close stdin to signal EOF

                // Read output
                const stdout = await new Response(proc.stdout).text();
                const stderr = await new Response(proc.stderr).text();
                const exitCode = await proc.exited;

                logger.info(`Child process finished with code ${exitCode}`);
                if (stderr) logger.error(`Child stderr: ${stderr}`);

                return new Response(JSON.stringify({
                    success: exitCode === 0,
                    stdout,
                    stderr,
                    exitCode,
                    command: `bun ${scriptPath} ${scriptArgs.join(' ')}`
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (error: any) {
                logger.error("Script execution failed:", error);
                return new Response(JSON.stringify({
                    success: false,
                    error: error.message
                }), { status: 500, headers: corsHeaders });
            }
        }

        if (req.method === "GET" && url.pathname === "/api/test-email") {
            const logs: string[] = [];
            const addLog = (msg: string) => {
                const timestamp = new Date().toISOString();
                const logMsg = `[${timestamp}] ${msg}`;
                logger.info(logMsg); // Also log to server console
                logs.push(logMsg);
            };

            addLog("Starting email test sequence...");

            try {
                addLog("Step 1: Validating environment variables...");
                const requiredEnv = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
                // @ts-ignore
                const missing = requiredEnv.filter(key => !Bun.env[key]);
                if (missing.length > 0) {
                    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
                }
                addLog("Environment variables available.");

                addLog("Step 2: Verifying SMTP connection...");
                await transporter.verify();
                addLog("SMTP connection verified successfully.");

                const testEmailOptions = {
                    from: Bun.env.EMAIL_FROM || "noreply@example.com",
                    to: "morjaradat66@gmail.com",
                    subject: "Test Email from Server",
                    text: "This is a test email to verify the server configuration.",
                    html: "<h1>Test Email</h1><p>This is a <strong>test email</strong> to verify the server configuration.</p>"
                };

                addLog(`Step 3: Preparing to send email to ${testEmailOptions.to}...`);
                const info = await transporter.sendMail(testEmailOptions);
                addLog(`Step 4: Email sent successfully. Message ID: ${info.messageId}`);

                return new Response(JSON.stringify({
                    success: true,
                    logs: logs,
                    result: info
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (error: any) {
                addLog(`ERROR: ${error.message}`);
                logger.error("Test Email Failed:", error);
                return new Response(JSON.stringify({
                    success: false,
                    error: error.message,
                    logs: logs
                }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        if (req.method === "POST" && url.pathname === "/api/send-email") {
            let body: any;
            try {
                body = await req.json();
            } catch (e) {
                logger.error("Invalid JSON body in send-email request");
                return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
            }

            // ZOD VALIDATION
            const zodResult = EmailRequestSchema.safeParse(body);
            if (!zodResult.success) {
                logger.error("Validation failed", zodResult.error.flatten().fieldErrors);
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
                logger.debug(`Processing template: ${template}`);
                // strict validation
                const reqPath = path.join(import.meta.dir, "data", "template-requirements.json");
                const reqFile = Bun.file(reqPath);
                if (await reqFile.exists()) {
                    try {
                        const requirements = await reqFile.json();
                        // Validate requirement keys
                        const missingKeys = validateTemplateRequirements(template, data, requirements);

                        if (missingKeys.length > 0) {
                            const errorMsg = `Missing required data for template '${template}': ${missingKeys.join(', ')}`;
                            logger.error(errorMsg);
                            return new Response(JSON.stringify({
                                success: false,
                                error: errorMsg,
                                missingKeys
                            }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                        }
                    } catch (e) { logger.error("Req load error", e) }
                }

                // Load Template
                const standardPath = path.join(import.meta.dir, "templates", `${template}.html`);
                const customPath = path.join(import.meta.dir, "data", "email-templates", `${template}.js`);

                let templateSource = "";

                if (fs.existsSync(standardPath)) {
                    logger.debug(`Loading standard template: ${standardPath}`);
                    templateSource = fs.readFileSync(standardPath, "utf8");
                } else if (fs.existsSync(customPath)) {
                    logger.debug(`Loading custom template: ${customPath}`);
                    try {
                        // Type-safe dynamic require is tricky, we treat as any
                        delete require.cache[require.resolve(customPath)];
                        const mod = require(customPath);
                        if (mod && mod.html) templateSource = mod.html;
                        else throw new Error("Missing html prop");
                    } catch (e) {
                        logger.error(`Failed to load custom template: ${customPath}`, e);
                        return new Response(JSON.stringify({ error: "Failed to load custom template" }), { status: 500, headers: corsHeaders });
                    }
                } else {
                    logger.error(`Template not found: ${template}`);
                    return new Response(JSON.stringify({ success: false, error: `Template '${template}' not found` }), { status: 400, headers: corsHeaders });
                }

                try {
                    logger.debug("Compiling Handlebars template...");
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
                    logger.debug("Handlebars template compiled successfully.");
                } catch (err: any) {
                    logger.error("Template rendering failed", err);
                    return new Response(JSON.stringify({ success: false, error: "Template rendering failed", details: err.message }), { status: 500, headers: corsHeaders });
                }
            }

            try {
                logger.debug(`Attempting to send email to ${to} with subject "${subject}"`);
                const info = await transporter.sendMail({
                    from: Bun.env.EMAIL_FROM,
                    to,
                    subject,
                    text,
                    html: finalHtml
                });
                logger.info("Message sent: %s for %s", info.messageId, to);
                await logEmail({ messageId: info.messageId, to, template: template || null });

                return new Response(JSON.stringify({
                    success: true,
                    message: "Email sent successfully",
                    messageId: info.messageId
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

            } catch (error: any) {
                logger.error("Send Mail Error:", error);
                return new Response(JSON.stringify({ success: false, error: "Failed to send email", details: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        return new Response("Not Found", { status: 404 });
    },
});

async function checkEmail() {
    try {
        await transporter.verify();
        logger.info("Mail server is ready");
    } catch (err) {
        logger.error("Mail server failed but web server is still running:", err);
    }
}

checkEmail();