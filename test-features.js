require('dotenv').config();

const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 3005;
const EMAIL_TO = 'mohammadjaradat044@gmail.com';

// Helper for making requests using fetch
const makeRequest = async (path, method, body, headers = {}) => {
    const url = `http://localhost:${PORT}${path}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    };

    if (body) {
        options.body = body;
    }

    try {
        const res = await fetch(url, options);
        const contentType = res.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await res.json();
        } else {
            data = await res.text();
        }
        return { status: res.status, body: data };
    } catch (error) {
        console.error(`Request Failed: ${error.message}`);
        return { status: 500, body: error.message };
    }
};

const runTests = async () => {
    if (!API_KEY) {
        console.warn('Warning: API_KEY not found in .env');
    }

    console.log('--- TEST 1: Security Check (No API Key) ---');
    // Making request without API Key
    try {
        const res = await makeRequest('/api/send-email', 'POST', JSON.stringify({
            to: EMAIL_TO,
            subject: 'Should Fail',
            text: 'test'
        }));
        console.log(`Status: ${res.status} (Expected 401)`);
        console.log('Response:', JSON.stringify(res.body, null, 2));
    } catch (err) { console.error(err); }

    console.log('\n--- TEST 2: Send Email with Template (With API Key) ---');
    try {
        const res = await makeRequest('/api/send-email', 'POST', JSON.stringify({
            to: EMAIL_TO,
            subject: 'Welcome from Templates!',
            template: 'welcome',
            data: {
                name: 'Mohammad',
                actionUrl: 'https://example.com/login',
                year: '2026'
            }
        }), { 'x-api-key': API_KEY });
        console.log(`Status: ${res.status} (Expected 200)`);
        console.log('Response:', JSON.stringify(res.body, null, 2));
    } catch (err) { console.error(err); }

    console.log('\n--- TEST 3: Check Email Logs ---');
    try {
        const res = await makeRequest('/api/history', 'GET', null, { 'x-api-key': API_KEY });
        console.log(`Status: ${res.status} (Expected 200)`);
        console.log('History Length:', Array.isArray(res.body) ? res.body.length : 'N/A');
        if (Array.isArray(res.body) && res.body.length > 0) {
            console.log('Latest Log Entry:', res.body[res.body.length - 1]);
        }
    } catch (err) { console.error(err); }
};

runTests();
