const express = require('express');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005; // Changed to match server.ts default

// --- Email Request Schema (Zod) ---
const EmailRequestSchema = z.object({
    to: z.string().email({ message: "Invalid recipient email format" }),
    subject: z.string().min(1, { message: "Subject is required" }),
    text: z.string().optional(),
    html: z.string().optional(),
    template: z.string().optional(),
    logo_url: z.string().url().optional(),
    data: z.record(z.string(), z.any()).optional(),
}).refine((data) => data.template || data.text || data.html, {
    message: "Email content (text, html, or template) is required",
    path: ["template"],
});

// --- Template Validation Helper ---
const validateTemplateRequirements = (templateName, data, requirements) => {
    const requiredKeys = requirements[templateName];
    if (!requiredKeys) return [];

    // Filter out known ignored keys (helpers/globals)
    const keysToCheck = requiredKeys.filter((k) => !['escapeURIs', 'app', 'invitation'].includes(k));

    const missingKeys = [];

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
};

// Middleware
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// CORS Middleware (Matching Bun server manual headers)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Auth Middleware
const authMiddleware = (req, res, next) => {
    // Also check standard headers, Bun server checks `req.headers.get("x-api-key")`
    const apiKey = req.headers['x-api-key'];
    const API_KEY = process.env.API_KEY;

    if (API_KEY) {
        if (API_KEY !== apiKey) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }
    }
    next();
};

// Logging Utility
const logEmail = (emailData) => {
    const logFile = path.join(__dirname, 'data', 'history.json');
    const logEntry = {
        id: emailData.messageId,
        timestamp: new Date().toISOString(),
        to: emailData.to,
        template: emailData.template || 'raw',
        status: 'sent'
    };

    let history = [];
    if (fs.existsSync(logFile)) {
        try {
            const data = fs.readFileSync(logFile, 'utf8');
            history = JSON.parse(data);
        } catch (err) {
            console.error('Error reading history file:', err);
        }
    }

    history.push(logEntry);

    try {
        fs.writeFileSync(logFile, JSON.stringify(history, null, 2));
    } catch (err) {
        console.error('Error writing to history file:', err);
    }
};

// Create Transporter (Kept exact per request)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Verify connection configuration
transporter.verify(function (error, success) {
    if (error) {
        console.error('SMTP Connection Error:', error);
    } else {
        console.log('Server is ready to take our messages');
    }
});

// API Routes

// Get Email History matches server.ts logic (auth required)
app.get('/api/history', authMiddleware, (req, res) => {
    const logFile = path.join(__dirname, 'data', 'history.json');
    if (!fs.existsSync(logFile)) {
        return res.json([]);
    }
    try {
        const data = fs.readFileSync(logFile, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read history' });
    }
});

// Send Email
app.post('/api/send-email', authMiddleware, async (req, res) => {
    // 1. Zod Validation
    const result = EmailRequestSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: result.error.flatten().fieldErrors
        });
    }

    const { to, subject, text, html: reqHtml, template, data, logo_url } = result.data;
    let html = reqHtml;

    // Handle Template
    if (template) {
        // Load validation requirements
        let templateRequirements = {};
        try {
            const reqPath = path.join(__dirname, 'data', 'template-requirements.json');
            if (fs.existsSync(reqPath)) {
                templateRequirements = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
            }

            // Validate requirement keys
            const missingKeys = validateTemplateRequirements(template, data, templateRequirements);

            if (missingKeys.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required data for template '${template}': ${missingKeys.join(', ')}`,
                    missingKeys: missingKeys
                });
            }

        } catch (e) {
            console.error('Failed to load template requirements:', e);
        }

        // 1. Check standard templates/ folder
        const standardPath = path.join(__dirname, 'templates', `${template}.html`);
        // 2. Check data/email-templates/ folder (converted .js files)
        const customPath = path.join(__dirname, 'data', 'email-templates', `${template}.js`);

        let templateSource = '';

        if (fs.existsSync(standardPath)) {
            try {
                templateSource = fs.readFileSync(standardPath, 'utf8');
            } catch (err) {
                return res.status(500).json({ error: 'Failed to read standard template', details: err.message });
            }
        } else if (fs.existsSync(customPath)) {
            try {
                // Clear cache to allow hot reloading of templates if they change
                delete require.cache[require.resolve(customPath)];
                const templateModule = require(customPath);

                // Expecting structure { design: ..., html: "..." }
                if (templateModule && templateModule.html) {
                    templateSource = templateModule.html;
                } else {
                    return res.status(500).json({ error: 'Invalid custom template structure: missing html property' });
                }
            } catch (err) {
                return res.status(500).json({ error: 'Failed to load custom template', details: err.message });
            }
        } else {
            return res.status(400).json({
                success: false,
                error: `Template '${template}' not found`
            });
        }


        try {
            // Fix HTML-encoded Handlebars syntax
            templateSource = templateSource.replace(/{{&gt;/g, '{{>');

            const fallbackLogo = `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTu8DGs15SG9WeqaunMgdfekvhYF4_VgmxxEA&s`;
            const logoToUse = logo_url || fallbackLogo;
            const logoHtml = `<div class="app-logo"><img src="${logoToUse}" alt="App Logo" style="max-width: 150px; height: auto;" /></div>`;

            const logoPartial = handlebars.compile(logoHtml);

            // Register unique helpers if not already there, or overwrite.
            handlebars.registerHelper('escapeURIs', function (text) {
                return new handlebars.SafeString(text);
            });

            const compiledTemplate = handlebars.compile(templateSource);
            html = compiledTemplate(data || {}, {
                partials: {
                    app_logo: logoPartial
                }
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'Template rendering failed',
                details: err.message
            });
        }
    }

    const mailOptions = {
        from: process.env.EMAIL_FROM, // sender address
        to: to, // list of receivers
        subject: subject, // Subject line
        text: text, // plain text body
        html: html, // html body
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);

        // Log the email
        logEmail({ messageId: info.messageId, to, template: template || null });

        res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            messageId: info.messageId
        });
    } catch (error) {
        console.error('Send Mail Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send email',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Debug: Keep alive
setInterval(() => { }, 10000);
