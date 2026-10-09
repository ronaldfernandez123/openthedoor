/* ==========================================================================
   OpenTheDoor - SERVER (Node.js + Express + Socket.IO WebSockets)
   Control de Acceso Inteligente por Puertas & Zonas Asignadas
   ========================================================================== */

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const path = require('path');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
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
let staffUsers = [         // Validadores con puertas y zonas asignadas
  {
    id: "STF-001",
    nombre: "Mateo",
    apellido: "Rivas",
    username: "puerta1",
    password: "puerta123password",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    door: "Puerta 1 - Acceso VIP & Diamond",
    allowedZones: ["DIAMOND"],
    fechaCreacion: "08/10/2026"
  },
  {
    id: "STF-002",
    nombre: "Laura",
    apellido: "Castro",
    username: "puerta2",
    password: "puerta123password",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    door: "Puerta 2 - Acceso Preferencial Gold",
    allowedZones: ["GOLD"],
    fechaCreacion: "08/10/2026"
  },
  {
    id: "STF-003",
    nombre: "Julián",
    apellido: "Pérez",
    username: "puerta3",
    password: "puerta123password",
    avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80",
    door: "Puerta 3 - Acceso General Silver",
    allowedZones: ["SILVER"],
    fechaCreacion: "08/10/2026"
  }
];
let adminSessions = {};    // token -> username
const activeTimers = {};   // seatId -> setTimeout

// --- PERSISTENCIA EN DATA.JSON ---
function cargarDatos() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      seatsState = parsed.seatsState || {};
      salesHistory = parsed.salesHistory || [];
      if (Array.isArray(parsed.staffUsers) && parsed.staffUsers.length > 0) {
        staffUsers = parsed.staffUsers;
      }
      adminSessions = parsed.adminSessions || {};
      console.log('✅ Base de datos cargada desde data.json');
    } else {
      guardarDatos();
      console.log('⚡ data.json inicializado');
    }
  } catch (err) {
    console.error('⚠️ Error leyendo data.json:', err);
  }

  // Limpiar bloqueos expirados en reinicio
  Object.keys(seatsState).forEach(id => {
    if (seatsState[id].status !== 'sold') delete seatsState[id];
  });
  salesHistory.forEach(v => {
    if (Array.isArray(v.puestos)) {
      v.puestos.forEach(id => { seatsState[id] = { status: 'sold' }; });
    }
  });
}

function guardarDatos() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ seatsState, salesHistory, staffUsers, adminSessions, eventInfo: EVENT_INFO }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('❌ Error guardando en data.json:', err);
  }
}

cargarDatos();

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

// --- MIDDLEWARES & ARCHIVOS ESTÁTICOS (SIN CACHÉ PARA ACTUALIZACIONES INMEDIATAS) ---
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

app.use(express.static(__dirname, {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));

// --- REST API ENDPOINTS ---
app.get('/api/health', (req, res) => {
  const soldCount = Object.values(seatsState).filter(s => s.status === 'sold').length;
  res.json({
    status: 'ok',
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

app.post('/api/reset', (req, res) => {
  seatsState = {};
  salesHistory = [];
  adminSessions = {};
  Object.keys(activeTimers).forEach(id => {
    clearTimeout(activeTimers[id]);
    delete activeTimers[id];
  });
  guardarDatos();
  io.emit('MAP_STATE', seatsState);
  broadcastAdminData();
  res.json({ success: true, message: 'Base de datos del evento restablecida a cero.' });
});

// --- WEBSOCKETS EN TIEMPO REAL (SOCKET.IO) ---
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  // Enviar estado inicial
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
          guardarDatos();
          io.emit('SEATS_RELEASED', { seatIds: [seatId] });
        }
      }, LOCK_TIME_MS);
    });

    guardarDatos();
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
      guardarDatos();
      io.emit('SEATS_RELEASED', { seatIds: unlocked });
    }
  });

  // 3. CONFIRMAR COMPRA / GENERAR ENTRADA Y QR
  socket.on('CONFIRM_PURCHASE', (datosCompra) => {
    const seatIds = datosCompra && datosCompra.seatIds;
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      socket.emit('PURCHASE_FAILED', { message: 'No se enviaron puestos válidos.' });
      return;
    }

    // Validar que el cliente tenga las sillas bloqueadas y vigentes
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

    // Marcar como vendidas
    seatIds.forEach(seatId => {
      if (activeTimers[seatId]) {
        clearTimeout(activeTimers[seatId]);
        delete activeTimers[seatId];
      }
      seatsState[seatId] = { status: 'sold', buyer: datosCompra.cliente };
    });

    // Calcular Zonas y Puerta Asignada oficial
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

    salesHistory.push(nuevaVenta);
    guardarDatos();

    socket.emit('PURCHASE_OK', nuevaVenta);
    io.emit('SEATS_SOLD', { seatIds, venta: nuevaVenta });
    broadcastAdminData();
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
    guardarDatos();

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
      guardarDatos();
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

  // 7. CREAR / ELIMINAR STAFF (ADMIN) CON ASIGNACIÓN DE PUERTA & ZONAS
  socket.on('CREATE_STAFF', (staffData) => {
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
    staffUsers.push(nuevoStaff);
    guardarDatos();
    broadcastAdminData();
    socket.emit('STAFF_CREATED_SUCCESS', nuevoStaff);
  });

  socket.on('DELETE_STAFF', ({ staffId }) => {
    if (!isAdmin(socket)) {
      socket.emit('ADMIN_SESSION_INVALID');
      return;
    }
    staffUsers = staffUsers.filter(s => s.id !== staffId);
    guardarDatos();
    broadcastAdminData();
  });

  // 8. ELIMINAR BOLETA VENDIDA (ADMIN)
  socket.on('DELETE_TICKET', ({ codigoCompra }) => {
    if (!isAdmin(socket)) {
      socket.emit('ADMIN_SESSION_INVALID');
      return;
    }
    const index = salesHistory.findIndex(v => v.codigoCompra === codigoCompra);
    if (index === -1) return;

    const ticket = salesHistory[index];
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
    guardarDatos();

    io.emit('SEATS_RELEASED', { seatIds: ticket.puestos });
    broadcastAdminData();
  });

  // 9. VALIDACIÓN QR ESTRICTA POR PUERTA Y ZONA (STAFF Y ADMIN)
  socket.on('VALIDATE_TICKET', ({ codigo, staffUsername, isRoleAdmin }) => {
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

    // Identificar zonas de los puestos de la entrada
    const ticketZones = venta.zonas || [...new Set((venta.puestos || []).map(id => getSeatZone(id)))];
    const correctDoor = venta.puertaSugerida || getZoneDoorInfo(ticketZones[0] || 'SILVER').door;
    const zonaNombre = venta.zonaNombre || getZoneDoorInfo(ticketZones[0] || 'SILVER').name;

    // A. Verificación de Administrador (Acceso Total a Cualquier Puerta)
    const socketIsAdmin = isAdmin(socket) || isRoleAdmin === true;

    if (!socketIsAdmin) {
      // B. Verificación de Validador Staff por Puerta Asignada
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
        // 🚫 DENEGAR POR PUERTA INCORRECTA
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

    // C. Si la puerta es correcta (o es Admin): Verificar si ya fue utilizada
    if (venta.usado) {
      socket.emit('VALIDATION_RESULT', {
        status: 'USED',
        message: '⚠️ ¡ALERTA! ENTRADA YA FUE UTILIZADA',
        detail: `Esta entrada ya fue registrada previamente por ${venta.escaneadoPor || 'Validador'} a las ${venta.fechaEscaneo || 'N/D'}.`,
        venta
      });
      return;
    }

    // D. Entrada Válida -> Marcar como Usada
    venta.usado = true;
    venta.escaneadoPor = socketIsAdmin ? 'Administrador (Pase Total)' : `${staffUsername || 'Validador Oficial'}`;
    venta.fechaEscaneo = new Date().toLocaleString('es-CO');
    guardarDatos();

    socket.emit('VALIDATION_RESULT', {
      status: 'VALID',
      message: '✅ ENTRADA VÁLIDA - ¡ACCESO PERMITIDO!',
      detail: `Cliente: ${venta.cliente} | Puestos: ${venta.puestos.join(', ')} | ${zonaNombre} (${correctDoor})`,
      venta
    });
    broadcastAdminData();
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
      guardarDatos();
      io.emit('SEATS_RELEASED', { seatIds: released });
    }
  });
});

server.listen(PORT, () => {
  console.log(`
  ========================================================================
  🚀 OpenTheDoor - Servidor de Boletería Activo
  ========================================================================
  📍 URL Local:         http://localhost:${PORT}
  📍 Evento Único:      ${EVENT_INFO.title} (Aforo: ${TOTAL_CAPACITY} puestos)
  📍 Validación:        Control estricto por Puertas (1-VIP, 2-Gold, 3-Silver)
  📍 Persistencia:      ${DATA_FILE}
  ========================================================================
  `);
});
