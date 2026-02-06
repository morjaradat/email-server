
// Base Interface
export interface EmailRequest {
    to: string;
    subject: string;
    template: string;
    data: TemplateData;
}

export type TemplateData =
    | WelcomeData
    | InvitationData
    | PasswordResetData
    | VerificationCodeData
    | SignInFromNewClientData
    | EmailLinkSignInData
    // ... and others
    | Record<string, any>; // Fallback

// --- Template Specific Types ---

export interface WelcomeData {
    actionUrl: string;
    name: string;
    year: string;
}

export interface InvitationData {
    action_url: string;
    app: { name: string };
    invitation: { expires_in_days: number };
    inviter_name?: string; // Optional context
}

export interface PasswordResetData {
    otp_code: string;
    requested_at: string;
    requested_from: string;
}

export interface VerificationCodeData {
    otp_code: string;
    requested_at: string;
    requested_from: string;
}

export interface SignInFromNewClientData {
    app: { name: string };
    browser_name: string;
    device_type: string;
    ip_address: string;
    location: string;
    operating_system: string;
    revoke_session_url: string;
    session_created_at: string;
    sign_in_method: string;
    support_email: string;
}

export interface EmailLinkSignInData {
    app: { name: string };
    magic_link: string;
    requested_at: string;
    requested_from: string;
    ttl_minutes: number;
}

export class EmailClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl: string = "http://localhost:3005") {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    emails = {
        send: async (request: EmailRequest) => {

            try {
                const response = await fetch(`${this.baseUrl}/api/send-email`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": this.apiKey,
                    },
                    body: JSON.stringify(request),
                });
                console.log("🚀 ~ EmailClient ~ this.apiKey:", this.apiKey)
                console.log("🚀 ~ EmailClient ~ response:", response.status)

                const data = await response.json();
                console.log("🚀 ~ EmailClient ~ data:", data)

                if (!response.ok) {
                    return { error: data, data: null };
                }

                return { data, error: null };
            } catch (error) {
                return { error, data: null };
            }
        },
    };
}
