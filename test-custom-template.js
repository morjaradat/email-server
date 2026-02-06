const http = require('http');

const API_KEY = 'my_secure_api_key_12345'; // Matches .env
const PORT = 3005;
const EMAIL_TO = 'mohammadjaradat044@gmail.com';

const makeRequest = (body) => {
    return new Promise((resolve, reject) => {
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
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
};

const run = async () => {
    console.log('Testing Custom Template (invitation)...');

    // We intentionally OMIT 'inviter_name' to test the fallback "missingdata"
    // 'app' object is also missing details
    const payload = JSON.stringify({
        to: EMAIL_TO,
        subject: 'Custom Template Test',
        template: 'invitation',
        data: {
            // inviter_name is MISSING -> should show "missingdata"
            app: { name: "My App" },
            invitation: { expires_in_days: 7 },
            action_url: "https://example.com/join"
        }
    });

    try {
        const res = await makeRequest(payload);
        console.log(`Status: ${res.status}`);
        console.log('Response:', res.body);

        if (res.status === 200) {
            console.log('Success! Check your email to see if "missingdata" appears where "inviter_name" should be.');
        }
    } catch (err) {
        console.error('Request Failed:', err);
    }
};

run();
