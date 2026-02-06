# API Usage Guide

## Prerequisites

- **Server URL**: `http://localhost:3005` (or your deployed URL)
- **API Key**: Found in your `.env` file (e.g., `my_secure_api_key_12345`)

## Authentication

All requests must include the `x-api-key` header.

```http
x-api-key: your_api_key_here
```

## TypeScript Interfaces for Template Data

Below are the TypeScript interfaces for the `data` object required by each template.

```typescript
// Base Interface
interface EmailRequest {
  to: string;
  subject: string;
  template: string;
  data: TemplateData;
}

type TemplateData = 
  | WelcomeData
  | InvitationData
  | PasswordResetData
  | VerificationCodeData
  | SignInFromNewClientData
  // ... and others
  | Record<string, any>; // Fallback

// --- Template Specific Types ---

interface WelcomeData {
  actionUrl: string;
  name: string;
  year: string;
}

interface InvitationData {
  action_url: string;
  app: { name: string };
  invitation: { expires_in_days: number };
  inviter_name?: string; // Optional context
}

interface PasswordResetData {
  otp_code: string;
  requested_at: string;
  requested_from: string;
}

interface VerificationCodeData {
  otp_code: string;
  requested_at: string;
  requested_from: string;
}

interface SignInFromNewClientData {
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

interface EmailLinkSignInData {
  app: { name: string };
  magic_link: string;
  requested_at: string;
  requested_from: string;
  ttl_minutes: number;
}
// Note: 'escapeURIs' is a helper function, not a data field.
```

## API Endpoints

### 1. Send Email

**Endpoint**: `POST /api/send-email`

#### Example: Javascript (Fetch)

```javascript
const sendEmail = async () => {
  const response = await fetch('http://localhost:3005/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'my_secure_api_key_12345'
    },
    body: JSON.stringify({
      to: 'user@example.com',
      subject: 'Welcome!',
      template: 'welcome',
      data: {
        name: 'Jane Doe',
        actionUrl: 'https://myapp.com/dashboard',
        year: '2024'
      }
    })
  });

  const result = await response.json();
  console.log(result);
};
```

#### Example: Python (Requests)

```python
import requests

url = "http://localhost:3005/api/send-email"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "my_secure_api_key_12345"
}
payload = {
    "to": "user@example.com",
    "subject": "Verify Email",
    "template": "verificationCode",
    "data": {
        "otp_code": "123456",
        "requested_at": "Today",
        "requested_from": "Chrome on Mac"
    }
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

#### Example: cURL

```bash
curl -X POST http://localhost:3005/api/send-email \
  -H "Content-Type: application/json" \
  -H "x-api-key: my_secure_api_key_12345" \
  -d '{
    "to": "user@example.com",
    "subject": "Reset Password",
    "template": "passwordReset",
    "data": {
      "otp_code": "999999",
      "requested_at": "10:00 AM",
      "requested_from": "Safari"
    }
  }'
```

### 2. Get Email History

**Endpoint**: `GET /api/history`

```bash
curl -H "x-api-key: my_secure_api_key_12345" http://localhost:3005/api/history
```
