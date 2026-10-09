/* ==========================================================================
   OpenTheDoor - CONFIG (Configuración Central del Evento Único y Semillas)
   ========================================================================== */

const STORAGE_KEY = 'openthedoor_v2_data';

// ⚠️ REEMPLAZA ESTA URL POR TU DOMINIO REAL DE RAILWAY
const RAILWAY_BACKEND_URL = "https://TU-PROYECTO.up.railway.app";

// Detecta si estás probando localmente o en producción (Vercel)
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const SOCKET_SERVER_URL = isLocal ? 'openthedoor-production.up.railway.app' : RAILWAY_BACKEND_URL;

// Inicialización global de Socket.IO
const socket = io(SOCKET_SERVER_URL, {
  transports: [ 'polling','websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000
});

socket.on('connect', () => {
  console.log('✅ Conectado exitosamente al Backend en Railway:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Error de conexión con Socket.IO:', error.message);
});

socket.on('disconnect', (reason) => {
  console.warn('⚠️ Desconectado del servidor:', reason);
});

const EVENT_CONFIG = {
  id: "EVT-OPENDOOR-01",
  title: "Gran Gala & Concierto Exclusivo - Reserva de Mesas",
  subtitle: "Experiencia VIP en Vivo con Selección Interactiva de Mesas y Sillas Circulares",
  date: "2026-11-28T20:00",
  venue: "Gran Salón Real & Arena 360°",
  address: "Centro de Convenciones & Eventos Metropolitan, Bogotá",
  image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&auto=format&fit=crop&q=80",
  category: "Concierto & Gala",
  totalCapacity: 600,
  minAge: "+18 años",
  doorsOpen: "18:30 hs",
  parking: "Parqueadero privado con servicio de valet parking",
  announcement: "Apertura de puertas a las 18:30 hs. Presentar comprobante digital con código QR para validación por cámara en puerta.",
  prices: {
    DIAMOND: 100000,
    GOLD: 70000,
    SILVER: 40000
  },
  zones: {
    DIAMOND: {
      key: "DIAMOND",
      name: "Zona Diamond",
      price: 100000,
      start: 'A',
      end: 'B',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalTables: 10,
      totalSeats: 100,
      badgeColor: "bg-indigo-600 text-white",
      borderColor: "border-indigo-500",
      description: "Mesas frontales A1 a B5 en primera fila frente al escenario principal."
    },
    GOLD: {
      key: "GOLD",
      name: "Zona Gold",
      price: 70000,
      start: 'C',
      end: 'H',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalTables: 30,
      totalSeats: 300,
      badgeColor: "bg-amber-500 text-slate-900",
      borderColor: "border-amber-400",
      description: "Mesas centrales C1 a H5 con vista preferencial y acústica envolvente."
    },
    SILVER: {
      key: "SILVER",
      name: "Zona Silver",
      price: 40000,
      start: 'I',
      end: 'L',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalTables: 20,
      totalSeats: 200,
      badgeColor: "bg-slate-500 text-white",
      borderColor: "border-slate-400",
      description: "Mesas posteriores I1 a L5 con acceso rápido a barras y lounge."
    }
  }
};

const BANK_CONFIG = {
  bancolombiaTitular: "OpenTheDoor Boletería S.A.S.",
  bancolombiaAccount: "530-691390-10",
  bancolombiaType: "Cuenta de Ahorros",
  nequiTitular: "OpenTheDoor Boletería S.A.S.",
  nequiPhone: "310 987 6543",
  adminWhatsApp: "3109876543",
  qrImageUrl: "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=Bancolombia%20Ahorros%2053069139010",
  instructions: "Realiza tu transferencia por el monto exacto y adjunta el número de comprobante o referencia en el checkout."
};
