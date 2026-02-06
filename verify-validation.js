const https = require('http'); // Http, not https since local

function sendRequest(data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3005,
            path: '/api/send-email',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'my_secure_api_key_12345' // Assuming default from README/env
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body: JSON.parse(body) });
            });
        });

        req.on('error', (e) => reject(e));
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTests() {
    console.log('Test 1: Missing Data (should fail)');
    try {
        const res1 = await sendRequest({
            to: 'test@example.com',
            subject: 'Test',
            template: 'welcome',
            data: { name: 'Only Name' } // Missing actionUrl, year
        });
        console.log('Status:', res1.status);
        console.log('Body:', JSON.stringify(res1.body, null, 2));
    } catch (e) { console.error(e); }

    console.log('\nTest 2: Valid Data (should succeed)');
    try {
        const res2 = await sendRequest({
            to: 'test@example.com',
            subject: 'Test',
            template: 'welcome',
            data: {
                name: 'Valid Name',
                actionUrl: 'http://example.com',
                year: '2024'
            }
        });
        console.log('Status:', res2.status);
        console.log('Body:', JSON.stringify(res2.body, null, 2));
    } catch (e) {
        // If SMTP not configured it might fail with 500, but validation passes
        console.error('Connection error (expected if SMTP invalid):', e.message);
    }
}

// Give server a moment to start
setTimeout(runTests, 2000);
