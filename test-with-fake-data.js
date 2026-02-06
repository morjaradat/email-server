const http = require('http');

const API_KEY = 'my_secure_api_key_12345';
const PORT = 3005;
const EMAIL_TO = 'mohammadjaradat044@gmail.com';

const commonData = {
    app: {
        name: "Acme Corp",
        url: "https://acme.com",
        logo_url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTu8DGs15SG9WeqaunMgdfekvhYF4_VgmxxEA&s"
    },
    user: {
        name: "John Doe",
        email: EMAIL_TO,
    }
};

const templates = [
    {
        name: "affiliationCode",
        subject: "Your Affiliation Code",
        data: {
            ...commonData,
            requested_from: "Marketing Dept",
            requested_at: new Date().toLocaleString(),
            otp_code: "123456"
        }
    },
    {
        name: "emailLinkSignIn",
        subject: "Sign In to Acme Corp",
        data: {
            ...commonData,
            magic_link: "https://acme.com/auth/verify?token=abc",
            ttl_minutes: 10,
            href: "https://acme.com/auth/verify?token=abc",
            target: "_blank"
        }
    },
    {
        name: "emailLinkSignUp",
        subject: "Welcome! Complete your signup",
        data: {
            ...commonData,
            magic_link: "https://acme.com/auth/complete?token=xyz",
            ttl_minutes: 24 * 60, // 24 hours
            requested_from: "Web Browser",
            requested_at: new Date().toLocaleString()
        }
    },
    {
        name: "emailLinkVerifyEmail",
        subject: "Verify your email address",
        data: {
            ...commonData,
            link: "https://acme.com/verify-email?token=123",
            validity_minutes: 30
        }
    },
    {
        name: "invitation",
        subject: "You've been invited!",
        data: {
            ...commonData,
            inviter_name: "Sarah Smith",
            invitation: {
                role: "Admin",
                team_name: "Engineering"
            },
            action_url: "https://acme.com/invite/accept/123"
        }
    },
    {
        name: "organizationInvitation",
        subject: "Join our Organization",
        data: {
            ...commonData,
            inviter_name: "Bob Jones",
            org: { name: "Global Tech" },
            action_url: "https://acme.com/org/join/789"
        }
    },
    {
        name: "organizationInvitationAccepted",
        subject: "Invitation Accepted",
        data: {
            ...commonData,
            email_address: "newuser@example.com",
            org: { name: "Global Tech" }
        }
    },
    {
        name: "organizationJoined",
        subject: "New Member Joined",
        data: {
            ...commonData,
            org: { name: "Global Tech" }
        }
    },
    {
        name: "organizationMembershipRequested",
        subject: "Membership Requested",
        data: {
            ...commonData,
            requester_name: "Alice Wonderland",
            org: { name: "Global Tech" }
        }
    },
    {
        name: "passkeyAdded",
        subject: "Security Alert: Passkey Added",
        data: {
            ...commonData,
            passkey_name: "MacBook Pro TouchID",
            primary_email_address: EMAIL_TO,
            greeting_name: "John"
        }
    },
    {
        name: "passkeyRemoved",
        subject: "Security Alert: Passkey Removed",
        data: {
            ...commonData,
            passkey_name: "Old iPhone",
            greeting_name: "John"
        }
    },
    {
        name: "passwordChanged",
        subject: "Security Alert: Password Changed",
        data: {
            ...commonData
        }
    },
    {
        name: "passwordRemoved",
        subject: "Security Alert: Password Removed",
        data: {
            ...commonData
        }
    },
    {
        name: "passwordReset",
        subject: "Reset your password",
        data: {
            ...commonData,
            reset_password_link: "https://acme.com/reset-password?token=secret"
        }
    },
    {
        name: "primaryEmailAddressChanged",
        subject: "Primary Email Changed",
        data: {
            ...commonData,
            new_email_address: "john.new@example.com"
        }
    },
    {
        name: "signInFromNewClient",
        subject: "New Sign-in Detected",
        data: {
            ...commonData,
            sign_in_method: "Google Auth",
            device_type: "Macintosh",
            browser_name: "Chrome",
            operating_system: "macOS",
            location: "New York, USA",
            ip_address: "192.168.1.1",
            session_created_at: new Date().toLocaleString(),
            revoke_session_url: "https://acme.com/security/revoke",
            support_email: "support@acme.com"
        }
    },
    {
        name: "verificationCode",
        subject: "Your Verification Code",
        data: {
            ...commonData,
            code: "987654",
            verify_url: "https://acme.com/verify"
        }
    },
    {
        name: "waitlistConfirmation",
        subject: "You're on the waitlist!",
        data: {
            ...commonData
        }
    },
    {
        name: "waitlistInvitaion",
        subject: "You're off the waitlist!",
        data: {
            ...commonData,
            invitation: {
                link: "https://acme.com/signup"
            }
        }
    },
];

const makeRequest = (templateObj) => {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            to: EMAIL_TO,
            subject: templateObj.subject,
            template: templateObj.name,
            data: templateObj.data
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
            res.on('end', () => resolve({ template: templateObj.name, status: res.statusCode, body: data }));
        });

        req.on('error', (err) => reject({ template: templateObj.name, err }));
        req.write(body);
        req.end();
    });
};

const run = async () => {
    console.log(`Starting mock data tests for ${templates.length} templates...`);

    let successCount = 0;
    let failCount = 0;

    for (const t of templates) {
        console.log(`\nTesting: ${t.name} (Subj: ${t.subject})...`);
        try {
            const res = await makeRequest(t);
            if (res.status === 200) {
                console.log(`✅ Success`);
                successCount++;
            } else {
                console.log(`❌ Failed (Status ${res.status}):`);
                try {
                    const parsed = JSON.parse(res.body);
                    console.log(`   Error: ${parsed.error}`);
                    if (parsed.details) console.log(`   Details: ${parsed.details}`);
                } catch (e) {
                    console.log(`   Body: ${res.body}`);
                }
                failCount++;
            }
        } catch (error) {
            console.log(`❌ Request Error: ${error.err.message}`);
            failCount++;
        }

        await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n-------------------');
    console.log(`Test Complete.`);
    console.log(`Passed: ${successCount}`);
    console.log(`Failed: ${failCount}`);
};

run();
