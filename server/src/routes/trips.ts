import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const getPrisma = (req: Request): PrismaClient => (req.app.locals.prisma as PrismaClient);

const TRIP_INCLUDE = {
  park: true,
  companions: {
    include: {
      user: { select: { id: true, username: true, email: true, profileImage: true } }
    }
  },
  user: { select: { id: true, username: true, profileImage: true } }
};

// GET /api/trips — trips for auth user (owned + joined)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const prisma = getPrisma(req);

    const trips = await prisma.trip.findMany({
      where: {
        OR: [
          { userId },
          { companions: { some: { userId } } }
        ]
      },
      include: TRIP_INCLUDE,
      orderBy: { targetDate: 'asc' }
    });

    res.json(trips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ error: 'Error fetching trips', details: error instanceof Error ? error.message : error });
  }
});

// POST /api/trips — create a new trip
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { parkId, title, description, targetDate, endDate, companions } = req.body;
    const prisma = getPrisma(req);

    if (!parkId || !targetDate) {
      res.status(400).json({ error: 'parkId y targetDate son obligatorios.' });
      return;
    }

    const newTrip = await prisma.trip.create({
      data: {
        userId,
        parkId,
        title: title || null,
        description: description || null,
        targetDate: new Date(targetDate),
        endDate: endDate ? new Date(endDate) : null,
        companions: {
          create: companions
            ? companions.map((cId: number) => ({ userId: cId, status: 'PENDING' }))
            : []
        }
      },
      include: TRIP_INCLUDE
    });

    res.status(201).json(newTrip);
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ error: 'Error creating trip', details: error instanceof Error ? error.message : error });
  }
});

// POST /api/trips/:id/companions — add companions to an existing trip
router.post('/:id/companions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const tripId = parseInt(req.params['id'] as string);
    const { companions } = req.body; // array of user IDs
    const prisma = getPrisma(req);

    if (!Array.isArray(companions) || companions.length === 0) {
      res.status(400).json({ error: 'Se requiere una lista de usuarios.' });
      return;
    }

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) { res.status(404).json({ error: 'Viaje no encontrado.' }); return; }
    if (trip.userId !== userId) { res.status(403).json({ error: 'No tienes permiso.' }); return; }

    const existing = await prisma.tripCompanion.findMany({ where: { tripId } });
    const existingIds = existing.map(e => e.userId);
    const newCompanions = companions.filter((id: number) => !existingIds.includes(id));

    if (newCompanions.length > 0) {
      await prisma.tripCompanion.createMany({
        data: newCompanions.map((cId: number) => ({
          tripId,
          userId: cId,
          status: 'PENDING'
        }))
      });
    }

    const updatedTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_INCLUDE
    });

    res.json(updatedTrip);
  } catch (error) {
    console.error('Error adding companions:', error);
    res.status(500).json({ error: 'Error adding companions', details: error instanceof Error ? error.message : error });
  }
});

// PUT /api/trips/:id/companions/accept — accept a trip invitation
router.put('/:id/companions/accept', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user.userId;
    const tripId = parseInt(req.params['id'] as string);
    const prisma = getPrisma(req);

    const companion = await prisma.tripCompanion.findFirst({
      where: { tripId, userId: currentUserId }
    });

    if (!companion) { res.status(404).json({ error: 'Invitación no encontrada.' }); return; }

    await prisma.tripCompanion.update({
      where: { id: companion.id },
      data: { status: 'ACCEPTED' }
    });

    const updatedTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_INCLUDE
    });

    res.json(updatedTrip);
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Error accepting invitation', details: error instanceof Error ? error.message : error });
  }
});

// PUT /api/trips/:id/companions/reject — reject a trip invitation
router.put('/:id/companions/reject', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user.userId;
    const tripId = parseInt(req.params['id'] as string);
    const prisma = getPrisma(req);

    const companion = await prisma.tripCompanion.findFirst({
      where: { tripId, userId: currentUserId }
    });

    if (!companion) { res.status(404).json({ error: 'Invitación no encontrada.' }); return; }

    await prisma.tripCompanion.update({
      where: { id: companion.id },
      data: { status: 'REJECTED' }
    });

    const updatedTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_INCLUDE
    });

    res.json(updatedTrip);
  } catch (error) {
    console.error('Error rejecting invitation:', error);
    res.status(500).json({ error: 'Error rejecting invitation', details: error instanceof Error ? error.message : error });
  }
});

// DELETE /api/trips/:id/companions/:userId — remove a companion from a trip
router.delete('/:id/companions/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user.userId;
    const tripId = parseInt(req.params['id'] as string);
    const targetUserId = parseInt(req.params['userId'] as string);
    const prisma = getPrisma(req);

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) { res.status(404).json({ error: 'Viaje no encontrado.' }); return; }
    
    // Only the trip owner or the companion themselves can remove the companion
    if (trip.userId !== currentUserId && currentUserId !== targetUserId) { 
      res.status(403).json({ error: 'No tienes permiso.' }); return; 
    }

    await prisma.tripCompanion.deleteMany({
      where: {
        tripId,
        userId: targetUserId
      }
    });

    const updatedTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_INCLUDE
    });

    res.json(updatedTrip);
  } catch (error) {
    console.error('Error removing companion:', error);
    res.status(500).json({ error: 'Error removing companion', details: error instanceof Error ? error.message : error });
  }
});

// DELETE /api/trips/:id — delete a trip
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const tripId = parseInt(req.params['id'] as string);
    const prisma = getPrisma(req);

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) { res.status(404).json({ error: 'Viaje no encontrado.' }); return; }
    if (trip.userId !== userId) { res.status(403).json({ error: 'No tienes permiso.' }); return; }

    await prisma.trip.delete({ where: { id: tripId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ error: 'Error deleting trip', details: error instanceof Error ? error.message : error });
  }
});

export default router;
