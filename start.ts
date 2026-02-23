import { $, spawn } from "bun";

// --- CONFIGURATION ---
// These will be read from the .env file
const NEXT_API_URL = process.env.NEXT_API_URL;
const PI_SECRET = process.env.PI_SECRET;
const PORT = process.env.PORT || "3005";

async function sendUrlToNextJs(tunnelUrl: string) {
    if (!NEXT_API_URL) {
        console.log("⚠️ NEXT_API_URL not set in .env. Skipping webhook to Next.js.");
        return;
    }
    console.log(`🚀 Sending new Tunnel URL to Next.js: ${tunnelUrl}`);

    try {
        const response = await fetch(NEXT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: tunnelUrl,
                secret: PI_SECRET
            }),
        });

        if (response.ok) {
            console.log("✅ Next.js app successfully received and saved the new URL!");
        } else {
            console.error(`❌ Next.js app rejected the request with status: ${response.status}`);
            const text = await response.text();
            console.error(`Response: ${text}`);
        }
    } catch (err) {
        console.error("❌ Failed to contact the Next.js app:", err);
    }
}

async function main() {
    console.log("📦 Checking and installing dependencies with Bun...");
    // 1. Run bun install. Bun shell makes this super easy!
    await $`bun install`;
    console.log("✅ Dependencies are ready.");

    // 2. Start the Email Server in the background
    console.log("📧 Starting the Email Server...");
    const server = spawn(["bun", "run", "server.ts"], {
        stdio: ["ignore", "inherit", "inherit"]
    });

    // 3. Start the Cloudflare Tunnel
    console.log(`☁️  Starting Cloudflare Tunnel on port ${PORT}...`);
    const tunnel = spawn(["cloudflared", "tunnel", "--url", `http://localhost:${PORT}`], {
        stdout: "ignore",
        stderr: "pipe", // We need to read stderr because cloudflared prints the URL here
    });

    const reader = tunnel.stderr.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // 4. Scan Cloudflare's logs for the exposed URL
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;

        // Print the tunnel's output so we can see what's happening
        process.stdout.write(chunk);

        // Regex to find the generated URL like https://xyz.trycloudflare.com
        const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);

        if (match) {
            const url = match[0];
            console.log(`\n🔗 Found tunnel URL: ${url}\n`);

            // 5. Send the POST request to the Next.js app
            await sendUrlToNextJs(url);

            // Stop scanning once we found the URL, but let the processes keep running
            break;
        }
    }

    console.log("\n✅ Setup complete! Server and tunnel are now running in the background.");
}

main().catch(console.error);
