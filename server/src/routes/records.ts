import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const getPrisma = (req: AuthenticatedRequest): PrismaClient => (req.app.locals.prisma as PrismaClient);

// Proteger todas las rutas de este router
router.use(authenticateToken);

// ── COASTER CREDITS ──────────────────────────────────────────────────────────

// Obtener todos los credits del usuario
router.get('/credits', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;

    const credits = await prisma.coasterCredit.findMany({
      where: { userId },
      include: {
        coaster: {
          include: { park: true }
        }
      },
      orderBy: { rideDate: 'desc' }
    });

    res.json(credits);
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({ error: 'Error interno al obtener credits.' });
  }
});

// Añadir un nuevo credit
router.post('/credits', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const { coasterId, rideDate, rating, review, coasterData } = req.body;

    if (!coasterId) {
      res.status(400).json({ error: 'coasterId es obligatorio.' });
      return;
    }

    let localCoasterId: number;

    if (coasterData) {
      // 1. Buscar el coaster en local por su apiId externo O por su id interno si el frontend ya mandó el ID local
      let coaster = await prisma.coaster.findFirst({ 
        where: { 
          OR: [
            { apiId: Number(coasterId) },
            { id: Number(coasterId) }
          ]
        } 
      });

      if (!coaster) {
        // 2. Buscar el parque: primero por apiId si viene, si no por nombre exacto
        const parkName = coasterData.park || 'Parque Desconocido';
        let park = null;

        if (coasterData.parkApiId) {
          park = await prisma.park.findFirst({ where: { apiId: Number(coasterData.parkApiId) } });
        }

        // Si no se encontró por apiId, buscar por nombre para no crear duplicados
        if (!park) {
          park = await prisma.park.findFirst({ where: { name: parkName } });
        }

        // Solo crear el parque si realmente no existe
        if (!park) {
          const slugBase = parkName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          park = await prisma.park.create({
            data: {
              name: parkName,
              slug: `${slugBase}-${Date.now()}`,
              country: coasterData.country || 'Desconocido',
              apiId: coasterData.parkApiId ? Number(coasterData.parkApiId) : null
            }
          });
        }

        // 3. Crear el coaster vinculado al parque encontrado/creado
        const slugBase = coasterData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        coaster = await prisma.coaster.create({
          data: {
            name: coasterData.name,
            slug: `${slugBase}-${Date.now()}`,
            parkId: park.id,
            manufacturer: coasterData.manufacturer || null,
            apiId: Number(coasterId)
          }
        });
      }

      localCoasterId = coaster.id;
    } else {
      localCoasterId = Number(coasterId);
    }

    // 4. Comprobación de duplicado: el @@unique([userId, coasterId]) en el schema ya lo garantiza,
    //    pero hacemos la comprobación explícita para devolver un 409 limpio
    const existing = await prisma.coasterCredit.findFirst({
      where: { userId, coasterId: localCoasterId }
    });
    if (existing) {
      res.status(409).json({ error: 'Ya tienes registrado este credit.' });
      return;
    }

    const credit = await prisma.coasterCredit.create({
      data: {
        userId,
        coasterId: localCoasterId,
        rideDate: rideDate ? new Date(rideDate) : new Date(),
        rating,
        review
      },
      include: { coaster: { include: { park: true } } }
    });

    res.status(201).json(credit);
  } catch (error: any) {
    console.error('Error adding credit:', error);
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Ya tienes registrado este credit.' });
      return;
    }
    res.status(500).json({ error: 'Error interno al guardar el credit.' });
  }
});

// Eliminar un credit
router.delete('/credits/:coasterId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const coasterId = Number(req.params.coasterId);

    let localCoasterId = coasterId;
    const coasterByApiId = await prisma.coaster.findFirst({ where: { apiId: coasterId } });
    if (coasterByApiId) {
      localCoasterId = coasterByApiId.id;
    }

    await prisma.coasterCredit.deleteMany({
      where: { userId, coasterId: localCoasterId }
    });

    res.json({ message: 'Credit eliminado correctamente.' });
  } catch (error: any) {
    console.error('Error deleting credit:', error);
    res.status(500).json({ error: 'Error interno al eliminar el credit.' });
  }
});

// Actualizar número de veces montado (rating field)
router.patch('/credits/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    const { rating } = req.body;

    const credit = await prisma.coasterCredit.updateMany({
      where: { id, userId },
      data: { rating }
    });

    if (credit.count === 0) {
      res.status(404).json({ error: 'Credit no encontrado.' });
      return;
    }

    const updated = await prisma.coasterCredit.findFirst({ where: { id }, include: { coaster: { include: { park: true } } } });
    res.json(updated);
  } catch (error) {
    console.error('Error updating credit count:', error);
    res.status(500).json({ error: 'Error interno al actualizar el credit.' });
  }
});

// ── ATTRACTION RECORDS ───────────────────────────────────────────────────────

router.get('/attractions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;

    const records = await prisma.attractionRecord.findMany({
      where: { userId },
      include: {
        attraction: {
          include: { park: true }
        }
      },
      orderBy: { rideDate: 'desc' }
    });

    res.json(records);
  } catch (error) {
    console.error('Error fetching attractions:', error);
    res.status(500).json({ error: 'Error interno al obtener atracciones.' });
  }
});

router.post('/attractions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const { attractionId, rideDate, rating, attractionData } = req.body;

    if (!attractionId) {
      res.status(400).json({ error: 'attractionId es obligatorio.' });
      return;
    }

    let localAttractionId: number;

    if (attractionData) {
      let attraction = await prisma.attraction.findFirst({ 
        where: { 
          OR: [
            { apiId: Number(attractionId) },
            { id: Number(attractionId) }
          ]
        } 
      });

      if (!attraction) {
        let park = null;
        const parkName = attractionData.park || 'Parque Desconocido';
        
        if (attractionData.parkApiId) {
          park = await prisma.park.findFirst({ where: { apiId: Number(attractionData.parkApiId) } });
        }

        if (!park) {
          park = await prisma.park.findFirst({ where: { name: parkName } });
        }

        if (!park) {
          const slugBase = parkName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          park = await prisma.park.create({
            data: {
              name: parkName,
              slug: `${slugBase}-${Date.now()}`,
              country: attractionData.country || 'Desconocido',
              apiId: attractionData.parkApiId ? Number(attractionData.parkApiId) : null
            }
          });
        }

        const slugBase = attractionData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        attraction = await prisma.attraction.create({
          data: {
            name: attractionData.name,
            slug: `${slugBase}-${Date.now()}`,
            parkId: park.id,
            manufacturer: attractionData.manufacturer || null,
            apiId: Number(attractionId),
            type: 'OTHER'
          }
        });
      }
      localAttractionId = attraction.id;
    } else {
      localAttractionId = Number(attractionId);
    }

    const existing = await prisma.attractionRecord.findFirst({
      where: { userId, attractionId: localAttractionId }
    });
    if (existing) {
      res.status(409).json({ error: 'Ya tienes registrada esta atracción.' });
      return;
    }

    const record = await prisma.attractionRecord.create({
      data: {
        userId,
        attractionId: localAttractionId,
        rideDate: rideDate ? new Date(rideDate) : new Date(),
        rating
      },
      include: { attraction: { include: { park: true } } }
    });

    res.status(201).json(record);
  } catch (error: any) {
    console.error('Error adding attraction record:', error);
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Ya tienes registrada esta atracción.' });
      return;
    }
    res.status(500).json({ error: 'Error interno al guardar la atracción.' });
  }
});

router.delete('/attractions/:attractionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const attractionId = Number(req.params.attractionId);

    let localAttractionId = attractionId;
    const attrByApiId = await prisma.attraction.findFirst({ where: { apiId: attractionId } });
    if (attrByApiId) {
      localAttractionId = attrByApiId.id;
    }

    await prisma.attractionRecord.deleteMany({
      where: { userId, attractionId: localAttractionId }
    });

    res.json({ message: 'Registro de atracción eliminado.' });
  } catch (error: any) {
    console.error('Error deleting attraction:', error);
    res.status(500).json({ error: 'Error interno al eliminar la atracción.' });
  }
});

// Actualizar número de veces visitada (rating field)
router.patch('/attractions/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    const { rating } = req.body;

    const record = await prisma.attractionRecord.updateMany({
      where: { id, userId },
      data: { rating }
    });

    if (record.count === 0) {
      res.status(404).json({ error: 'Registro no encontrado.' });
      return;
    }

    const updated = await prisma.attractionRecord.findFirst({ where: { id }, include: { attraction: { include: { park: true } } } });
    res.json(updated);
  } catch (error) {
    console.error('Error updating attraction count:', error);
    res.status(500).json({ error: 'Error interno al actualizar la atracción.' });
  }
});

// ── PARK VISITS ──────────────────────────────────────────────────────────────

router.get('/parks', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;

    const visits = await prisma.parkVisit.findMany({
      where: { userId },
      include: { park: true },
      orderBy: { visitDate: 'desc' }
    });

    res.json(visits);
  } catch (error) {
    console.error('Error fetching park visits:', error);
    res.status(500).json({ error: 'Error interno al obtener visitas a parques.' });
  }
});

router.post('/parks', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const { parkId, visitDate, parkData } = req.body;

    if (!parkId) {
      res.status(400).json({ error: 'parkId es obligatorio.' });
      return;
    }

    let localParkId: number;

    if (parkData) {
      const parkName = parkData.name || 'Parque Desconocido';

      // 1. Buscar por apiId primero
      let park = await prisma.park.findFirst({ where: { apiId: Number(parkId) } });

      // 2. Si no existe por apiId, buscar por nombre (puede haber sido creado desde credits sin apiId)
      if (!park) {
        park = await prisma.park.findFirst({ where: { name: parkName } });
        if (park) {
          // Actualizar el apiId ahora que lo sabemos, para que futuros lookups funcionen
          park = await prisma.park.update({
            where: { id: park.id },
            data: { apiId: Number(parkId) }
          });
        }
      }

      // 3. Si aun no existe, crear el parque
      if (!park) {
        const slugBase = parkName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        park = await prisma.park.create({
          data: {
            name: parkName,
            slug: `${slugBase}-${Date.now()}`,
            country: parkData.country || 'Desconocido',
            apiId: Number(parkId)
          }
        });
      }

      localParkId = park.id;
    } else {
      localParkId = Number(parkId);
    }

    // Comprobar si ya existe una visita para evitar el P2002
    const existing = await prisma.parkVisit.findFirst({
      where: { userId, parkId: localParkId }
    });
    if (existing) {
      res.status(409).json({ error: 'Ya tienes registrado este parque.', visit: existing });
      return;
    }

    const visit = await prisma.parkVisit.create({
      data: {
        userId,
        parkId: localParkId,
        visitDate: visitDate ? new Date(visitDate) : new Date()
      },
      include: { park: true }
    });

    res.status(201).json(visit);
  } catch (error: any) {
    console.error('Error adding park visit:', error);
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Ya tienes registrado este parque.' });
      return;
    }
    res.status(500).json({ error: 'Error interno al guardar la visita.' });
  }
});

router.delete('/parks/:parkId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const parkId = Number(req.params.parkId);

    let localParkId = parkId;
    const parkByApiId = await prisma.park.findFirst({ where: { apiId: parkId } });
    if (parkByApiId) {
      localParkId = parkByApiId.id;
    }

    await prisma.parkVisit.deleteMany({
      where: {
        userId,
        parkId: localParkId
      }
    });

    res.json({ message: 'Visita al parque eliminada.' });
  } catch (error: any) {
    console.error('Error deleting park visit:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Visita no encontrada.' });
      return;
    }
    res.status(500).json({ error: 'Error interno al eliminar la visita.' });
  }
});

// Actualizar número de veces visitado (rating field)
router.patch('/parks/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prisma = getPrisma(req);
    const userId = req.user!.userId;
    const id = Number(req.params.id);
    const { rating } = req.body;

    const visit = await prisma.parkVisit.updateMany({
      where: { id, userId },
      data: { rating }
    });

    if (visit.count === 0) {
      res.status(404).json({ error: 'Registro no encontrado.' });
      return;
    }

    const updated = await prisma.parkVisit.findFirst({ where: { id }, include: { park: true } });
    res.json(updated);
  } catch (error) {
    console.error('Error updating park count:', error);
    res.status(500).json({ error: 'Error interno al actualizar el parque.' });
  }
});

export default router;
