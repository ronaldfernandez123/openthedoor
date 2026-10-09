/* ==========================================================================
   OpenTheDoor - SERVER (Node.js + Express + Socket.IO WebSockets + PostgreSQL)
   Control de Acceso Inteligente por Puertas & Zonas Asignadas
   ========================================================================== */

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

// Connection String de PostgreSQL
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:DqNiRwlZxgkHwHKSNCKlnoPGqGOcmhVY@tokaido.proxy.rlwy.net:44633/railway';

// Pool de conexiones a PostgreSQL
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Configuración de CORS y Socket.IO
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
const LOCK_TIME_MS = 5 * 60 * 1000; // 5 Minutos

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

// --- ESTADO EN MEMORIA Y TIMERS ---
let seatsState = {};       // seatId -> { status: 'available'|'locked'|'sold', userId, expiresAt }
let salesHistory = [];     // Array de compras realizadas
let staffUsers = [];       // Validadores cargados desde PostgreSQL
let adminSessions = {};    // token -> username
const activeTimers = {};   // seatId -> setTimeout

// --- INICIALIZACIÓN Y TABLAS EN POSTGRESQL ---
async function initDb() {
  try {
    // 1. Tabla Historial de Ventas
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
        estado_pago VARCHAR(50) DEFAULT 'APROBADO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabla Personal Staff
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_users (
        id VARCHAR(50) PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        apellido VARCHAR(100) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        door VARCHAR(255) NOT NULL,
        allowed_zones JSONB NOT NULL,
        avatar TEXT,
        fecha_creacion VARCHAR(50)
      );
    `);

    // 3. Tabla Estado de Sillas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seats_state (
        seat_id VARCHAR(20) PRIMARY KEY,
        status VARCHAR(20) NOT NULL,
        user_id VARCHAR(100),
        buyer VARCHAR(255),
        expires_at BIGINT
      );
    `);

    console.log('✅ Tablas verificadas/creadas exitosamente en PostgreSQL');

    // Poblar staff inicial si la tabla está vacía
    const staffRes = await pool.query('SELECT COUNT(*) FROM staff_users');
    if (parseInt(staffRes.rows[0].count) === 0) {
      const initialStaff = [
        { id: "STF-001", nombre: "Mateo", apellido: "Rivas", username: "puerta1", password: "puerta123password", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80", door: "Puerta 1 - Acceso VIP & Diamond", allowedZones: JSON.stringify(["DIAMOND"]), fechaCreacion: "08/10/2026" },
        { id: "STF-002", nombre: "Laura", apellido: "Castro", username: "puerta2", password: "puerta123password", avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80", door: "Puerta 2 - Acceso Preferencial Gold", allowedZones: JSON.stringify(["GOLD"]), fechaCreacion: "08/10/2026" },
        { id: "STF-003", nombre: "Julián", apellido: "Pérez", username: "puerta3", password: "puerta123password", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80", door: "Puerta 3 - Acceso General Silver", allowedZones: JSON.stringify(["SILVER"]), fechaCreacion: "08/10/2026" }
      ];

      for (const st of initialStaff) {
        await pool.query(
          `INSERT INTO staff_users (id, nombre, apellido, username, password, door, allowed_zones, avatar, fecha_creacion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [st.id, st.nombre, st.apellido, st.username, st.password, st.door, st.allowedZones, st.avatar, st.fechaCreacion]
        );
      }
      console.log('⚡ Personal Staff por defecto insertado en PostgreSQL');
    }

    await cargarDatosDesdeDb();
  } catch (err) {
    console.error('❌ Error inicializando PostgreSQL:', err);
  }
}

// Cargar datos de la BD a memoria al encender
async function cargarDatosDesdeDb() {
  try {
    // Cargar Ventas
    const salesRes = await pool.query('SELECT * FROM sales_history ORDER BY created_at ASC');
    salesHistory = salesRes.rows.map(r => ({
      idPedido: r.id_pedido,
      codigoCompra: r.codigo_compra,
      cliente: r.cliente,
      email: r.email,
      telefono: r.telefono,
      numEntradas: r.num_entradas,
      puestos: typeof r.puestos === 'string' ? JSON.parse(r.puestos) : r.puestos,
      zonas: typeof r.zonas === 'string' ? JSON.parse(r.zonas) : r.zonas,
      zonaNombre: r.zona_nombre,
      puertaSugerida: r.puerta_sugerida,
      total: Number(r.total),
      metodoPago: r.metodo_pago,
      comprobanteRef: r.comprobante_ref,
      fechaHora: r.fecha_hora,
      usado: r.usado,
      escaneadoPor: r.escaneado_por,
      fechaEscaneo: r.fecha_escaneo,
      estadoPago: r.estado_pago
    }));

    // Cargar Staff
    const staffRes = await pool.query('SELECT * FROM staff_users ORDER BY fecha_creacion ASC');
    staffUsers = staffRes.rows.map(r => ({
      id: r.id,
      nombre: r.nombre,
      apellido: r.apellido,
      username: r.username,
      password: r.password,
      door: r.door,
      allowedZones: typeof r.allowed_zones === 'string' ? JSON.parse(r.allowed_zones) : r.allowed_zones,
      avatar: r.avatar,
      fechaCreacion: r.fecha_creacion
    }));

    // Cargar Estado de Sillas Vendidas
    seatsState = {};
    salesHistory.forEach(v => {
      if (Array.isArray(v.puestos)) {
        v.puestos.forEach(id => { seatsState[id] = { status: 'sold', buyer: v.cliente }; });
      }
    });

    console.log(`✅ Datos sincronizados con PostgreSQL: ${salesHistory.length} ventas y ${staffUsers.length} validadores staff.`);
  } catch (err) {
    console.error('❌ Error leyendo datos desde PostgreSQL:', err);
  }
}

initDb();

function adminPayload() {
  return {
    sales: salesHistory,
    staffList: staffUsers,
    totalCapacity: TOTAL_CAPACITY,
    seatsState,
    eventInfo: EVENT_INFO
  };
}

function broadcastAdminData() {
  io.to('admins').emit('ADMIN_DATA', adminPayload());
}

function isAdmin(socket) {
  return socket.data.admin === true;
}

// --- MIDDLEWARES & ARCHIVOS ESTÁTICOS ---
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

const indexPath = path.join(__dirname, 'index.html');
app.use(express.static(__dirname, { etag: false, maxAge: 0 }));

// --- RUTAS API REST ---
app.get('/', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      status: 'online',
      message: 'Servidor Backend de OpenTheDoor activo en Railway con PostgreSQL',
      health: '/api/health'
    });
  }
});

app.get('/api/health', (req, res) => {
  const soldCount = Object.values(seatsState).filter(s => s.status === 'sold').length;
  res.json({
    status: 'ok',
    database: 'PostgreSQL Conectado',
    project: 'OpenTheDoor',
    version: '2.0.0',
    eventName: EVENT_INFO.title,
    totalCapacity: TOTAL_CAPACITY,
    soldCount,
    occupancyPercent: ((soldCount / TOTAL_CAPACITY) * 100).toFixed(1) + '%',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/state', (req, res) => {
  res.json({
    seatsState,
    salesHistory: req.query.includeSales === 'true' ? salesHistory : undefined,
    eventInfo: EVENT_INFO
  });
});

app.post('/api/reset', async (req, res) => {
  try {
    seatsState = {};
    salesHistory = [];
    adminSessions = {};
    Object.keys(activeTimers).forEach(id => {
      clearTimeout(activeTimers[id]);
      delete activeTimers[id];
    });

    await pool.query('DELETE FROM sales_history');
    await pool.query('DELETE FROM seats_state');

    io.emit('MAP_STATE', seatsState);
    broadcastAdminData();
    res.json({ success: true, message: 'Base de datos en PostgreSQL restablecida a cero.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- WEBSOCKETS EN TIEMPO REAL (SOCKET.IO) ---
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  socket.emit('MAP_STATE', seatsState);
  socket.emit('EVENT_INFO', EVENT_INFO);

  socket.on('GET_MAP_STATE', () => {
    socket.emit('MAP_STATE', seatsState);
  });

  // 1. BLOQUEO TEMPORAL DE ENTRADAS / SILLAS (5 MINUTOS)
  socket.on('LOCK_SEATS', ({ seatIds }) => {
    if (!Array.isArray(seatIds) || seatIds.length === 0) return;

    const allAvailable = seatIds.every(id => !seatsState[id] || seatsState[id].status === 'available');

    if (!allAvailable) {
      socket.emit('LOCK_FAILED', { message: 'Una o más sillas seleccionadas ya han sido tomadas por otro usuario.' });
      return;
    }

    const expiresAt = Date.now() + LOCK_TIME_MS;
    seatIds.forEach(seatId => {
      seatsState[seatId] = { status: 'locked', userId: socket.id, expiresAt };
      if (activeTimers[seatId]) clearTimeout(activeTimers[seatId]);

      activeTimers[seatId] = setTimeout(() => {
        if (seatsState[seatId] && seatsState[seatId].status === 'locked' && seatsState[seatId].userId === socket.id) {
          delete seatsState[seatId];
          delete activeTimers[seatId];
          io.emit('SEATS_RELEASED', { seatIds: [seatId] });
        }
      }, LOCK_TIME_MS);
    });

    io.emit('SEATS_LOCKED', { seatIds, userId: socket.id, expiresAt });
  });

  // 2. DESBLOQUEO MANUAL DE SILLAS
  socket.on('UNLOCK_SEATS', ({ seatIds }) => {
    if (!Array.isArray(seatIds)) return;
    const unlocked = [];

    seatIds.forEach(seatId => {
      const s = seatsState[seatId];
      if (s && s.status === 'locked' && s.userId === socket.id) {
        delete seatsState[seatId];
        if (activeTimers[seatId]) {
          clearTimeout(activeTimers[seatId]);
          delete activeTimers[seatId];
        }
        unlocked.push(seatId);
      }
    });

    if (unlocked.length > 0) {
      io.emit('SEATS_RELEASED', { seatIds: unlocked });
    }
  });

  // 3. CONFIRMAR COMPRA / GUARDAR EN POSTGRESQL
  socket.on('CONFIRM_PURCHASE', async (datosCompra) => {
    const seatIds = datosCompra && datosCompra.seatIds;
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      socket.emit('PURCHASE_FAILED', { message: 'No se enviaron puestos válidos.' });
      return;
    }

    const valid = seatIds.every(id => {
      const s = seatsState[id];
      return s && s.status === 'locked' && s.userId === socket.id;
    });

    if (!valid) {
      socket.emit('PURCHASE_FAILED', {
        message: 'Tu tiempo de reserva expiró o las sillas ya no están disponibles. Vuelve a seleccionarlas en el mapa.'
      });
      return;
    }

    seatIds.forEach(seatId => {
      if (activeTimers[seatId]) {
        clearTimeout(activeTimers[seatId]);
        delete activeTimers[seatId];
      }
      seatsState[seatId] = { status: 'sold', buyer: datosCompra.cliente };
    });

    const seatZones = [...new Set(seatIds.map(id => getSeatZone(id)))];
    const primaryZone = seatZones[0] || 'SILVER';
    const doorInfo = getZoneDoorInfo(primaryZone);

    const nuevaVenta = {
      idPedido: datosCompra.idPedido || `ORD-${Date.now().toString().slice(-6)}`,
      codigoCompra: datosCompra.codigoCompra || `OPN-${Math.floor(100000 + Math.random() * 900000)}`,
      cliente: datosCompra.cliente || "Cliente Oficial",
      email: datosCompra.email ? String(datosCompra.email).toLowerCase() : null,
      telefono: datosCompra.telefono || "",
      numEntradas: seatIds.length,
      puestos: seatIds,
      zonas: seatZones,
      zonaNombre: doorInfo.name,
      puertaSugerida: doorInfo.door,
      total: datosCompra.total || 0,
      metodoPago: datosCompra.metodoPago || "Transferencia Bancolombia",
      comprobanteRef: datosCompra.comprobanteRef || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      fechaHora: datosCompra.fechaHora || new Date().toLocaleString('es-CO'),
      usado: false,
      escaneadoPor: null,
      fechaEscaneo: null,
      estadoPago: datosCompra.estadoPago || "APROBADO"
    };

    try {
      // Guardar en PostgreSQL
      await pool.query(`
        INSERT INTO sales_history 
        (id_pedido, codigo_compra, cliente, email, telefono, num_entradas, puestos, zonas, zona_nombre, puerta_sugerida, total, metodo_pago, comprobante_ref, fecha_hora, usado, estado_pago)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        nuevaVenta.idPedido,
        nuevaVenta.codigoCompra,
        nuevaVenta.cliente,
        nuevaVenta.email,
        nuevaVenta.telefono,
        nuevaVenta.numEntradas,
        JSON.stringify(nuevaVenta.puestos),
        JSON.stringify(nuevaVenta.zonas),
        nuevaVenta.zonaNombre,
        nuevaVenta.puertaSugerida,
        nuevaVenta.total,
        nuevaVenta.metodoPago,
        nuevaVenta.comprobanteRef,
        nuevaVenta.fechaHora,
        nuevaVenta.usado,
        nuevaVenta.estadoPago
      ]);

      salesHistory.push(nuevaVenta);

      socket.emit('PURCHASE_OK', nuevaVenta);
      io.emit('SEATS_SOLD', { seatIds, venta: nuevaVenta });
      broadcastAdminData();
    } catch (err) {
      console.error('❌ Error guardando compra en PostgreSQL:', err);
      socket.emit('PURCHASE_FAILED', { message: 'Error procesando la transacción en la base de datos.' });
    }
  });

  // 4. CONSULTAR ENTRADAS DEL CLIENTE
  socket.on('GET_USER_TICKETS', ({ cliente, email }) => {
    const mail = email ? String(email).toLowerCase() : null;
    const clientClean = cliente ? String(cliente).toLowerCase().trim() : null;

    const tickets = salesHistory.filter(v =>
      (mail && v.email === mail) ||
      (clientClean && v.cliente && v.cliente.toLowerCase().trim() === clientClean)
    );
    socket.emit('USER_TICKETS_RESPONSE', tickets);
  });

  // 5. LOGIN ADMINISTRADOR
  socket.on('ADMIN_LOGIN', ({ username, password }) => {
    const foundAdmin = ADMIN_USERS.find(a => a.username === username && a.password === password);
    if (!foundAdmin) {
      socket.emit('ADMIN_AUTH_FAILED', { message: 'Credenciales de Administrador incorrectas.' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    adminSessions[token] = foundAdmin.username;

    socket.data.admin = true;
    socket.data.adminUser = foundAdmin.username;
    socket.join('admins');
    socket.emit('ADMIN_AUTH_SUCCESS', {
      username: foundAdmin.username,
      name: foundAdmin.name,
      avatar: foundAdmin.avatar,
      token,
      ...adminPayload()
    });
  });

  socket.on('ADMIN_RESUME', ({ token }) => {
    const username = adminSessions[token];
    if (!username) {
      socket.emit('ADMIN_SESSION_INVALID');
      return;
    }
    const adminObj = ADMIN_USERS.find(a => a.username === username) || { username, name: username, avatar: '' };
    socket.data.admin = true;
    socket.data.adminUser = username;
    socket.join('admins');
    socket.emit('ADMIN_RESUMED', {
      username,
      name: adminObj.name,
      avatar: adminObj.avatar,
      ...adminPayload()
    });
  });

  socket.on('ADMIN_LOGOUT', ({ token }) => {
    if (token && adminSessions[token]) {
      delete adminSessions[token];
    }
    socket.data.admin = false;
    socket.leave('admins');
  });

  // 6. LOGIN STAFF / VALIDADOR
  socket.on('STAFF_LOGIN', ({ username, password }) => {
    const foundStaff = staffUsers.find(s => s.username === username && s.password === password);
    if (foundStaff) {
      socket.emit('STAFF_AUTH_SUCCESS', foundStaff);
    } else {
      socket.emit('STAFF_AUTH_FAILED', { message: 'Credenciales de Staff / Validador incorrectas o no encontradas.' });
    }
  });

  // 7. CREAR / ELIMINAR STAFF (ADMIN)
  socket.on('CREATE_STAFF', async (staffData) => {
    if (!isAdmin(socket)) {
      socket.emit('ADMIN_SESSION_INVALID');
      return;
    }

    let allowedZones = Array.isArray(staffData.allowedZones) ? staffData.allowedZones : [];
    if (allowedZones.length === 0) {
      const doorLower = (staffData.door || '').toLowerCase();
      if (doorLower.includes('diamond') || doorLower.includes('1') || doorLower.includes('vip')) {
        allowedZones = ['DIAMOND'];
      } else if (doorLower.includes('gold') || doorLower.includes('2')) {
        allowedZones = ['GOLD'];
      } else if (doorLower.includes('silver') || doorLower.includes('3')) {
        allowedZones = ['SILVER'];
      } else {
        allowedZones = ['ALL'];
      }
    }

    const nuevoStaff = {
      id: 'STF-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      nombre: staffData.nombre,
      apellido: staffData.apellido,
      username: staffData.username,
      password: staffData.password,
      door: staffData.door || "Puerta 1 - Acceso VIP & Diamond",
      allowedZones,
      avatar: staffData.avatar || "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80",
      fechaCreacion: new Date().toLocaleDateString('es-CO')
    };

    try {
      await pool.query(`
        INSERT INTO staff_users (id, nombre, apellido, username, password, door, allowed_zones, avatar, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        nuevoStaff.id,
        nuevoStaff.nombre,
        nuevoStaff.apellido,
        nuevoStaff.username,
        nuevoStaff.password,
        nuevoStaff.door,
        JSON.stringify(nuevoStaff.allowedZones),
        nuevoStaff.avatar,
        nuevoStaff.fechaCreacion
      ]);

      staffUsers.push(nuevoStaff);
      broadcastAdminData();
      socket.emit('STAFF_CREATED_SUCCESS', nuevoStaff);
    } catch (err) {
      console.error('❌ Error creando staff en PostgreSQL:', err);
    }
  });

  socket.on('DELETE_STAFF', async ({ staffId }) => {
    if (!isAdmin(socket)) {
      socket.emit('ADMIN_SESSION_INVALID');
      return;
    }
    try {
      await pool.query('DELETE FROM staff_users WHERE id = $1', [staffId]);
      staffUsers = staffUsers.filter(s => s.id !== staffId);
      broadcastAdminData();
    } catch (err) {
      console.error('❌ Error eliminando staff en PostgreSQL:', err);
    }
  });

  // 8. ELIMINAR BOLETA VENDIDA (ADMIN)
  socket.on('DELETE_TICKET', async ({ codigoCompra }) => {
    if (!isAdmin(socket)) {
      socket.emit('ADMIN_SESSION_INVALID');
      return;
    }
    const index = salesHistory.findIndex(v => v.codigoCompra === codigoCompra);
    if (index === -1) return;

    const ticket = salesHistory[index];
    try {
      await pool.query('DELETE FROM sales_history WHERE codigo_compra = $1', [codigoCompra]);

      if (Array.isArray(ticket.puestos)) {
        ticket.puestos.forEach(seatId => {
          delete seatsState[seatId];
          if (activeTimers[seatId]) {
            clearTimeout(activeTimers[seatId]);
            delete activeTimers[seatId];
          }
        });
      }
      salesHistory.splice(index, 1);

      io.emit('SEATS_RELEASED', { seatIds: ticket.puestos });
      broadcastAdminData();
    } catch (err) {
      console.error('❌ Error eliminando ticket en PostgreSQL:', err);
    }
  });

  // 9. VALIDACIÓN QR ESTRICTA POR PUERTA Y ZONA (STAFF Y ADMIN)
  socket.on('VALIDATE_TICKET', async ({ codigo, staffUsername, isRoleAdmin }) => {
    const cleanCode = (codigo || '').trim();
    const venta = salesHistory.find(v => v.codigoCompra === cleanCode || v.idPedido === cleanCode);

    if (!venta) {
      socket.emit('VALIDATION_RESULT', {
        status: 'INVALID',
        message: '❌ CÓDIGO NO ENCONTRADO',
        detail: `El código "${cleanCode}" no existe en la base de datos oficial o es inválido.`
      });
      return;
    }

    const ticketZones = venta.zonas || [...new Set((venta.puestos || []).map(id => getSeatZone(id)))];
    const correctDoor = venta.puertaSugerida || getZoneDoorInfo(ticketZones[0] || 'SILVER').door;
    const zonaNombre = venta.zonaNombre || getZoneDoorInfo(ticketZones[0] || 'SILVER').name;

    const socketIsAdmin = isAdmin(socket) || isRoleAdmin === true;

    if (!socketIsAdmin) {
      const staff = staffUsers.find(s => s.username === staffUsername) || { door: "Puerta Asignada", allowedZones: [] };
      let allowedZones = staff.allowedZones || [];

      if (!allowedZones || allowedZones.length === 0) {
        const dLower = (staff.door || '').toLowerCase();
        if (dLower.includes('diamond') || dLower.includes('1') || dLower.includes('vip')) allowedZones = ['DIAMOND'];
        else if (dLower.includes('gold') || dLower.includes('2')) allowedZones = ['GOLD'];
        else if (dLower.includes('silver') || dLower.includes('3')) allowedZones = ['SILVER'];
        else allowedZones = ['ALL'];
      }

      const hasAccess = allowedZones.includes('ALL') || ticketZones.some(z => allowedZones.includes(z));

      if (!hasAccess) {
        socket.emit('VALIDATION_RESULT', {
          status: 'WRONG_DOOR',
          message: '🚫 ¡ACCESO DENEGADO EN ESTA PUERTA!',
          detail: `Este puesto de control es "${staff.door}". Esta entrada pertenece a "${zonaNombre}" (Puestos: ${venta.puestos.join(', ')}).\n\n👉 El asistente DEBE DIRIGIRSE A: "${correctDoor}" para ingresar.`,
          correctDoor,
          staffDoor: staff.door,
          zonaNombre,
          venta
        });
        return;
      }
    }

    if (venta.usado) {
      socket.emit('VALIDATION_RESULT', {
        status: 'USED',
        message: '⚠️ ¡ALERTA! ENTRADA YA FUE UTILIZADA',
        detail: `Esta entrada ya fue registrada previamente por ${venta.escaneadoPor || 'Validador'} a las ${venta.fechaEscaneo || 'N/D'}.`,
        venta
      });
      return;
    }

    venta.usado = true;
    venta.escaneadoPor = socketIsAdmin ? 'Administrador (Pase Total)' : `${staffUsername || 'Validador Oficial'}`;
    venta.fechaEscaneo = new Date().toLocaleString('es-CO');

    try {
      await pool.query(`
        UPDATE sales_history 
        SET usado = TRUE, escaneado_por = $1, fecha_escaneo = $2 
        WHERE codigo_compra = $3 OR id_pedido = $3
      `, [venta.escaneadoPor, venta.fechaEscaneo, cleanCode]);

      socket.emit('VALIDATION_RESULT', {
        status: 'VALID',
        message: '✅ ENTRADA VÁLIDA - ¡ACCESO PERMITIDO!',
        detail: `Cliente: ${venta.cliente} | Puestos: ${venta.puestos.join(', ')} | ${zonaNombre} (${correctDoor})`,
        venta
      });
      broadcastAdminData();
    } catch (err) {
      console.error('❌ Error actualizando escaneo en PostgreSQL:', err);
    }
  });

  // 10. DESCONEXIÓN DEL CLIENTE
  socket.on('disconnect', () => {
    const released = [];
    Object.keys(seatsState).forEach(seatId => {
      const s = seatsState[seatId];
      if (s.status === 'locked' && s.userId === socket.id) {
        delete seatsState[seatId];
        if (activeTimers[seatId]) {
          clearTimeout(activeTimers[seatId]);
          delete activeTimers[seatId];
        }
        released.push(seatId);
      }
    });
    if (released.length > 0) {
      io.emit('SEATS_RELEASED', { seatIds: released });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ========================================================================
  🚀 OpenTheDoor - Servidor con PostgreSQL Conectado
  ========================================================================
  📍 Puerto Activo:     ${PORT}
  📍 Bind Address:      0.0.0.0
  📍 Evento Único:      ${EVENT_INFO.title} (Aforo: ${TOTAL_CAPACITY} puestos)
  📍 Base de Datos:     PostgreSQL (Railway Tokaido Proxy)
  ========================================================================
  `);
});
