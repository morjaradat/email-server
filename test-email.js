require('dotenv').config();

const port = process.env.PORT || 3005;
const apiKey = process.env.API_KEY;

const data = {
    to: 'mohammadjaradat044@gmail.com',
    subject: 'Test Email from Node Server',
    text: 'It works! This is a test email sent from your local Node.js server.',
    html: '<h1>It works!</h1><p>This is a test email sent from your local Node.js server.</p>'
};

// Validating config
if (!apiKey) {
    console.warn('Warning: API_KEY not found in .env, requests might fail if auth is enabled.');
}

const sendEmail = async () => {
    console.log(`Sending test request to http://localhost:${port}/api/send-email...`);

    try {
        const response = await fetch(`http://localhost:${port}/api/send-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        console.log(`Status Code: ${response.status}`);
        console.log('Response:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
};

sendEmail();
