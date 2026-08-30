import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { send2FAEmail } from '../utils/mailer';

const router = Router();

// Helper to get Prisma from app locals (injected in index.ts)
const getPrisma = (req: Request): PrismaClient => (req.app.locals.prisma as PrismaClient);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}***@${domain}`;
}

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 🔴 POST /api/auth/register 🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴
router.post('/register', async (req: Request, res: Response) => {
  try {
    let { username, email, password } = req.body;

    // Validaciones básicas
    if (!username || !email || !password) {
      res.status(400).json({ error: 'username, email y password son obligatorios.' });
      return;
    }
    email = email.toLowerCase().trim();
    username = username.trim();

    if (password.length < 8) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const prisma = getPrisma(req);

    // Verificar duplicados
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    if (existing) {
      if (existing.email === email) {
        res.status(409).json({ error: 'El email ya está registrado. Si usaste Google, inicia sesión con ese botón.' });
        return;
      }
      res.status(409).json({ error: 'El nombre de usuario ya está en uso.' });
      return;
    }

    // Hash de la contraseña
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Crear usuario
    const user = await prisma.user.create({
      data: { username, email, passwordHash },
      select: { id: true, username: true, email: true, role: true, firstName: true, lastName: true, profileImage: true, createdAt: true }
    });

    // Generar token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.status(201).json({
      message: 'Usuario registrado correctamente.',
      token,
      user
    });
  } catch (error) {
    console.error('Error en register:', error);
    res.status(500).json({
      error: 'Error interno al registrar el usuario.',
      details: error instanceof Error ? error.message : error
    });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    let { email, username, identifier, password } = req.body;

    const rawIdentifier = String(identifier || email || username || '').trim();

    if (!rawIdentifier || !password) {
      res.status(400).json({ error: 'El correo electrónico o usuario y la contraseña son obligatorios.' });
      return;
    }

    const prisma = getPrisma(req);

    // Buscar usuario (insensible a mayúsculas/minúsculas) por email O por username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: rawIdentifier, mode: 'insensitive' } },
          { username: { equals: rawIdentifier, mode: 'insensitive' } }
        ]
      }
    });
    if (!user) {
      res.status(401).json({ 
        error: 'No se ha encontrado ninguna cuenta con este correo o nombre de usuario. Regístrate primero con Google.',
        isNotRegistered: true
      });
      return;
    }

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ 
        error: 'Contraseña incorrecta o cuenta sin contraseña manual. Si te registraste con Google, inicia sesión con el botón de Google y luego podrás establecer tu contraseña en tu Perfil.',
        isOAuthHint: true
      });
      return;
    }

    // Si el usuario tiene 2FA activado (EMAIL o APP)
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { userId: user.id, is2FA: true },
        JWT_SECRET,
        { expiresIn: '10m' }
      );

      if (user.twoFactorType === 'EMAIL') {
        const emailCode = generate6DigitCode();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            twoFactorEmailCode: emailCode,
            twoFactorEmailExpires: expires
          }
        });

        await send2FAEmail(user.email, emailCode, user.username);

        res.json({
          requires2FA: true,
          twoFactorType: 'EMAIL',
          tempToken,
          maskedEmail: maskEmail(user.email),
          message: 'Se ha enviado un código de verificación a tu correo electrónico.'
        });
        return;
      }

      // 2FA por App Authenticator (TOTP)
      res.json({
        requires2FA: true,
        twoFactorType: 'APP',
        tempToken,
        message: 'Verificación en dos pasos requerida (App Authenticator).'
      });
      return;
    }

    // Generar token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.json({
      message: 'Sesión iniciada correctamente.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorType: user.twoFactorType,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error interno al iniciar sesión.',
      details: error instanceof Error ? error.message : error
    });
  }
});

// ── POST /api/auth/login/2fa ────────────────────────────────────────────────
router.post('/login/2fa', async (req: Request, res: Response) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      res.status(400).json({ error: 'tempToken y el código 2FA son obligatorios.' });
      return;
    }

    let decoded: { userId: number; is2FA: boolean };
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET) as { userId: number; is2FA: boolean };
    } catch {
      res.status(401).json({ error: 'La sesión de verificación ha expirado. Inicia sesión de nuevo.' });
      return;
    }

    if (!decoded.is2FA) {
      res.status(400).json({ error: 'Token inválido para 2FA.' });
      return;
    }

    const prisma = getPrisma(req);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.twoFactorEnabled) {
      res.status(400).json({ error: 'El usuario no tiene 2FA configurado.' });
      return;
    }

    let isValid = false;

    if (user.twoFactorType === 'EMAIL') {
      if (
        user.twoFactorEmailCode &&
        user.twoFactorEmailCode === String(code).trim() &&
        user.twoFactorEmailExpires &&
        new Date() <= user.twoFactorEmailExpires
      ) {
        isValid = true;
        // Limpiar código usado
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorEmailCode: null, twoFactorEmailExpires: null }
        });
      }
    } else {
      // Método APP (TOTP)
      if (user.twoFactorSecret) {
        isValid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: String(code).trim(),
          window: 2
        });
      }
    }

    if (!isValid) {
      res.status(401).json({ error: 'Código de verificación incorrecto o expirado.' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.json({
      message: 'Sesión iniciada correctamente con 2FA.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorType: user.twoFactorType,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error en /login/2fa:', error);
    res.status(500).json({ error: 'Error interno en verificación 2FA.' });
  }
});

// ── POST /api/auth/login/2fa/resend ─────────────────────────────────────────
router.post('/login/2fa/resend', async (req: Request, res: Response) => {
  try {
    const { tempToken } = req.body;
    if (!tempToken) {
      res.status(400).json({ error: 'tempToken es obligatorio.' });
      return;
    }

    let decoded: { userId: number; is2FA: boolean };
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET) as { userId: number; is2FA: boolean };
    } catch {
      res.status(401).json({ error: 'La sesión ha expirado. Inicia sesión de nuevo.' });
      return;
    }

    const prisma = getPrisma(req);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.twoFactorEnabled || user.twoFactorType !== 'EMAIL') {
      res.status(400).json({ error: 'El usuario no tiene 2FA por email.' });
      return;
    }

    const emailCode = generate6DigitCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEmailCode: emailCode,
        twoFactorEmailExpires: expires
      }
    });

    await send2FAEmail(user.email, emailCode, user.username);

    res.json({ message: 'Se ha reenviado un nuevo código a tu correo electrónico.' });
  } catch (error) {
    console.error('Error en /login/2fa/resend:', error);
    res.status(500).json({ error: 'Error al reenviar código.' });
  }
});

// ── POST /api/auth/supabase ──────────────────────────────────────────────────
router.post('/supabase', async (req: Request, res: Response) => {
  try {
    const { access_token } = req.body;
    if (!access_token) {
      res.status(400).json({ error: 'access_token es obligatorio.' });
      return;
    }

    const supabaseUrl = 'https://qgxpnuesyxwbexavydnp.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBudWVzeXh3YmV4YXZ5ZG5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODU1OTgsImV4cCI6MjA4OTk2MTU5OH0.BrBqXjWINCUdA-CMjw1GlKzkJ0UPWYaicCVNo1RRHHc';

    const supRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        apikey: supabaseAnonKey
      }
    });

    if (!supRes.ok) {
      res.status(401).json({ error: 'Token de Supabase inválido.' });
      return;
    }

    const supUser = await supRes.json();
    const email = supUser.email;
    const username = supUser.user_metadata?.full_name || email.split('@')[0];

    const prisma = getPrisma(req);
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const randomPassword = await bcrypt.hash(Math.random().toString(36).slice(-10), 10);
      
      let uniqueUsername = username;
      let counter = 1;
      while (await prisma.user.findUnique({ where: { username: uniqueUsername } })) {
        uniqueUsername = `${username}${counter}`;
        counter++;
      }

      user = await prisma.user.create({
        data: {
          email,
          username: uniqueUsername,
          passwordHash: randomPassword
        }
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    res.json({
      message: 'Sesión iniciada correctamente mediante Supabase.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorType: user.twoFactorType,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Error en /supabase:', error);
    res.status(500).json({ error: 'Error interno en autenticación Supabase.' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
// Ruta protegida: devuelve el perfil del usuario autenticado
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticación requerido.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    let decoded: { userId: number; email: string; role: string };

    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string; role: string };
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    const prisma = getPrisma(req);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { 
        id: true, 
        username: true, 
        email: true, 
        role: true, 
        firstName: true, 
        lastName: true, 
        profileImage: true, 
        twoFactorEnabled: true,
        twoFactorType: true,
        createdAt: true 
      }
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Error en /me:', error);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ── 2FA MANAGEMENT ENDPOINTS ─────────────────────────────────────────────────

// POST /api/auth/2fa/send-email-code (Envía código de prueba por correo para activar 2FA)
router.post('/2fa/send-email-code', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticación requerido.' });
      return;
    }
    const token = authHeader.split(' ')[1];
    let decoded: { userId: number };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    const prisma = getPrisma(req);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    const code = generate6DigitCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEmailCode: code,
        twoFactorEmailExpires: expires
      }
    });

    await send2FAEmail(user.email, code, user.username);

    res.json({ 
      message: `Código de verificación enviado a ${user.email}`,
      email: user.email,
      maskedEmail: maskEmail(user.email)
    });
  } catch (error) {
    console.error('Error en /2fa/send-email-code:', error);
    res.status(500).json({ error: 'Error al enviar código al correo.' });
  }
});

// POST /api/auth/2fa/setup (Genera Secret y Código QR para App)
router.post('/2fa/setup', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticación requerido.' });
      return;
    }
    const token = authHeader.split(' ')[1];
    let decoded: { userId: number; email: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    const prisma = getPrisma(req);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    // Generar secret y URL TOTP
    const secretObj = speakeasy.generateSecret({
      length: 20,
      name: `RCManager (${user.email})`,
      issuer: 'RCManager'
    });

    const secret = secretObj.base32;
    const otpauthUrl = secretObj.otpauth_url || '';
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    res.json({
      secret,
      qrCode,
      otpauthUrl
    });
  } catch (error) {
    console.error('Error en /2fa/setup:', error);
    res.status(500).json({ error: 'Error al generar configuración 2FA.' });
  }
});

// POST /api/auth/2fa/enable (Verifica código y activa 2FA con tipo EMAIL o APP)
router.post('/2fa/enable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticación requerido.' });
      return;
    }
    const token = authHeader.split(' ')[1];
    let decoded: { userId: number };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    const { type, secret, code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'El código de verificación es obligatorio.' });
      return;
    }

    const prisma = getPrisma(req);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    if (type === 'EMAIL') {
      if (
        !user.twoFactorEmailCode ||
        user.twoFactorEmailCode !== String(code).trim() ||
        !user.twoFactorEmailExpires ||
        new Date() > user.twoFactorEmailExpires
      ) {
        res.status(400).json({ error: 'Código de verificación de email incorrecto o expirado.' });
        return;
      }

      await prisma.user.update({
        where: { id: decoded.userId },
        data: {
          twoFactorEnabled: true,
          twoFactorType: 'EMAIL',
          twoFactorEmailCode: null,
          twoFactorEmailExpires: null
        }
      });
    } else {
      // Método APP (TOTP)
      if (!secret) {
        res.status(400).json({ error: 'El secreto 2FA es obligatorio para la app.' });
        return;
      }

      const isValid = speakeasy.totp.verify({
        secret: String(secret).trim(),
        encoding: 'base32',
        token: String(code).trim(),
        window: 2
      });

      if (!isValid) {
        res.status(400).json({ error: 'Código incorrecto. Asegúrate de que la hora en tu dispositivo esté sincronizada.' });
        return;
      }

      await prisma.user.update({
        where: { id: decoded.userId },
        data: {
          twoFactorEnabled: true,
          twoFactorType: 'APP',
          twoFactorSecret: String(secret).trim()
        }
      });
    }

    res.json({ message: 'Verificación en dos pasos activada correctamente.' });
  } catch (error) {
    console.error('Error en /2fa/enable:', error);
    res.status(500).json({ error: 'Error al activar 2FA.' });
  }
});

// POST /api/auth/2fa/disable (Desactiva 2FA)
router.post('/2fa/disable', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token de autenticación requerido.' });
      return;
    }
    const token = authHeader.split(' ')[1];
    let decoded: { userId: number };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    const prisma = getPrisma(req);
    await prisma.user.update({
      where: { id: decoded.userId },
      data: {
        twoFactorEnabled: false,
        twoFactorType: 'APP',
        twoFactorSecret: null,
        twoFactorEmailCode: null,
        twoFactorEmailExpires: null
      }
    });

    res.json({ message: 'Verificación en dos pasos desactivada correctamente.' });
  } catch (error) {
    console.error('Error en /2fa/disable:', error);
    res.status(500).json({ error: 'Error al desactivar 2FA.' });
  }
});

export default router;
