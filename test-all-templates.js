const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEY = 'my_secure_api_key_12345';
const PORT = 3005;
const EMAIL_TO = 'mohammadjaradat044@gmail.com';

// Get list of all templates
const templatesDir = path.join(__dirname, 'data', 'email-templates');
const files = fs.readdirSync(templatesDir)
    .filter(f => f.endsWith('.js'))
    .map(f => f.replace('.js', ''));

const makeRequest = (template) => {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            to: EMAIL_TO,
            subject: `Testing Template: ${template}`,
            template: template,
            data: {
                app: { name: "Test App" },
                // Generic data that might satisfy some templates
                action_url: "https://example.com",
                name: "Test User",
                email: "test@example.com"
            }
        });

        const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/api/send-email',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ template, status: res.statusCode, body: data }));
        });

        req.on('error', (err) => reject({ template, err }));
        req.write(body);
        req.end();
    });
};

const run = async () => {
    console.log(`Found ${files.length} templates to test.`);
    console.log('Starting batch test... (This might take a while)');

    let successCount = 0;
    let failCount = 0;

    for (const template of files) {
        console.log(`\nTesting: ${template}...`);
        try {
            const res = await makeRequest(template);
            if (res.status === 200) {
                console.log(`✅ Success`);
                successCount++;
            } else {
                console.log(`❌ Failed (Status ${res.status}):`);
                // Parse body to show error
                try {
                    const parsed = JSON.parse(res.body);
                    console.log(`   Error: ${parsed.error}`);
                    if (parsed.details) console.log(`   Details: ${parsed.details}`);
                    // if (parsed.debug_source) console.log(`   Source Snippet: ${parsed.debug_source.substring(0, 100)}...`);
                } catch (e) {
                    console.log(`   Body: ${res.body}`);
                }
                failCount++;
            }
        } catch (error) {
            console.log(`❌ Request Error: ${error.err.message}`);
            failCount++;
        }

        // Small delay to be nice to the server/SMTP
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n-------------------');
    console.log(`Test Complete.`);
    console.log(`Passed: ${successCount}`);
    console.log(`Failed: ${failCount}`);
};

run();
