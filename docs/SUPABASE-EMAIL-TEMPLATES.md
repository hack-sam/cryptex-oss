# Supabase Email Templates — Cryptex branding

Copy-paste-ready HTML for the 5 Supabase auth email templates. Every
template:

- **Uses `{{ .SiteURL }}`** for every URL — no hardcoded domains. Set your
  Site URL once in Supabase → Authentication → URL Configuration and the
  templates pick it up automatically across dev, staging, and prod.
- **Renders the Cryptex brand mark** at the top via an `<img>` pointing
  at `{{ .SiteURL }}/cryptex-mark.svg` (we ship that file in
  `app/static/cryptex-mark.svg`). Email clients that block remote
  images get the inline-styled wordmark fallback rendered just below.
- **Surfaces the 6-digit `{{ .Token }}`** as the primary verification
  path. This is prefetch-resistant: corporate email scanners can't
  consume a code that isn't embedded in a URL.
- **Includes the clickable link** as a secondary fallback for users
  who prefer it.

## How to apply

1. Supabase dashboard → **Authentication** → **Email Templates**.
2. Open each template (Confirm signup, Magic link, Invite user, Reset
   password, Change email).
3. Replace the entire body with the HTML below.
4. Update the **Subject** above the body (suggestions per template).
5. **Save**.

The first time you redeploy with this commit, Cryptex will serve
`/cryptex-mark.svg` at the root of your domain — that's the path the
templates reference.

> **Variables Supabase substitutes for you:**
> - `{{ .Token }}` — 6-digit OTP code (the primary verification path)
> - `{{ .ConfirmationURL }}` — single-use click-through link (fallback)
> - `{{ .SiteURL }}` — your configured Site URL — used for logo + footer
> - `{{ .Email }}` — recipient email address

> **Why two paths (code + link)?** Corporate email security scanners
> (Outlook Safe Links, Gmail link-protection, antivirus) HEAD-request
> URLs to check for malware. That prefetch consumes Supabase's
> single-use `?token=…`, so when the human clicks they see "Email link
> is invalid or has expired". The 6-digit OTP code in `{{ .Token }}`
> survives prefetching because it isn't in a URL — scanners can't
> extract it from email body text. We surface BOTH so users on
> non-corporate mail can click through (lowest-friction), and users on
> hostile mail systems still have a working path (paste the code).

---

## 1. Confirm signup

Triggered by `supabase.auth.signUp({email, password})` when **Confirm
email** is on (default).

**Subject:**
```
Verify your Cryptex account
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Verify your Cryptex account</title>
</head>
<body style="margin:0; padding:0; background-color:#1a1410; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#f4ede4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1410; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#211912; border-radius:16px; overflow:hidden; border:1px solid rgba(244,237,228,0.06);">

          <!-- Banner with logo + wordmark + headline -->
          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #d97706 50%, #6b8294 100%); padding: 32px 32px 28px; text-align:center;">
              <img src="{{ .SiteURL }}/cryptex-mark.svg" width="56" height="56" alt="Cryptex" style="display:block; margin:0 auto 14px; border:0; outline:none;" />
              <div style="display:inline-block; padding: 5px 12px; background: rgba(0,0,0,0.18); border-radius: 999px; font-size:11px; letter-spacing: 0.18em; text-transform: uppercase; color:#fff7ed; font-weight:600;">
                CRYPTEX · text lab
              </div>
              <h1 style="margin: 16px 0 0 0; font-size: 26px; line-height: 1.2; color:#fff7ed; font-weight:700; letter-spacing:-0.02em;">
                Verify your account
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 14px 0; font-size:15px; line-height:1.6; color:#f4ede4;">
                Welcome to <strong style="color:#f97316;">Cryptex</strong>. Use the 6-digit code below on the sign-up screen to finish creating your account.
              </p>

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#a89880;">Verification code:</p>
              <p style="margin: 0 0 18px 0; padding: 16px; background-color:#1a1410; border:1px solid rgba(249,115,22,0.4); border-radius:10px; text-align:center; font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; font-size:30px; font-weight:700; letter-spacing:0.45em; color:#f97316;">
                {{ .Token }}
              </p>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 10px 0; font-size:12px; line-height:1.6; color:#a89880;">Or click this button:</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 14px 0;">
                <tr>
                  <td style="border-radius: 10px; background-color:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block; padding: 10px 22px; font-size:13px; font-weight:600; color:#f97316; text-decoration:none; border-radius:10px;">
                      Verify via link
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                <strong style="color:#a89880;">Didn't sign up?</strong> Ignore this email — your address won't be added.
              </p>
              <p style="margin: 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                Code and link expire in 1 hour.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a1410; padding: 14px 32px; border-top:1px solid rgba(244,237,228,0.06);">
              <p style="margin: 0; font-size:11px; line-height:1.5; color:#7d6d54; text-align:center;">
                <a href="{{ .SiteURL }}" style="color:#f97316; text-decoration:none;">Cryptex</a> · local-first, BYOK ·
                <a href="{{ .SiteURL }}/privacy/" style="color:#7d6d54; text-decoration:underline;">Privacy</a> ·
                <a href="{{ .SiteURL }}/terms/" style="color:#7d6d54; text-decoration:underline;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 2. Magic link (passwordless sign-in code)

Triggered by `supabase.auth.signInWithOtp({email})`. Cryptex's v1 UI
removed magic-link entry, but if you re-enable it later — or if other
flows (resends) trigger it — this template is what the user sees.

**Subject:**
```
Your Cryptex sign-in code
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Cryptex sign-in code</title>
</head>
<body style="margin:0; padding:0; background-color:#1a1410; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#f4ede4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1410; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#211912; border-radius:16px; overflow:hidden; border:1px solid rgba(244,237,228,0.06);">

          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #d97706 50%, #6b8294 100%); padding: 32px 32px 28px; text-align:center;">
              <img src="{{ .SiteURL }}/cryptex-mark.svg" width="56" height="56" alt="Cryptex" style="display:block; margin:0 auto 14px; border:0; outline:none;" />
              <div style="display:inline-block; padding: 5px 12px; background: rgba(0,0,0,0.18); border-radius: 999px; font-size:11px; letter-spacing: 0.18em; text-transform: uppercase; color:#fff7ed; font-weight:600;">
                CRYPTEX · sign-in
              </div>
              <h1 style="margin: 16px 0 0 0; font-size: 26px; line-height: 1.2; color:#fff7ed; font-weight:700; letter-spacing:-0.02em;">
                Sign-in code
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 14px 0; font-size:15px; line-height:1.6; color:#f4ede4;">
                Enter the 6-digit code below on the Cryptex sign-in screen. No password required.
              </p>

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#a89880;">Sign-in code:</p>
              <p style="margin: 0 0 18px 0; padding: 16px; background-color:#1a1410; border:1px solid rgba(249,115,22,0.4); border-radius:10px; text-align:center; font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; font-size:30px; font-weight:700; letter-spacing:0.45em; color:#f97316;">
                {{ .Token }}
              </p>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 10px 0; font-size:12px; line-height:1.6; color:#a89880;">Or click this button:</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 14px 0;">
                <tr>
                  <td style="border-radius: 10px; background-color:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block; padding: 10px 22px; font-size:13px; font-weight:600; color:#f97316; text-decoration:none; border-radius:10px;">
                      Sign in via link
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                <strong style="color:#a89880;">Didn't request this?</strong> Someone may have typed your email by mistake. You can safely ignore this — no one signed in.
              </p>
              <p style="margin: 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                Single-use · expires in 60 minutes.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a1410; padding: 14px 32px; border-top:1px solid rgba(244,237,228,0.06);">
              <p style="margin: 0; font-size:11px; line-height:1.5; color:#7d6d54; text-align:center;">
                <a href="{{ .SiteURL }}" style="color:#f97316; text-decoration:none;">Cryptex</a> ·
                <a href="{{ .SiteURL }}/privacy/" style="color:#7d6d54; text-decoration:underline;">Privacy</a> ·
                <a href="{{ .SiteURL }}/terms/" style="color:#7d6d54; text-decoration:underline;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 3. Reset password

Triggered by `supabase.auth.resetPasswordForEmail(email)` from the
"Forgot password?" flow on `/login`.

**Subject:**
```
Reset your Cryptex password
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset your Cryptex password</title>
</head>
<body style="margin:0; padding:0; background-color:#1a1410; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#f4ede4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1410; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#211912; border-radius:16px; overflow:hidden; border:1px solid rgba(244,237,228,0.06);">

          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #d97706 50%, #6b8294 100%); padding: 32px 32px 28px; text-align:center;">
              <img src="{{ .SiteURL }}/cryptex-mark.svg" width="56" height="56" alt="Cryptex" style="display:block; margin:0 auto 14px; border:0; outline:none;" />
              <div style="display:inline-block; padding: 5px 12px; background: rgba(0,0,0,0.18); border-radius: 999px; font-size:11px; letter-spacing: 0.18em; text-transform: uppercase; color:#fff7ed; font-weight:600;">
                CRYPTEX · password reset
              </div>
              <h1 style="margin: 16px 0 0 0; font-size: 26px; line-height: 1.2; color:#fff7ed; font-weight:700; letter-spacing:-0.02em;">
                Reset your password
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 14px 0; font-size:15px; line-height:1.6; color:#f4ede4;">
                Someone — hopefully you — asked to reset the password on your <strong style="color:#f97316;">Cryptex</strong> account. Enter the code below on the password-reset screen to set a new one.
              </p>

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#a89880;">Reset code:</p>
              <p style="margin: 0 0 18px 0; padding: 16px; background-color:#1a1410; border:1px solid rgba(249,115,22,0.4); border-radius:10px; text-align:center; font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; font-size:30px; font-weight:700; letter-spacing:0.45em; color:#f97316;">
                {{ .Token }}
              </p>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 10px 0; font-size:12px; line-height:1.6; color:#a89880;">Or click this button:</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 14px 0;">
                <tr>
                  <td style="border-radius: 10px; background-color:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block; padding: 10px 22px; font-size:13px; font-weight:600; color:#f97316; text-decoration:none; border-radius:10px;">
                      Reset via link
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                <strong style="color:#a89880;">Didn't request this?</strong> Your password is unchanged. You can ignore this email.
              </p>
              <p style="margin: 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                Single-use · expires in 60 minutes. Anyone with this code can change your password — keep it private.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a1410; padding: 14px 32px; border-top:1px solid rgba(244,237,228,0.06);">
              <p style="margin: 0; font-size:11px; line-height:1.5; color:#7d6d54; text-align:center;">
                <a href="{{ .SiteURL }}" style="color:#f97316; text-decoration:none;">Cryptex</a> ·
                <a href="{{ .SiteURL }}/privacy/" style="color:#7d6d54; text-decoration:underline;">Privacy</a> ·
                <a href="{{ .SiteURL }}/terms/" style="color:#7d6d54; text-decoration:underline;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 4. Invite user

Triggered by `supabase.auth.admin.inviteUserByEmail(email)` (admin /
service-role only — Cryptex doesn't ship an admin invite UI in v1, but
the template still renders if you send invites from Supabase dashboard
or via a server function).

**Subject:**
```
You've been invited to Cryptex
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You've been invited to Cryptex</title>
</head>
<body style="margin:0; padding:0; background-color:#1a1410; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#f4ede4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1410; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#211912; border-radius:16px; overflow:hidden; border:1px solid rgba(244,237,228,0.06);">

          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #d97706 50%, #6b8294 100%); padding: 32px 32px 28px; text-align:center;">
              <img src="{{ .SiteURL }}/cryptex-mark.svg" width="56" height="56" alt="Cryptex" style="display:block; margin:0 auto 14px; border:0; outline:none;" />
              <div style="display:inline-block; padding: 5px 12px; background: rgba(0,0,0,0.18); border-radius: 999px; font-size:11px; letter-spacing: 0.18em; text-transform: uppercase; color:#fff7ed; font-weight:600;">
                CRYPTEX · invite
              </div>
              <h1 style="margin: 16px 0 0 0; font-size: 26px; line-height: 1.2; color:#fff7ed; font-weight:700; letter-spacing:-0.02em;">
                You're invited
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 14px 0; font-size:15px; line-height:1.6; color:#f4ede4;">
                You've been invited to <strong style="color:#f97316;">Cryptex</strong> — an AI red-teamer's text lab. Use the code below on the sign-up screen to claim your account.
              </p>

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#a89880;">Invite code:</p>
              <p style="margin: 0 0 18px 0; padding: 16px; background-color:#1a1410; border:1px solid rgba(249,115,22,0.4); border-radius:10px; text-align:center; font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; font-size:30px; font-weight:700; letter-spacing:0.45em; color:#f97316;">
                {{ .Token }}
              </p>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 10px 0; font-size:12px; line-height:1.6; color:#a89880;">Or click this button:</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 14px 0;">
                <tr>
                  <td style="border-radius: 10px; background-color:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block; padding: 10px 22px; font-size:13px; font-weight:600; color:#f97316; text-decoration:none; border-radius:10px;">
                      Accept invitation
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                Not expecting this? Just ignore the email — no account is created until you enter the code.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a1410; padding: 14px 32px; border-top:1px solid rgba(244,237,228,0.06);">
              <p style="margin: 0; font-size:11px; line-height:1.5; color:#7d6d54; text-align:center;">
                <a href="{{ .SiteURL }}" style="color:#f97316; text-decoration:none;">Cryptex</a> ·
                <a href="{{ .SiteURL }}/privacy/" style="color:#7d6d54; text-decoration:underline;">Privacy</a> ·
                <a href="{{ .SiteURL }}/terms/" style="color:#7d6d54; text-decoration:underline;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 5. Change email address

Triggered by `supabase.auth.updateUser({email: newEmail})`. Cryptex
calls this from **Settings → Email address** after the user verifies
their current password. The code lands in the NEW email — entering it
on the email-change screen completes the swap.

**Subject:**
```
Confirm your new Cryptex email
```

**Body (HTML):**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Confirm your new Cryptex email</title>
</head>
<body style="margin:0; padding:0; background-color:#1a1410; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#f4ede4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1410; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#211912; border-radius:16px; overflow:hidden; border:1px solid rgba(244,237,228,0.06);">

          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #d97706 50%, #6b8294 100%); padding: 32px 32px 28px; text-align:center;">
              <img src="{{ .SiteURL }}/cryptex-mark.svg" width="56" height="56" alt="Cryptex" style="display:block; margin:0 auto 14px; border:0; outline:none;" />
              <div style="display:inline-block; padding: 5px 12px; background: rgba(0,0,0,0.18); border-radius: 999px; font-size:11px; letter-spacing: 0.18em; text-transform: uppercase; color:#fff7ed; font-weight:600;">
                CRYPTEX · email change
              </div>
              <h1 style="margin: 16px 0 0 0; font-size: 26px; line-height: 1.2; color:#fff7ed; font-weight:700; letter-spacing:-0.02em;">
                Confirm new email
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 14px 0; font-size:15px; line-height:1.6; color:#f4ede4;">
                You asked to change the email address on your <strong style="color:#f97316;">Cryptex</strong> account to this one. Enter the code below on the email-change confirmation screen to complete the swap.
              </p>

              <p style="margin: 0 0 6px 0; font-size:12px; line-height:1.6; color:#a89880;">Confirmation code:</p>
              <p style="margin: 0 0 18px 0; padding: 16px; background-color:#1a1410; border:1px solid rgba(249,115,22,0.4); border-radius:10px; text-align:center; font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; font-size:30px; font-weight:700; letter-spacing:0.45em; color:#f97316;">
                {{ .Token }}
              </p>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0 0 10px 0; font-size:12px; line-height:1.6; color:#a89880;">Or click this button:</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 14px 0;">
                <tr>
                  <td style="border-radius: 10px; background-color:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.4);">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block; padding: 10px 22px; font-size:13px; font-weight:600; color:#f97316; text-decoration:none; border-radius:10px;">
                      Confirm via link
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none; border-top:1px solid rgba(244,237,228,0.08); margin:22px 0;" />

              <p style="margin: 0; font-size:12px; line-height:1.6; color:#7d6d54;">
                <strong style="color:#a89880;">Didn't request this?</strong> The change won't take effect unless you confirm. If this is unexpected, sign in and review your account security.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a1410; padding: 14px 32px; border-top:1px solid rgba(244,237,228,0.06);">
              <p style="margin: 0; font-size:11px; line-height:1.5; color:#7d6d54; text-align:center;">
                <a href="{{ .SiteURL }}" style="color:#f97316; text-decoration:none;">Cryptex</a> ·
                <a href="{{ .SiteURL }}/privacy/" style="color:#7d6d54; text-decoration:underline;">Privacy</a> ·
                <a href="{{ .SiteURL }}/terms/" style="color:#7d6d54; text-decoration:underline;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## How to make emails come from YOUR domain

By default, Supabase sends auth emails through a shared mailer with a
`noreply@mail.app.supabase.io` (or similar) sender. Real users see
"Supabase" as the sender, not Cryptex. Fix: configure **custom SMTP**
on your own domain.

The full setup walkthrough is in
[`DEPLOY-OAUTH-AND-EMAIL.md`](DEPLOY-OAUTH-AND-EMAIL.md) Part A
(uses Resend's free tier, takes ~10 minutes). Once configured:

- The `From:` header becomes `Cryptex <noreply@your-domain.com>`.
- SPF + DKIM are signed by your domain → emails land in inbox, not spam.
- Delivery is instant (under 5 seconds).
- Rate-limit caps move out of the way (3-4 / hour shared → 100 / day
  on Resend's free tier, higher on paid tiers).

Set the `From:` line in **Supabase → Project Settings →
Authentication → SMTP Settings**:

```
Sender email:  noreply@your-domain.com
Sender name:   Cryptex
```

---

## Logo rendering — how it works in practice

The `<img src="{{ .SiteURL }}/cryptex-mark.svg" ...>` line at the top
of every banner pulls the SVG mark from your own domain. Render
behavior:

| Client | Renders the SVG? | Renders the wordmark below? |
|---|---|---|
| Apple Mail (macOS, iOS) | ✅ | ✅ |
| Gmail (web, light/dark) | ❌ blocks SVG | ✅ |
| Outlook 365 (web) | ❌ ignores SVG | ✅ |
| Outlook desktop | ❌ ignores SVG | ✅ |
| ProtonMail | ⚠️ blocks images by default; user can allow | ✅ |
| Yahoo Mail | ⚠️ inconsistent | ✅ |

The wordmark pill (`CRYPTEX · text lab`) is rendered with pure CSS in
the `<div>` — every client can render it, no exceptions. So even when
the SVG fails to load, the brand still shows.

If you want a PNG that renders everywhere (including Gmail), export
`app/static/cryptex-mark.svg` to a PNG (any size — 96×96 to 256×256
works fine) and host it at the same path with a `.png` extension:

```bash
# any of these one-liners works
inkscape --export-type=png --export-width=96 app/static/cryptex-mark.svg -o app/static/cryptex-mark.png
# or
convert -background none app/static/cryptex-mark.svg -resize 96x96 app/static/cryptex-mark.png
# or use any web-based SVG-to-PNG converter
```

Then change `cryptex-mark.svg` → `cryptex-mark.png` in each template's
`<img src=...>`. Gmail will render it.

---

## Email-client rendering compatibility

| Client | Card / gradient / OTP block | Logo `<img>` | Wordmark fallback |
|---|---|---|---|
| Gmail (web, dark) | ✅ | ❌ SVG blocked | ✅ |
| Gmail (web, light) | ✅ | ❌ SVG blocked | ✅ |
| Apple Mail (macOS / iOS) | ✅ | ✅ | ✅ |
| Outlook 365 (web) | ✅ slight gradient flatten | ❌ SVG ignored | ✅ |
| Outlook 2019 (desktop) | ⚠️ gradient → solid | ❌ SVG ignored | ✅ |
| ProtonMail | ✅ | ⚠️ user-blocked default | ✅ |
| Yahoo Mail | ✅ | ⚠️ inconsistent | ✅ |

If you need ironclad cross-Outlook gradient fidelity, replace
`background: linear-gradient(...)` on the banner cell with a solid
`#f97316`. The SVG line + wordmark + OTP block all degrade gracefully
on their own.
