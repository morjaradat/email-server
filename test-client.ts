import { EmailClient } from "./lib/email-client";

// The key from .env (raw string)
const RAW_API_KEY = "c3RyZWV0dG9kYXlkb25lYXJteXNsb3dseWNoZWNrcmVhbGJlZ3VuZWFzeWhhdHN0ZW0=";
// Note: added '=' padding if missing, but user provided without it. 
// User provided: "c3RyZWV0dG9kYXlkb25lYXJteXNsb3dseWNoZWNrcmVhbGJlZ3VuZWFzeWhhdHN0ZW0"
// I'll stick to exactly what the user provided in the prompt snippet if possible, 
// BUT I must check what is actually in .env. 
// Previous turn showed: API_KEY=c3RyZWV0... (ending in 0) which is 69 chars? Base64 usually multiple of 4.
// Let's use the one from the prompt.

const TEST_KEY = "c3RyZWV0dG9kYXlkb25lYXJteXNsb3dseWNoZWNrcmVhbGJlZ3VuZWFzeWhhdHN0ZW0";

console.log(`Testing with Key: ${TEST_KEY}`);

async function testKey(key: string, name: string) {
    const client = new EmailClient(key);
    console.log(`\n--- Testing ${name} ---`);
    const result = await client.emails.send({
        to: "mohammadjaradat044@gmail.com",
        subject: "Test Email from Client",
        template: "welcome",
        data: {
            name: "Test User",
            actionUrl: "https://example.com/login",
            year: "2024",
        },
    });

    if (result.data) {
        console.log(`[SUCCESS] Email sent successfully with ${name}:`, result.data);
    } else {
        console.error(`[FAILURE] Failed to send email with ${name}:`, result.error);
    }
}

async function main() {
    await testKey(TEST_KEY, "Raw Key");
}

main().catch(console.error);
