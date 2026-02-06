# Node.js Email Server (Resend-like)

A powerful Node.js email server using Express and Nodemailer, featuring templating, logging, and API security.

## Features

-   **Send Emails**: Simple REST API command.
-   **HTML Templates**: Use Handlebars templates (e.g., Welcome emails) instead of raw HTML.
-   **Security**: Secured via `x-api-key` header.
-   **Logging**: Tracks every sent email in `data/history.json`.
-   **Validation**: Robust input validation.

## Setup

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Configuration:**
    Create a `.env` file in the root directory (copy `.env.example` as a reference):

    ```env
    PORT=3000
    API_KEY=my_secure_api_key_12345
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=465
    SMTP_SECURE=true
    SMTP_USER=your_email@gmail.com
    SMTP_PASS=your_app_password
    EMAIL_FROM="Your Name <your_email@gmail.com>"
    ```
    > **Note for Gmail:** You must use an **App Password** for `SMTP_PASS`, not your login password. [Generate one here](https://myaccount.google.com/apppasswords).

3.  **Start the server:**
    ```bash
    npm start
    ```

## API Documentation

### 1. Send Email (Raw)

**POST** `/api/send-email`
**Headers:**
- `Content-Type: application/json`
- `x-api-key: <your_api_key>`

```json
{
  "to": "recipient@example.com",
  "subject": "Hello",
  "text": "Plain text content",
  "html": "<p>HTML content</p>" // Optional if text is provided
}
```

### 2. Send Email (Template)

**POST** `/api/send-email`

Use a template (e.g., `templates/welcome.html`) by specifying the `template` field.

```json
{
  "to": "recipient@example.com",
  "subject": "Welcome!",
  "template": "welcome",
  "data": {
    "name": "John Doe",
    "actionUrl": "https://example.com"
  }
}
```

### 3. Get Email History

**GET** `/api/history`
**Headers:** `x-api-key: <your_api_key>`

Returns a list of all emails sent by the server.

```json
[
  {
    "id": "<message_id>",
    "timestamp": "2023-10-27T10:00:00.000Z",
    "to": "recipient@example.com",
    "template": "welcome",
    "status": "sent"
  }
]
```

## Adding Templates

Create a new `.html` file in the `templates/` folder (e.g., `reset-password.html`).
Use `{{variableName}}` to insert dynamic data passed in the `data` object of the API request.

## Testing

Run the included test script to verify all features:
```bash
node test-features.js
```
# email-server
