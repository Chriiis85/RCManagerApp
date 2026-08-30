import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const getPrisma = (req: Request): PrismaClient => (req.app.locals.prisma as PrismaClient);

// Search users by username (excluding the current user)
router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    const currentUserId = (req as any).user?.userId || (req as any).user?.id;
    const prisma = getPrisma(req);

    if (!q || q.length < 2) {
      res.json([]);
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        id: currentUserId ? { not: currentUserId } : undefined
      },
      select: { id: true, username: true },
      take: 10
    });

    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Error searching users', details: error instanceof Error ? error.message : error });
  }
});

// Helper to generate unique username suggestions
async function generateUniqueUsernames(baseUsername: string, prisma: PrismaClient): Promise<string[]> {
  const suggestions: string[] = [];
  let attempts = 0;
  
  while (suggestions.length < 3 && attempts < 15) {
    const randomSuffix = Math.floor(10 + Math.random() * 990);
    const suggestion = `${baseUsername}${randomSuffix}`;
    const exists = await prisma.user.findFirst({
      where: { username: { equals: suggestion, mode: 'insensitive' } }
    });
    if (!exists && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
    attempts++;
  }
  return suggestions;
}

// Check username availability
router.get('/check-username', authenticateToken, async (req: Request, res: Response) => {
  try {
    const rawUsername = (req.query.username as string) || '';
    const username = rawUsername.trim();
    const currentUserId = (req as any).user?.userId || (req as any).user?.id;
    const prisma = getPrisma(req);

    if (!username || username.length < 3) {
      res.json({
        available: false,
        exists: false,
        message: 'El nombre de usuario debe tener al menos 3 caracteres.'
      });
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.json({
        available: false,
        exists: false,
        message: 'El nombre de usuario solo puede contener letras, números, puntos y guiones.'
      });
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        id: currentUserId ? { not: currentUserId } : undefined
      }
    });

    if (existingUser) {
      const suggestions = await generateUniqueUsernames(username, prisma);
      res.json({
        available: false,
        exists: true,
        suggestions,
        message: 'Este nombre de usuario ya está en uso.'
      });
    } else {
      res.json({
        available: true,
        exists: false,
        message: 'Nombre de usuario disponible.'
      });
    }
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({ error: 'Error checking username', details: error instanceof Error ? error.message : error });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user?.userId || (req as any).user?.id;
    const { firstName, lastName, profileImage, username } = req.body;
    const prisma = getPrisma(req);

    if (!currentUserId) {
      res.status(401).json({ error: 'User ID missing from token' });
      return;
    }

    let cleanUsername: string | undefined = undefined;

    // Comprobar si quiere cambiar el username y si ya existe
    if (username !== undefined && username !== null) {
      cleanUsername = String(username).trim();

      if (cleanUsername.length < 3) {
        res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres.' });
        return;
      }

      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
        res.status(400).json({ error: 'El nombre de usuario solo puede contener letras, números, puntos y guiones.' });
        return;
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          username: { equals: cleanUsername, mode: 'insensitive' },
          id: { not: currentUserId }
        }
      });

      if (existingUser) {
        const suggestions = await generateUniqueUsernames(cleanUsername, prisma);
        res.status(409).json({ 
          error: 'El nombre de usuario ya está en uso.',
          suggestions 
        });
        return;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUserId },
      data: {
        firstName: firstName !== undefined ? firstName : undefined,
        lastName: lastName !== undefined ? lastName : undefined,
        profileImage: profileImage !== undefined ? profileImage : undefined,
        username: cleanUsername !== undefined ? cleanUsername : undefined,
      },
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
        createdAt: true,
        updatedAt: true
      }
    });

    res.json(updatedUser);
  } catch (error: any) {
    console.error('Error updating profile:', error);
    if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
      const suggestions = req.body?.username ? await generateUniqueUsernames(String(req.body.username).trim(), getPrisma(req)) : [];
      res.status(409).json({
        error: 'El nombre de usuario ya está en uso.',
        suggestions
      });
      return;
    }
    res.status(500).json({ error: 'Error updating profile', details: error instanceof Error ? error.message : error });
  }
});

// Update or set user password
router.put('/password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user?.userId || (req as any).user?.id;
    const { currentPassword, newPassword } = req.body;
    const prisma = getPrisma(req);

    if (!currentUserId) {
      res.status(401).json({ error: 'Usuario no autenticado o token inválido.' });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: currentUserId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    // Si el cliente envía la contraseña actual, verificarla
    if (currentPassword) {
      const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!passwordMatch) {
        res.status(400).json({ error: 'La contraseña actual no es correcta.' });
        return;
      }
    }

    // Hashear y guardar la nueva contraseña
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { id: currentUserId },
      data: { passwordHash }
    });

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error al actualizar contraseña:', error);
    res.status(500).json({
      error: 'Error interno al actualizar la contraseña.',
      details: error instanceof Error ? error.message : error
    });
  }
});

export default router;
