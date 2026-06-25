import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  auth:
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
});

export function isEmailServiceConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getFromAddress(): string {
  const from = process.env.SMTP_FROM;
  if (!process.env.SMTP_HOST || !from) {
    throw new Error('Email service is not configured. Set SMTP_HOST and SMTP_FROM.');
  }
  return from;
}

function getAppLoginUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function emailLayout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; max-width: 520px;">
      <h2 style="margin: 0 0 12px; color: #1a1a2e;">EduAIGames</h2>
      <h3 style="margin: 0 0 16px; font-size: 18px;">${title}</h3>
      ${bodyHtml}
      <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
        This is an automated message from EduAIGames. Please do not reply to this email.
      </p>
    </div>
  `;
}

export async function sendOtpEmail(
  email: string,
  subject: string,
  otp: string,
  expiresMinutes: number
): Promise<void> {
  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject,
    text: `Your OTP code is: ${otp}. It expires in ${expiresMinutes} minutes.`,
    html: emailLayout(
      'Verification code',
      `
        <p>Your OTP code is:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 12px 0;">${otp}</div>
        <p>This code expires in ${expiresMinutes} minutes.</p>
      `
    ),
  });
}

export async function sendTestEmail(email: string): Promise<void> {
  await transporter.sendMail({
    from: getFromAddress(),
    to: email,
    subject: 'EduAIGames Email Service Test',
    text: 'Your EduAIGames email service is configured correctly.',
    html: emailLayout(
      'Email service test',
      '<p>Your EduAIGames SMTP setup is working correctly.</p>'
    ),
  });
}

export async function sendRegistrationApprovedEmail(input: {
  to: string;
  fullName: string;
  role: string;
}): Promise<void> {
  const loginUrl = getAppLoginUrl();
  const roleLabel = input.role === 'Instructor' ? 'Instructor' : 'Student';
  await transporter.sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: 'EduAIGames — Your account has been approved',
    text: `Hi ${input.fullName},\n\nYour ${roleLabel} registration on EduAIGames has been approved. You can now log in at ${loginUrl}\n\nWelcome aboard!`,
    html: emailLayout(
      'Your account has been approved',
      `
        <p>Hi <strong>${input.fullName}</strong>,</p>
        <p>Your <strong>${roleLabel}</strong> registration on EduAIGames has been approved by an administrator.</p>
        <p>You can now log in and start using the platform:</p>
        <p style="margin: 20px 0;">
          <a href="${loginUrl}" style="background: #ff7a1a; color: #241100; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Log in to EduAIGames
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280;">Or visit: <a href="${loginUrl}">${loginUrl}</a></p>
      `
    ),
  });
}

export async function sendRegistrationRejectedEmail(input: {
  to: string;
  fullName: string;
}): Promise<void> {
  await transporter.sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: 'EduAIGames — Registration update',
    text: `Hi ${input.fullName},\n\nYour EduAIGames registration was not approved at this time. If you believe this is a mistake, please contact your administrator.\n\nYou may submit a new registration request if you wish to try again.`,
    html: emailLayout(
      'Registration not approved',
      `
        <p>Hi <strong>${input.fullName}</strong>,</p>
        <p>Your EduAIGames registration was <strong>not approved</strong> at this time.</p>
        <p>If you believe this is a mistake, please contact your administrator for assistance.</p>
        <p>You may submit a new registration request if you would like to try again.</p>
      `
    ),
  });
}

export type RegistrationEmailResult = {
  emailSent: boolean;
  emailError?: string;
};

export async function trySendRegistrationApprovedEmail(input: {
  to: string;
  fullName: string;
  role: string;
}): Promise<RegistrationEmailResult> {
  if (!isEmailServiceConfigured()) {
    return { emailSent: false, emailError: 'Email service is not configured' };
  }
  try {
    await sendRegistrationApprovedEmail(input);
    return { emailSent: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    console.error('Approval email error:', message);
    return { emailSent: false, emailError: message };
  }
}

export async function trySendRegistrationRejectedEmail(input: {
  to: string;
  fullName: string;
}): Promise<RegistrationEmailResult> {
  if (!isEmailServiceConfigured()) {
    return { emailSent: false, emailError: 'Email service is not configured' };
  }
  try {
    await sendRegistrationRejectedEmail(input);
    return { emailSent: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    console.error('Rejection email error:', message);
    return { emailSent: false, emailError: message };
  }
}
