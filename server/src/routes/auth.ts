import express from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db.ts';
import { getUserByEmail, createUser, updateUserPasswordByEmail } from '../queries.ts';
import {
  isEmailServiceConfigured,
  sendOtpEmail,
  sendTestEmail,
} from '../emailService.ts';
import { getPlatformSetting, insertAdminNotification } from '../adminServices.ts';
import { getUserInstitutionContext } from '../institutionServices.ts';
import { recordUserLogin } from '../loginEvents.ts';
import type { AccountStatus } from '../userAccountStatus.ts';

const router = express.Router();

const OTP_EXP_MINUTES = 10;

const PENDING_LOGIN_MESSAGE =
  'Your account is waiting for admin approval. You will be able to log in once an administrator approves your registration.';
const REJECTED_LOGIN_MESSAGE =
  'Your registration was not approved. Please contact your administrator if you believe this is a mistake.';
const SUSPENDED_LOGIN_MESSAGE =
  'Your account has been suspended. Please contact your administrator for assistance.';

async function assertRegistrationOpen(res: Response): Promise<boolean> {
  const open = await getPlatformSetting<boolean>('registration_open', true);
  if (!open) {
    res.status(403).json({ error: 'Registration is currently closed. Please contact your administrator.' });
    return false;
  }
  return true;
}

async function resolveRegistrationStatus(): Promise<AccountStatus> {
  const requireApproval = await getPlatformSetting<boolean>('require_admin_approval', true);
  return requireApproval ? 'pending' : 'approved';
}

async function notifyAdminIfPending(user: {
  username: string;
  email: string;
  role: string;
  account_status?: string;
}): Promise<void> {
  if (user.account_status !== 'pending') return;
  try {
    await insertAdminNotification({
      type: 'pending_registration',
      title: 'New registration request',
      body: `${user.username} (${user.role}) requested access — ${user.email}`,
      metadata: { email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Admin notification insert failed:', err);
  }
}

function registrationEmailError(existing: { account_status?: string } | undefined): string | null {
  if (!existing) return null;
  if (existing.account_status === 'pending') {
    return 'A registration for this email is already awaiting admin approval.';
  }
  return 'Email already registered';
}

const getOtpHash = (otp: string) =>
  crypto.createHash('sha256').update(otp).digest('hex');

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

async function createOtpRecord(
  email: string,
  purpose: 'register' | 'password-reset',
  otp: string,
  payload: Record<string, unknown> | null
) {
  const expiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);
  await pool.query(
    `INSERT INTO email_otp_codes (email, purpose, otp_hash, payload, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [email, purpose, getOtpHash(otp), payload ? JSON.stringify(payload) : null, expiresAt]
  );
}

async function consumeLatestOtp(email: string, purpose: 'register' | 'password-reset', otp: string) {
  const result = await pool.query(
    `SELECT id, otp_hash, payload, expires_at
     FROM email_otp_codes
     WHERE email = $1 AND purpose = $2 AND consumed = FALSE
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, purpose]
  );

  const row = (result.rows as any[])[0];
  if (!row) {
    throw new Error('OTP not found. Please request a new one.');
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('OTP expired. Please request a new one.');
  }

  if (row.otp_hash !== getOtpHash(otp)) {
    throw new Error('Invalid OTP code.');
  }

  await pool.query('UPDATE email_otp_codes SET consumed = TRUE WHERE id = $1', [row.id]);
  return row.payload ?? null;
}

router.post('/email-service-test', async (req: Request, res: Response) => {
  try {
    if (!isEmailServiceConfigured()) {
      res.status(503).json({
        error: 'Email service not configured. Please set SMTP_* values in server/.env and restart backend.',
      });
      return;
    }
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    await sendTestEmail(normalizedEmail);
    res.json({ message: `Test email sent to ${normalizedEmail}` });
  } catch (error: any) {
    console.error('Email service test error:', error);
    res.status(500).json({ error: error.message || 'Email service test failed' });
  }
});

// Request registration OTP
router.post('/register/request-otp', async (req: Request, res: Response) => {
  try {
    if (!(await assertRegistrationOpen(res))) return;
    if (!isEmailServiceConfigured()) {
      res.status(503).json({
        error: 'Email verification service is not configured. Please set SMTP_* values in server/.env.',
      });
      return;
    }
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }
    if (!['Instructor', 'Student'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await getUserByEmail(normalizedEmail);
    const emailError = registrationEmailError(existing);
    if (emailError) {
      res.status(400).json({ error: emailError });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    await createOtpRecord(normalizedEmail, 'register', otp, {
      username: String(username).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: String(role),
    });
    await sendOtpEmail(normalizedEmail, 'EduAIGames Registration OTP', otp, OTP_EXP_MINUTES);

    res.json({ message: 'OTP sent to your email.' });
  } catch (error: any) {
    console.error('Request register OTP error:', error);
    res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

// Verify registration OTP and create account
router.post('/register/verify-otp', async (req: Request, res: Response) => {
  try {
    if (!(await assertRegistrationOpen(res))) return;
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: 'Email and OTP are required' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const payload = await consumeLatestOtp(normalizedEmail, 'register', String(otp).trim());
    if (!payload || !payload.username || !payload.password || !payload.role) {
      res.status(400).json({ error: 'Registration session not found. Please try again.' });
      return;
    }

    const existing = await getUserByEmail(normalizedEmail);
    const emailError = registrationEmailError(existing);
    if (emailError) {
      res.status(400).json({ error: emailError });
      return;
    }

    const accountStatus = await resolveRegistrationStatus();
    const user = await createUser(
      payload.username,
      normalizedEmail,
      payload.password,
      payload.role,
      accountStatus
    );
    await notifyAdminIfPending(user);
    const pendingApproval = accountStatus === 'pending';
    res.status(201).json({
      message: pendingApproval
        ? 'Registration submitted successfully. Please wait for an administrator to approve your account before logging in.'
        : 'Account created successfully. You can now log in.',
      user,
      pendingApproval,
    });
  } catch (error: any) {
    console.error('Verify register OTP error:', error);
    res.status(400).json({ error: error.message || 'OTP verification failed' });
  }
});

// Request forgot-password OTP
router.post('/password-reset/request', async (req: Request, res: Response) => {
  try {
    if (!isEmailServiceConfigured()) {
      res.status(503).json({
        error: 'Forgot-password email service is not configured. Please set SMTP_* values in server/.env.',
      });
      return;
    }
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);

    if (user) {
      const otp = generateOtp();
      await createOtpRecord(normalizedEmail, 'password-reset', otp, null);
      await sendOtpEmail(normalizedEmail, 'EduAIGames Password Reset OTP', otp, OTP_EXP_MINUTES);
    }

    // Always return success to avoid account enumeration
    res.json({ message: 'If this email exists, an OTP has been sent.' });
  } catch (error: any) {
    console.error('Request reset OTP error:', error);
    res.status(500).json({ error: error.message || 'Failed to send reset OTP' });
  }
});

// Verify forgot-password OTP and set new password
router.post('/password-reset/verify', async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      res.status(400).json({ error: 'Email, OTP, and new password are required' });
      return;
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    await consumeLatestOtp(normalizedEmail, 'password-reset', String(otp).trim());
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await updateUserPasswordByEmail(normalizedEmail, hashedPassword);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'Password updated successfully. You can now login.' });
  } catch (error: any) {
    console.error('Verify reset OTP error:', error);
    res.status(400).json({ error: error.message || 'Failed to reset password' });
  }
});

// Register endpoint
router.post('/register', async (req: Request, res: Response) => {
  try {
    if (!(await assertRegistrationOpen(res))) return;
    const { username, email, password, role } = req.body;

    // Validation
    if (!username || !email || !password || !role) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    if (!['Instructor', 'Student'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    // NOTE: Legacy route kept for compatibility.
    // Preferred flow is /register/request-otp + /register/verify-otp.

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await getUserByEmail(normalizedEmail);
    const emailError = registrationEmailError(existingUser);
    if (emailError) {
      res.status(400).json({ error: emailError });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const accountStatus = await resolveRegistrationStatus();
    const newUser = await createUser(
      String(username).trim(),
      normalizedEmail,
      hashedPassword,
      role,
      accountStatus
    );
    await notifyAdminIfPending(newUser);
    const pendingApproval = accountStatus === 'pending';
    res.status(201).json({
      message: pendingApproval
        ? 'Registration submitted successfully. Please wait for an administrator to approve your account before logging in.'
        : 'Account created successfully. You can now log in.',
      user: newUser,
      pendingApproval,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user
    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const accountStatus = user.account_status ?? 'approved';
    if (accountStatus === 'pending') {
      res.status(403).json({ error: PENDING_LOGIN_MESSAGE, code: 'ACCOUNT_PENDING' });
      return;
    }
    if (accountStatus === 'rejected') {
      res.status(403).json({ error: REJECTED_LOGIN_MESSAGE, code: 'ACCOUNT_REJECTED' });
      return;
    }
    if (accountStatus === 'suspended') {
      res.status(403).json({ error: SUSPENDED_LOGIN_MESSAGE, code: 'ACCOUNT_SUSPENDED' });
      return;
    }

    const role = user.role;

    // Block sign-in for members of a suspended institution (paid-account lapse).
    let institutionContext: Awaited<ReturnType<typeof getUserInstitutionContext>> = null;
    try {
      institutionContext = await getUserInstitutionContext(user.id);
    } catch (instErr) {
      console.error('Failed to resolve institution context:', instErr);
    }
    if (
      (role === 'Student' || role === 'Instructor') &&
      institutionContext?.status === 'suspended'
    ) {
      res.status(403).json({
        error:
          'Your institution\u2019s access to EduAIGames is currently suspended. Please contact your administrator.',
        code: 'INSTITUTION_SUSPENDED',
      });
      return;
    }

    try {
      await recordUserLogin(user.id, role);
    } catch (loginLogErr) {
      console.error('Failed to record login event:', loginLogErr);
    }

    res.json({
      message:
        role === 'SuperAdmin'
          ? 'Super Admin login successful'
          : role === 'Admin'
            ? 'Admin login successful'
            : 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role,
        institution_id: institutionContext?.institution_id ?? null,
        institution_name: institutionContext?.institution_name ?? null,
        plan_name: institutionContext?.plan_name ?? null,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

export default router;
