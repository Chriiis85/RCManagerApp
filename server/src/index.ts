import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import authRouter from './routes/auth';

// Configure environment variables
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Singleton Prisma para entornos serverless (Vercel) ───────────────────────
// Evita crear múltiples conexiones en cada invocación
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function getPrismaClient(): PrismaClient {
  if (!global.__prisma) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 1, // Importante para serverless
    });
    const adapter = new PrismaPg(pool as any);
    global.__prisma = new PrismaClient({ adapter });
  }
  return global.__prisma;
}

const app = express();

const prisma = getPrismaClient();

// Make prisma accessible in routes via req.app.locals
app.locals.prisma = prisma;

const PORT = process.env.PORT || 3001;

// ── CORS — configuración robusta para Vercel serverless ──────────────────────
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false,
  optionsSuccessStatus: 204,
};

// Aplicar CORS a todas las rutas
app.use(cors(corsOptions));

// Middleware: forzar cabeceras CORS y responder preflight OPTIONS en todas las rutas
// Debe estar ANTES de cualquier ruta para que funcione en Vercel serverless
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Create an API router
const apiRouter = express.Router();


// Root route of the API
apiRouter.get('/', (req: Request, res: Response) => {
  res.json({ message: 'RCManager API is running!', status: 'OK' });
});

// --- PARKS ---
apiRouter.get('/parks', async (req: Request, res: Response) => {
  try {
    const parks = await prisma.park.findMany({
      include: { operator: true }
    });
    res.json(parks);
  } catch (error) {
    console.error('Error fetching parks:', error);
    res.status(500).json({ error: 'Error fetching parks', details: error instanceof Error ? error.message : error });
  }
});

apiRouter.post('/parks', async (req: Request, res: Response) => {
  try {
    const park = await prisma.park.create({
      data: req.body
    });
    res.status(201).json(park);
  } catch (error) {
    console.error('Error creating park:', error);
    res.status(500).json({ error: 'Error creating park', details: error instanceof Error ? error.message : error });
  }
});

// --- COASTERS ---
apiRouter.get('/coasters', async (req: Request, res: Response) => {
  try {
    const coasters = await prisma.coaster.findMany({
      include: { park: true }
    });
    res.json(coasters);
  } catch (error) {
    console.error('Error fetching coasters:', error);
    res.status(500).json({ error: 'Error fetching coasters', details: error instanceof Error ? error.message : error });
  }
});

apiRouter.post('/coasters', async (req: Request, res: Response) => {
  try {
    const coaster = await prisma.coaster.create({
      data: req.body
    });
    res.status(201).json(coaster);
  } catch (error) {
    console.error('Error creating coaster:', error);
    res.status(500).json({ error: 'Error creating coaster', details: error instanceof Error ? error.message : error });
  }
});

// --- OPERATORS ---
apiRouter.get('/operators', async (req: Request, res: Response) => {
  try {
    const operators = await prisma.operator.findMany();
    res.json(operators);
  } catch (error) {
    console.error('Error fetching operators:', error);
    res.status(500).json({ error: 'Error fetching operators', details: error instanceof Error ? error.message : error });
  }
});

apiRouter.post('/operators', async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator.create({
      data: req.body
    });
    res.status(201).json(operator);
  } catch (error) {
    console.error('Error creating operator:', error);
    res.status(500).json({ error: 'Error creating operator', details: error instanceof Error ? error.message : error });
  }
});

// --- ATTRACTIONS ---
apiRouter.get('/attractions', async (req: Request, res: Response) => {
  try {
    const attractions = await prisma.attraction.findMany({
      include: { park: true }
    });
    res.json(attractions);
  } catch (error) {
    console.error('Error fetching attractions:', error);
    res.status(500).json({ error: 'Error fetching attractions', details: error instanceof Error ? error.message : error });
  }
});

apiRouter.post('/attractions', async (req: Request, res: Response) => {
  try {
    const attraction = await prisma.attraction.create({
      data: req.body
    });
    res.status(201).json(attraction);
  } catch (error) {
    console.error('Error creating attraction:', error);
    res.status(500).json({ error: 'Error creating attraction', details: error instanceof Error ? error.message : error });
  }
});

// --- SHOWS ---
apiRouter.get('/shows', async (req: Request, res: Response) => {
  try {
    const shows = await prisma.show.findMany({
      include: { park: true }
    });
    res.json(shows);
  } catch (error) {
    console.error('Error fetching shows:', error);
    res.status(500).json({ error: 'Error fetching shows', details: error instanceof Error ? error.message : error });
  }
});

apiRouter.post('/shows', async (req: Request, res: Response) => {
  try {
    const show = await prisma.show.create({
      data: req.body
    });
    res.status(201).json(show);
  } catch (error) {
    console.error('Error creating show:', error);
    res.status(500).json({ error: 'Error creating show', details: error instanceof Error ? error.message : error });
  }
});

// --- RESTAURANTS ---
apiRouter.get('/restaurants', async (req: Request, res: Response) => {
  try {
    const restaurants = await prisma.restaurant.findMany({
      include: { park: true }
    });
    res.json(restaurants);
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    res.status(500).json({ error: 'Error fetching restaurants', details: error instanceof Error ? error.message : error });
  }
});

apiRouter.post('/restaurants', async (req: Request, res: Response) => {
  try {
    const restaurant = await prisma.restaurant.create({
      data: req.body
    });
    res.status(201).json(restaurant);
  } catch (error) {
    console.error('Error creating restaurant:', error);
    res.status(500).json({ error: 'Error creating restaurant', details: error instanceof Error ? error.message : error });
  }
});

import recordsRouter from './routes/records';
import tripsRouter from './routes/trips';
import usersRouter from './routes/users';
import friendsRouter from './routes/friends';

// Mount the router under /api
app.use('/api', apiRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);

// Mount auth routes under /api/auth
app.use('/api/auth', authRouter);

// Mount user personal records routes under /api/me
app.use('/api/me', recordsRouter);

// Serve dashboard at root
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server if running locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📁 API explorer available at http://localhost:${PORT}`);
  });
}

// Export for serverless environments (like Vercel)
export default app;
