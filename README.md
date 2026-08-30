# 🎢 RCManagerApp (Monorepo)

Proyecto unificado de **RCManager**: la plataforma definitiva para entusiastas de los parques temáticos y montañas rusas.

Este repositorio combina en un único monorepo el frontend y el backend para un desarrollo ágil, tipado coherente y base de datos centralizada.

---

## 📁 Estructura del Proyecto

```text
RCManagerApp/
├── client/              # Frontend (Angular 21 + Tailwind CSS)
│   ├── src/             # Componentes, servicios, guards y páginas
│   ├── angular.json
│   └── package.json
│
├── server/              # Backend (Express + TypeScript + Prisma ORM)
│   ├── src/             # Endpoints REST, autenticación, correo y middlewares
│   ├── prisma/          # Esquema de BBDD PostgreSQL (Supabase)
│   └── package.json
│
├── package.json         # Configuración del monorepo (npm workspaces)
└── README.md
```

---

## 🚀 Puesta en Marcha en Local

### 1. Instalación de dependencias
Desde la raíz del proyecto, ejecuta:
```bash
npm install
```
*(Esto instalará automáticamente las dependencias de `client` y `server` gracias a los npm workspaces).*

### 2. Variables de Entorno
Copia el archivo de ejemplo en el servidor:
```bash
cp server/.env.example server/.env
```
Y añade tus credenciales de Supabase, JWT y SMTP.

### 3. Generar cliente de Prisma
```bash
npm run postinstall
```

### 4. Arrancar en Modo Desarrollo (Frontend + Backend)
Con un solo comando arrancas ambos entornos a la vez:
```bash
npm run dev
```

- **Frontend (Angular):** [http://localhost:4200](http://localhost:4200)
- **Backend API (Express):** [http://localhost:3001](http://localhost:3001)

---

## 🛠️ Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Arranca `client` y `server` simultáneamente con logs diferenciados |
| `npm run dev:client` | Arranca solo el frontend en modo desarrollo |
| `npm run dev:server` | Arranca solo la API Express con recarga automática |
| `npm run build` | Compila tanto el backend como el frontend para producción |
| `npm run build:client` | Compila la aplicación Angular en `client/dist/` |
| `npm run build:server` | Genera el cliente de Prisma para el servidor |
