import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const getPrisma = (req: Request): PrismaClient => req.app.locals.prisma as PrismaClient;

// Función auxiliar para formatear la respuesta exactamente como espera el frontend
function formatFriend(f: any) {
  return {
    id: Number(f.id),
    user_id: Number(f.userId),
    friend_id: Number(f.friendId),
    user_username: f.userUsername || '',
    friend_username: f.friendUsername || '',
    status: f.status,
    created_at: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
  };
}

// GET /api/friends — Lista todas las solicitudes y amistades del usuario autenticado
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = BigInt((req as any).user.userId);
    const prisma = getPrisma(req);

    const friendships = await prisma.friend.findMany({
      where: {
        OR: [{ userId: currentUserId }, { friendId: currentUserId }],
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(friendships.map(formatFriend));
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Error al obtener amistades.', details: error instanceof Error ? error.message : error });
  }
});

// POST /api/friends/request — Enviar una nueva solicitud de amistad
router.post('/request', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = BigInt((req as any).user.userId);
    const { friendId, friendUsername } = req.body;
    const prisma = getPrisma(req);

    if (!friendId) {
      res.status(400).json({ error: 'El ID del amigo es obligatorio.' });
      return;
    }

    const targetFriendId = BigInt(friendId);

    if (currentUserId === targetFriendId) {
      res.status(400).json({ error: 'No puedes enviarte una solicitud a ti mismo.' });
      return;
    }

    // Obtener los datos del usuario actual para guardar su username
    const currentUser = await prisma.user.findUnique({
      where: { id: Number(currentUserId) },
      select: { username: true },
    });

    const senderUsername = currentUser?.username || (req as any).user.username || 'Usuario';

    // Comprobar si ya existe alguna relación previa en cualquier dirección
    const existing = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId: currentUserId, friendId: targetFriendId },
          { userId: targetFriendId, friendId: currentUserId },
        ],
      },
    });

    if (existing) {
      res.status(400).json({ error: 'Ya existe una solicitud o amistad con este usuario.' });
      return;
    }

    const newFriendship = await prisma.friend.create({
      data: {
        userId: currentUserId,
        friendId: targetFriendId,
        userUsername: senderUsername,
        friendUsername: friendUsername || 'Usuario',
        status: 'PENDING',
      },
    });

    res.status(201).json(formatFriend(newFriendship));
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Error al enviar la solicitud.', details: error instanceof Error ? error.message : error });
  }
});

// PUT /api/friends/:id — Aceptar o rechazar una solicitud
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = BigInt((req as any).user.userId);
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = BigInt(rawId);
    const { status } = req.body;
    const prisma = getPrisma(req);

    if (!status || !['ACCEPTED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: "El estado debe ser 'ACCEPTED' o 'REJECTED'." });
      return;
    }

    const friendship = await prisma.friend.findUnique({
      where: { id },
    });

    if (!friendship) {
      res.status(404).json({ error: 'Solicitud no encontrada.' });
      return;
    }

    // Solo el receptor de la solicitud puede aceptarla o rechazarla
    if (friendship.friendId !== currentUserId) {
      res.status(403).json({ error: 'No tienes permiso para responder a esta solicitud.' });
      return;
    }

    const updated = await prisma.friend.update({
      where: { id },
      data: { status },
    });

    res.json(formatFriend(updated));
  } catch (error) {
    console.error('Error responding to friend request:', error);
    res.status(500).json({ error: 'Error al actualizar la solicitud.', details: error instanceof Error ? error.message : error });
  }
});

// DELETE /api/friends/:id — Eliminar un amigo o cancelar solicitud
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = BigInt((req as any).user.userId);
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = BigInt(rawId);
    const prisma = getPrisma(req);

    const friendship = await prisma.friend.findUnique({
      where: { id },
    });

    if (!friendship) {
      res.status(404).json({ error: 'Amistad o solicitud no encontrada.' });
      return;
    }

    // Tanto el emisor como el receptor pueden cancelar/eliminar
    if (friendship.userId !== currentUserId && friendship.friendId !== currentUserId) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta relación.' });
      return;
    }

    await prisma.friend.delete({
      where: { id },
    });

    res.json({ message: 'Amistad eliminada correctamente.' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Error al eliminar la amistad.', details: error instanceof Error ? error.message : error });
  }
});

export default router;
