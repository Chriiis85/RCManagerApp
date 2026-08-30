// Configuración de Prisma 7 para RCManagerAPI
// En Prisma 7, las URLs de conexión van aquí (no en schema.prisma)
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Para migraciones y db push, se usa DIRECT_URL (conexión directa, no pooler)
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
