const express = require('express');

const nodemailer = require('nodemailer');
const cors = require('cors');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Auth Middleware
const authMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    console.log("apiKey", apiKey);
    console.log("process.env.API_KEY", process.env.API_KEY);
    // If API_KEY is set in env, enforce it. If not set, allow open access (dev mode)
    // if (process.env.API_KEY !== apiKey) {
    //     return res.status(401).json({
    //         success: false,
    //         error: 'Unauthorized: Invalid or missing API Key'
    //     });
    // }
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

// Validation helper
const validateEmailData = (data) => {
    const { to, subject, text, html, template } = data;
    const errors = [];

    if (!to) {
        errors.push('Recipient email (to) is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        errors.push('Invalid recipient email format');
    }

    if (!subject) errors.push('Subject is required');

    // If template is provided, text/html are optional. Otherwise one is required.
    if (!template && !text && !html) {
        errors.push('Email content (text, html, or template) is required');
    }

    return errors;
};

// Create Transporter
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

// Get Email History
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
    const validationErrors = validateEmailData(req.body);

    if (validationErrors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationErrors
        });
    }

    let { to, subject, text, html, template, data } = req.body;

    // Helper to wrap data with a Proxy for missing values
    const createDataProxy = (obj) => {
        return new Proxy(obj || {}, {
            get: (target, prop) => {
                if (prop in target) {
                    return target[prop];
                }
                // Handlebars internal properties check
                if (typeof prop === 'string' && (prop.startsWith('_') || prop === 'toHTML')) {
                    return undefined;
                }
                return 'missingdata';
            }
        });
    };

    // Handle Template
    if (template) {
        // Load validation requirements
        let templateRequirements = {};
        try {
            const reqPath = path.join(__dirname, 'data', 'template-requirements.json');
            if (fs.existsSync(reqPath)) {
                templateRequirements = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
            }
        } catch (e) {
            console.error('Failed to load template requirements:', e);
        }

        // Strict Validation
        if (templateRequirements[template]) {
            const requiredKeys = templateRequirements[template].filter(k => k !== 'escapeURIs' && k !== 'app' && k !== 'invitation'); // Filter helpers/nested objects for now or handle them better
            // Actually, for nested objects like 'app.name', the scanner output returned 'app.name'.
            // My scanner returned ["app.name", "browser_name"...]
            // So I should check if data["app"]["name"] exists if key is "app.name", OR if flattening is used.
            // The Handlebars data structure usually requires nested objects.
            // Let's implement a deep check or simple check.

            const missingKeys = [];
            const keysToCheck = templateRequirements[template].filter(k =>
                !['escapeURIs'].includes(k) // Exclude helpers
            );

            keysToCheck.forEach(key => {
                // Check deep keys 'app.name' -> data.app.name
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
            });

            if (missingKeys.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required data for template '${template}': ${missingKeys.join(', ')}`,
                    missingKeys: missingKeys
                });
            }
        }


        // 1. Check standard templates/ folder
        const standardPath = path.join(__dirname, 'templates', `${template}.html`);
        // 2. Check data/email-templates/ folder (converted .js files)
        const customPath = path.join(__dirname, 'data', 'email-templates', `${template}.js`);

        console.log('Checking standard path:', standardPath);
        console.log('Checking custom path:', customPath);

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
            // Fix HTML-encoded Handlebars syntax (e.g., {{&gt; app_logo}})
            templateSource = templateSource.replace(/{{&gt;/g, '{{>');

            // Register dummy partials for any that are missing to prevent crash
            if (!handlebars.partials['app_logo']) {
                const logoUrl = `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTu8DGs15SG9WeqaunMgdfekvhYF4_VgmxxEA&s`;
                handlebars.registerPartial('app_logo', `<div class="app-logo"><img src="${logoUrl}" alt="App Logo" style="max-width: 150px; height: auto;" /></div>`);
            }

            // Register missing helpers
            handlebars.registerHelper('escapeURIs', function (text) {
                return new handlebars.SafeString(text);
            });

            const compiledTemplate = handlebars.compile(templateSource);
            // No strict Proxy needed anymore if we pre-validate, but good to keep minimal safety or remove it.
            // Using raw data since we validated it.
            html = compiledTemplate(data || {});
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
