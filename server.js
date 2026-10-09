/* ==========================================================================
   OpenTheDoor - SERVER (Node.js + Express + Socket.IO WebSockets + PostgreSQL)
   Control de Acceso Inteligente por Puertas & Zonas Asignadas
   ========================================================================== */

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

// Connection String de PostgreSQL
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:DqNiRwlZxgkHwHKSNCKlnoPGqGOcmhVY@tokaido.proxy.rlwy.net:44633/railway';

// Pool de conexiones a PostgreSQL con SSL flexible
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Capturar errores imprevistos en el pool de Postgres sin tumbar el servidor Node.js
pool.on('error', (err) => {
  console.error('⚠️ Error inesperado en el pool de PostgreSQL:', err.message);
});

// Configuración de CORS y Socket.IO para Railway + Vercel
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

const PORT = process.env.PORT || 8080;

// --- CONFIGURACIÓN DEL EVENTO ÚNICO (600 PUESTOS / 60 MESAS) ---
const TOTAL_CAPACITY = 600;
const LOCK_TIME_MS = 5 * 60 * 1000; // 5 Minutos (Temporizador de Reserva)

const EVENT_INFO = {
  id: "EVT-OPENDOOR-01",
  title: "Gran Gala & Concierto Exclusivo - Reserva de Mesas",
  date: "2026-11-28T20:00",
  venue: "Gran Salón Real & Arena 360°",
  address: "Centro de Convenciones & Eventos Metropolitan, Bogotá",
  image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&auto=format&fit=crop&q=80",
  category: "Concierto & Gala",
  totalCapacity: TOTAL_CAPACITY,
  minAge: "+18 años",
  doorsOpen: "18:30 hs",
  parking: "Parqueadero privado con servicio de valet parking",
  announcement: "Apertura de puertas a las 18:30 hs. Presentar comprobante digital con código QR para validación por cámara en puerta asignada.",
  zones: {
    DIAMOND: {
      name: "Zona Diamond",
      price: 100000,
      start: 'A',
      end: 'B',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalSeats: 100,
      color: "indigo",
      door: "Puerta 1 - Acceso VIP & Diamond"
    },
    GOLD: {
      name: "Zona Gold",
      price: 70000,
      start: 'C',
      end: 'H',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalSeats: 300,
      color: "amber",
      door: "Puerta 2 - Acceso Preferencial Gold"
    },
    SILVER: {
      name: "Zona Silver",
      price: 40000,
      start: 'I',
      end: 'L',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalSeats: 200,
      color: "slate",
      door: "Puerta 3 - Acceso General Silver"
    }
  }
};

function getSeatZone(seatId) {
  if (!seatId) return 'SILVER';
  const letter = seatId.charAt(0).toUpperCase();
  if (letter >= 'A' && letter <= 'B') return 'DIAMOND';
  if (letter >= 'C' && letter <= 'H') return 'GOLD';
  return 'SILVER';
}

function getZoneDoorInfo(zoneKey) {
  const mapping = {
    DIAMOND: { door: "Puerta 1 - Acceso VIP & Diamond", name: "Zona Diamond VIP", color: "indigo" },
    GOLD: { door: "Puerta 2 - Acceso Preferencial Gold", name: "Zona Gold Preferencial", color: "amber" },
    SILVER: { door: "Puerta 3 - Acceso General Silver", name: "Zona Silver General", color: "slate" }
  };
  return mapping[zoneKey] || mapping.SILVER;
}

// --- CREDENCIALES DE ADMINISTRADORES ---
const ADMIN_USERS = [
  { username: 'admin', password: 'admin123password', name: 'Carlos Mendoza (Admin)', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', isSuperAdmin: true },
  { username: 'admindos', password: 'emhotelsadmin31', name: 'Andrés Morales (Admin)', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', isSuperAdmin: true }
];

// --- ESTADO EN MEMORIA ---
let seatsState = {};       // seatId -> { status: 'available'|'locked'|'sold', userId, expiresAt }
let salesHistory = [];     // Array de compras realizadas
let staffUsers = [];       // Array de personal staff
let adminSessions = {};    // token -> username
const activeTimers = {};   // seatId -> setTimeout

// --- INICIALIZACIÓN DE TABLAS EN POSTGRESQL ---
async function initDb() {
  try {
    // 1. Tabla Ventas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_history (
        id_pedido VARCHAR(50) PRIMARY KEY,
        codigo_compra VARCHAR(50) UNIQUE NOT NULL,
        cliente VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        telefono VARCHAR(50),
        num_entradas INT NOT NULL,
        puestos JSONB NOT NULL,
        zonas JSONB NOT NULL,
        zona_nombre VARCHAR(100),
        puerta_sugerida VARCHAR(100),
        total NUMERIC(12, 2) NOT NULL,
        metodo_pago VARCHAR(100),
        comprobante_ref VARCHAR(100),
        fecha_hora VARCHAR(100),
        usado BOOLEAN DEFAULT FALSE,
        escaneado_por VARCHAR(100),
        fecha_escaneo VARCHAR(100),
        estado_pago VARCHAR
