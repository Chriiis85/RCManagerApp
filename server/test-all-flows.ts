import http from 'http';
import app from './src/index';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = 3847; // Puerto temporal exclusivo para los tests
const JWT_SECRET = process.env.JWT_SECRET || 'rcmanager_super_secret_jwt_key_2024_change_in_production';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  dataSummary?: any;
}

const results: TestResult[] = [];

function request(options: http.RequestOptions, body?: any): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let parsed = rawData;
        try {
          parsed = JSON.parse(rawData);
        } catch {}
        resolve({ status: res.statusCode || 0, data: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Iniciando suite de pruebas de flujo completo para RCManagerApp...\n');
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`[TEST SERVER] Levantado en http://localhost:${PORT}`);
      resolve();
    });
  });

  try {
    // 1. Dashboard Visual (GET /)
    {
      const res = await request({ hostname: 'localhost', port: PORT, path: '/', method: 'GET' });
      const isHtml = typeof res.data === 'string' && res.data.includes('RCManager Dashboard');
      results.push({
        name: '1. Dashboard visual HTML (GET /)',
        passed: res.status === 200 && isHtml,
        details: `Status: ${res.status}, Contiene "RCManager Dashboard": ${isHtml}`
      });
    }

    // 2. Healthcheck API (GET /api)
    {
      const res = await request({ hostname: 'localhost', port: PORT, path: '/api', method: 'GET' });
      const isOk = res.status === 200 && res.data?.status === 'OK';
      results.push({
        name: '2. Healthcheck API (GET /api)',
        passed: isOk,
        details: `Status: ${res.status}, Mensaje: "${res.data?.message}"`
      });
    }

    // 3. Catálogo de Parques (GET /api/parks)
    {
      const res = await request({ hostname: 'localhost', port: PORT, path: '/api/parks', method: 'GET' });
      const isArray = Array.isArray(res.data);
      results.push({
        name: '3. Catálogo de Parques (GET /api/parks)',
        passed: res.status === 200 && isArray,
        details: `Status: ${res.status}, Total parques en BBDD: ${isArray ? res.data.length : 0}`,
        dataSummary: isArray && res.data.length > 0 ? res.data.slice(0, 2).map((p: any) => ({ id: p.id, name: p.name, country: p.country })) : []
      });
    }

    // 4. Catálogo de Coasters (GET /api/coasters)
    {
      const res = await request({ hostname: 'localhost', port: PORT, path: '/api/coasters', method: 'GET' });
      const isArray = Array.isArray(res.data);
      results.push({
        name: '4. Catálogo de Coasters (GET /api/coasters)',
        passed: res.status === 200 && isArray,
        details: `Status: ${res.status}, Total coasters en BBDD: ${isArray ? res.data.length : 0}`,
        dataSummary: isArray && res.data.length > 0 ? res.data.slice(0, 2).map((c: any) => ({ id: c.id, name: c.name, type: c.type })) : []
      });
    }

    // 5. Catálogo de Atracciones (GET /api/attractions)
    {
      const res = await request({ hostname: 'localhost', port: PORT, path: '/api/attractions', method: 'GET' });
      const isArray = Array.isArray(res.data);
      results.push({
        name: '5. Catálogo de Atracciones (GET /api/attractions)',
        passed: res.status === 200 && isArray,
        details: `Status: ${res.status}, Total atracciones en BBDD: ${isArray ? res.data.length : 0}`,
        dataSummary: isArray && res.data.length > 0 ? res.data.slice(0, 2).map((a: any) => ({ id: a.id, name: a.name })) : []
      });
    }

    // 6. Catálogo de Shows (GET /api/shows)
    {
      const res = await request({ hostname: 'localhost', port: PORT, path: '/api/shows', method: 'GET' });
      const isArray = Array.isArray(res.data);
      results.push({
        name: '6. Catálogo de Shows (GET /api/shows)',
        passed: res.status === 200 && isArray,
        details: `Status: ${res.status}, Total shows en BBDD: ${isArray ? res.data.length : 0}`
      });
    }

    // 7. Catálogo de Restaurantes (GET /api/restaurants)
    {
      const res = await request({ hostname: 'localhost', port: PORT, path: '/api/restaurants', method: 'GET' });
      const isArray = Array.isArray(res.data);
      results.push({
        name: '7. Catálogo de Restaurantes (GET /api/restaurants)',
        passed: res.status === 200 && isArray,
        details: `Status: ${res.status}, Total restaurantes en BBDD: ${isArray ? res.data.length : 0}`
      });
    }

    // 8. Seguridad de Auth: Rechazo de credenciales vacías/inválidas
    {
      const loginRes = await request({
        hostname: 'localhost',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        emailOrUsername: '',
        password: ''
      });

      const properlyRejected = loginRes.status === 400;
      results.push({
        name: '8. Seguridad de Auth: Validación de credenciales (POST /api/auth/login)',
        passed: properlyRejected,
        details: `Status: ${loginRes.status}, Mensaje controlado: "${loginRes.data?.error}"`
      });
    }

    // 9. Protección de rutas privadas sin token (401 Unauthorized)
    {
      const resFriends = await request({ hostname: 'localhost', port: PORT, path: '/api/friends', method: 'GET' });
      const resTrips = await request({ hostname: 'localhost', port: PORT, path: '/api/trips', method: 'GET' });
      const resMe = await request({ hostname: 'localhost', port: PORT, path: '/api/me/credits', method: 'GET' });

      const allProtected = resFriends.status === 401 && resTrips.status === 401 && resMe.status === 401;
      results.push({
        name: '9. Protección de rutas privadas sin Token JWT (401)',
        passed: allProtected,
        details: `Friends: ${resFriends.status}, Trips: ${resTrips.status}, Me/Credits: ${resMe.status}`
      });
    }

    // 10. Generar token JWT válido para usuario 8 (existente en Supabase)
    const validToken = jwt.sign({ userId: 8, email: 'krizmoreno85@gmail.com', role: 'USER' }, JWT_SECRET, { expiresIn: '1h' });

    // 10. Verificación de Nombre de Usuario autenticado (GET /api/users/check-username)
    {
      const res = await request({
        hostname: 'localhost',
        port: PORT,
        path: '/api/users/check-username?username=usuario_disponible_para_prueba_99',
        method: 'GET',
        headers: { Authorization: `Bearer ${validToken}` }
      });
      results.push({
        name: '10. Disponibilidad de username (GET /api/users/check-username)',
        passed: res.status === 200 && res.data?.available === true,
        details: `Status: ${res.status}, Disponible: ${res.data?.available}`
      });
    }

    // 11. Endpoint unificado de Amigos con JWT (GET /api/friends)
    {
      const resFriends = await request({
        hostname: 'localhost',
        port: PORT,
        path: '/api/friends',
        method: 'GET',
        headers: { Authorization: `Bearer ${validToken}` }
      });

      const isArray = Array.isArray(resFriends.data);
      results.push({
        name: '11. Endpoint unificado de Amigos con JWT (GET /api/friends)',
        passed: resFriends.status === 200 && isArray,
        details: `Status: ${resFriends.status}, Amigos recuperados para usuario 8: ${isArray ? resFriends.data.length : 0}`,
        dataSummary: isArray && resFriends.data.length > 0 ? resFriends.data[0] : null
      });
    }

    // 12. Endpoint de Viajes con JWT (GET /api/trips)
    {
      const resTrips = await request({
        hostname: 'localhost',
        port: PORT,
        path: '/api/trips',
        method: 'GET',
        headers: { Authorization: `Bearer ${validToken}` }
      });
      results.push({
        name: '12. Endpoint de Viajes con JWT (GET /api/trips)',
        passed: resTrips.status === 200 && Array.isArray(resTrips.data),
        details: `Status: ${resTrips.status}, Total viajes recuperados: ${Array.isArray(resTrips.data) ? resTrips.data.length : 0}`
      });
    }

    // 13. Endpoint de Créditos Personales con JWT (GET /api/me/credits)
    {
      const resRecords = await request({
        hostname: 'localhost',
        port: PORT,
        path: '/api/me/credits',
        method: 'GET',
        headers: { Authorization: `Bearer ${validToken}` }
      });
      const isArray = Array.isArray(resRecords.data);
      results.push({
        name: '13. Endpoint de Créditos Personales con JWT (GET /api/me/credits)',
        passed: resRecords.status === 200 && isArray,
        details: `Status: ${resRecords.status}, Total créditos del usuario: ${isArray ? resRecords.data.length : 0}`
      });
    }

  } catch (err: any) {
    console.error('Error durante la ejecución de las pruebas:', err);
  } finally {
    server.close();
  }

  console.log('\n================ RESUMEN DE PRUEBAS ================');
  let passedCount = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
    console.log(`   -> ${r.details}`);
    if (r.dataSummary) {
      console.log(`   -> Muestra: ${JSON.stringify(r.dataSummary)}`);
    }
    if (r.passed) passedCount++;
  }
  console.log('====================================================');
  console.log(`TOTAL: ${passedCount} / ${results.length} pruebas superadas (${Math.round((passedCount / results.length) * 100)}%)\n`);
}

runTests();
