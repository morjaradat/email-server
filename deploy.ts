import { spawn } from "bun";

// --- CONFIGURATION ---
// Add these to your .env file on the Pi!
const NEXT_API_URL = process.env.NEXT_API_URL || "https://your-site.com/api/webhooks/tunnel-update";
const PI_SECRET = process.env.PI_SECRET || "change-this-to-a-long-password";

async function sendUrlToNextJs(tunnelUrl: string) {
    console.log(`🚀 Sending URL to Next.js: ${tunnelUrl}`);

    try {
        const response = await fetch(NEXT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: tunnelUrl,
                secret: PI_SECRET
            }),
        });

        if (response.ok) console.log("✅ Next.js received the update!");
        else console.error(`❌ Next.js rejected it: ${response.status}`);
    } catch (err) {
        console.error("❌ Failed to contact Next.js:", err);
    }
}

async function main() {
    // 1. Start Email Server
    console.log("📧 Starting Email Server...");
    spawn(["npx", "tsx", "server.ts"], { stdio: ["ignore", "inherit", "inherit"] });

    // 2. Start Tunnel
    console.log("☁️ Starting Tunnel...");
    const tunnel = spawn(["cloudflared", "tunnel", "--url", "http://localhost:3005"], {
        stderr: "pipe",
    });

    const reader = tunnel.stderr.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // 3. Scan for URL
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;
        const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);

        if (match) {
            await sendUrlToNextJs(match[0]);
            break; // Task done, let the script sleep while processes run
        }
    }
}

main();