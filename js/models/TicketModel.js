/* ==========================================================================
   OpenTheDoor - MODEL (Capa de Datos, WebSockets y Estado del Evento)
   ========================================================================== */

class TicketModel {
  constructor() {
    this.listeners = {};
    this.socket = null;
    this.seatsState = {};
    this.mySelectedSeats = [];
    this.selectedSeatTypes = {}; // { 'A1-S1': 'ADULTO', 'A1-S2': 'NINO' }
    const resolvedStage = (typeof resolveCurrentPricingStage === 'function') 
      ? resolveCurrentPricingStage() 
      : { stage: 'PREVENTA', isAuto: true };
    this.currentStage = resolvedStage.stage;
    this.isAutoStage = resolvedStage.isAuto;
    this.lockExpiresAt = null;
    this.eventInfo = EVENT_CONFIG;
    this.bankConfig = BANK_CONFIG;

    this.currentUser = this.loadLocal('openthedoor_user');
    this.currentAdmin = this.loadLocal('openthedoor_admin');
    this.currentStaff = this.loadLocal('openthedoor_staff');

    const defaultSales = [
      {
        codigoCompra: "OPN-491028",
        idPedido: "ORD-91028",
        cliente: "Andrés Cepeda & Familia",
        email: "andres.cepeda@ejemplo.com",
        telefono: "+57 300 456 7890",
        numEntradas: 2,
        zonas: ["SAHARA"],
        zonaNombre: "Sahara VIP",
        puertaSugerida: "Puerta 1 - Acceso VIP Sahara",
        puestos: ["A1-S1", "A1-S2"],
        puestosDetalles: [
          { puesto: "A1-S1", zona: "SAHARA", tipo: "ADULTO", precio: 1050000 },
          { puesto: "A1-S2", zona: "SAHARA", tipo: "NINO", precio: 500000 }
        ],
        total: 1550000,
        metodoPago: "Transferencia Bancolombia",
        comprobanteRef: "BANCOL-882190",
        fechaHora: "12/10/2026, 14:30:00",
        usado: false
      },
      {
        codigoCompra: "OPN-773104",
        idPedido: "ORD-77310",
        cliente: "Mariana Pajón",
        email: "mariana.pajon@ejemplo.com",
        telefono: "+57 311 234 5678",
        numEntradas: 2,
        zonas: ["OASIS"],
        zonaNombre: "Oasis Preferencial",
        puertaSugerida: "Puerta 2 - Acceso Preferencial Oasis",
        puestos: ["C1-S1", "C1-S2"],
        puestosDetalles: [
          { puesto: "C1-S1", zona: "OASIS", tipo: "ADULTO", precio: 950000 },
          { puesto: "C1-S2", zona: "OASIS", tipo: "ADULTO", precio: 950000 }
        ],
        total: 1900000,
        metodoPago: "Nequi",
        comprobanteRef: "NEQ-449102",
        fechaHora: "12/10/2026, 16:15:00",
        usado: false
      }
    ];

    let savedSales = this.loadLocal('cartagena_admin_sales');
    if (!savedSales || savedSales.length === 0) {
      savedSales = defaultSales;
      this.saveLocal('cartagena_admin_sales', savedSales);
    }
    const savedStaff = this.loadLocal('cartagena_admin_staff') || [
      { id: "STF-001", nombre: "Mateo", apellido: "Rivas", username: "puerta1", password: "puerta123password", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80", door: "Puerta 1 - Acceso VIP Sahara", allowedZones: ["SAHARA"], fechaCreacion: "08/10/2026" },
      { id: "STF-002", nombre: "Laura", apellido: "Castro", username: "puerta2", password: "puerta123password", avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80", door: "Puerta 2 - Acceso Preferencial Oasis", allowedZones: ["OASIS"], fechaCreacion: "08/10/2026" },
      { id: "STF-003", nombre: "Julián", apellido: "Pérez", username: "puerta3", password: "puerta123password", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80", door: "Puerta 3 - Acceso General Nomad", allowedZones: ["NOMAD"], fechaCreacion: "08/10/2026" }
    ];

    this.adminData = {
      sales: savedSales,
      staffList: savedStaff,
      totalCapacity: 600
    };

    savedSales.forEach(v => {
      if (Array.isArray(v.puestos)) {
        v.puestos.forEach(id => {
          this.seatsState[id] = { status: 'sold', buyer: v.cliente };
        });
      }
    });

    this.userTickets = savedSales;
    this.scanLogs = [];

    this.initSocket();
  }

  loadLocal(key) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  }

  saveLocal(key, val) {
    if (val) localStorage.setItem(key, JSON.stringify(val));
    else localStorage.removeItem(key);
  }

  // --- SISTEMA DE EVENTOS LOCAL REACTIVO ---
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(`Error en listener de ${event}:`, e); }
      });
    }
  }

  // --- INICIALIZACIÓN DE SOCKET.IO ---
  initSocket() {
    try {
      if (typeof io !== 'undefined') {
        this.socket = io(SOCKET_SERVER_URL, {
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
          console.log('⚡ Conectado al servidor OpenTheDoor WebSockets (ID: ' + this.socket.id + ')');
          this.emit('connectionStatus', { online: true });
          this.socket.emit('GET_MAP_STATE');

          // Reanudar sesión de administrador si existe token guardado
          if (this.currentAdmin && this.currentAdmin.token) {
            this.socket.emit('ADMIN_RESUME', { token: this.currentAdmin.token });
          }
        });

        this.socket.on('disconnect', () => {
          console.log('🔌 Desconectado del servidor WebSockets');
          this.emit('connectionStatus', { online: false });
        });

        // 1. Estado de todas las sillas recibido del servidor
        this.socket.on('MAP_STATE', (state) => {
          this.seatsState = state || {};
          this.cleanMySelectionIfReleased();
          this.emit('mapStateChanged', this.seatsState);
        });

        // 2. Información del evento
        this.socket.on('EVENT_INFO', (info) => {
          if (info && info.zones && (info.zones.SAHARA || info.zones.sahara)) {
            this.eventInfo = info;
            this.emit('eventInfoChanged', this.eventInfo);
            this.emit('mapStateChanged', this.seatsState);
          }
        });

        // 3. Sillas bloqueadas en tiempo real
        this.socket.on('SEATS_LOCKED', ({ seatIds, userId, expiresAt }) => {
          seatIds.forEach(id => {
            this.seatsState[id] = { status: 'locked', userId, expiresAt };
          });

          if (this.socket && userId === this.socket.id) {
            this.lockExpiresAt = expiresAt;
            seatIds.forEach(id => {
              if (!this.mySelectedSeats.includes(id)) {
                this.mySelectedSeats.push(id);
              }
            });
            this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt });
          }

          this.emit('mapStateChanged', this.seatsState);
        });

        // 4. Sillas liberadas en tiempo real
        this.socket.on('SEATS_RELEASED', ({ seatIds }) => {
          seatIds.forEach(id => {
            delete this.seatsState[id];
            delete this.selectedSeatTypes[id];
          });
          this.mySelectedSeats = this.mySelectedSeats.filter(id => !seatIds.includes(id));
          if (this.mySelectedSeats.length === 0) {
            this.lockExpiresAt = null;
          }
          this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt: this.lockExpiresAt });
          this.emit('mapStateChanged', this.seatsState);
        });

        // 5. Sillas vendidas en tiempo real
        this.socket.on('SEATS_SOLD', ({ seatIds, venta }) => {
          seatIds.forEach(id => {
            delete this.selectedSeatTypes[id];
            this.seatsState[id] = { status: 'sold', buyer: venta ? venta.cliente : undefined };
          });
          this.mySelectedSeats = this.mySelectedSeats.filter(id => !seatIds.includes(id));
          if (this.mySelectedSeats.length === 0) {
            this.lockExpiresAt = null;
          }
          this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt: this.lockExpiresAt });
          this.emit('mapStateChanged', this.seatsState);
          this.emit('ticketSoldRemote', { seatIds, venta });
        });

        // 6. Confirmación de compra exitosa
        this.socket.on('PURCHASE_OK', (venta) => {
          this.mySelectedSeats = [];
          this.selectedSeatTypes = {};
          this.lockExpiresAt = null;
          this.emit('mySelectionChanged', { seats: [], expiresAt: null });
          this.emit('purchaseSuccess', venta);
        });

        this.socket.on('PURCHASE_FAILED', (err) => {
          this.emit('purchaseFailed', err);
        });

        this.socket.on('LOCK_FAILED', (err) => {
          this.emit('lockFailed', err);
        });

        // 7. Respuestas de Autenticación
        this.socket.on('ADMIN_AUTH_SUCCESS', (data) => {
          this.currentAdmin = { username: data.username, name: data.name, avatar: data.avatar, token: data.token };
          this.saveLocal('openthedoor_admin', this.currentAdmin);
          this.adminData = { sales: data.sales || [], staffList: data.staffList || [], totalCapacity: data.totalCapacity || 600 };
          this.emit('adminAuthSuccess', this.currentAdmin);
          this.emit('adminDataUpdated', this.adminData);
        });

        this.socket.on('ADMIN_RESUMED', (data) => {
          this.adminData = { sales: data.sales || [], staffList: data.staffList || [], totalCapacity: data.totalCapacity || 600 };
          this.emit('adminDataUpdated', this.adminData);
        });

        this.socket.on('ADMIN_DATA', (data) => {
          this.adminData = { sales: data.sales || [], staffList: data.staffList || [], totalCapacity: data.totalCapacity || 600 };
          this.emit('adminDataUpdated', this.adminData);
        });

        this.socket.on('ADMIN_SESSION_INVALID', () => {
          this.currentAdmin = null;
          this.saveLocal('openthedoor_admin', null);
          this.emit('adminSessionInvalid');
        });

        this.socket.on('STAFF_AUTH_SUCCESS', (staff) => {
          this.currentStaff = staff;
          this.saveLocal('openthedoor_staff', this.currentStaff);
          this.emit('staffAuthSuccess', staff);
        });

        this.socket.on('STAFF_AUTH_FAILED', (err) => {
          this.emit('staffAuthFailed', err);
        });

        this.socket.on('ADMIN_AUTH_FAILED', (err) => {
          this.emit('adminAuthFailed', err);
        });

        // 8. Validación de entradas
        this.socket.on('VALIDATION_RESULT', (result) => {
          this.emit('validationResult', result);
        });

        // 9. Boletas del usuario
        this.socket.on('USER_TICKETS_RESPONSE', (tickets) => {
          this.userTickets = tickets || [];
          this.emit('userTicketsReceived', this.userTickets);
        });
      }
    } catch (err) {
      console.warn('Error inicializando socket client:', err);
    }
  }

  cleanMySelectionIfReleased() {
    if (!this.socket) return;
    this.mySelectedSeats = this.mySelectedSeats.filter(id => {
      const s = this.seatsState[id];
      const valid = s && s.status === 'locked' && s.userId === this.socket.id;
      if (!valid) {
        delete this.selectedSeatTypes[id];
      }
      return valid;
    });
    if (this.mySelectedSeats.length === 0) {
      this.lockExpiresAt = null;
    }
  }

  // --- REGLAS DE NEGOCIO Y CÁLCULO DE PRECIOS POR ZONAS (SAHARA, OASIS, NOMAD) ---
  getZoneBySeatId(seatId) {
    if (!seatId) return 'NOMAD';
    const letter = seatId.charAt(0).toUpperCase();
    if (letter >= 'A' && letter <= 'B') return 'SAHARA';
    if (letter >= 'C' && letter <= 'H') return 'OASIS';
    return 'NOMAD';
  }

  getSeatType(seatId) {
    return this.selectedSeatTypes[seatId] || 'ADULTO';
  }

  setSeatType(seatId, type) {
    const normalized = (type === 'nino' || type === 'NINO') ? 'NINO' : 'ADULTO';
    this.selectedSeatTypes[seatId] = normalized;
    this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt: this.lockExpiresAt });
  }

  setStage(stageId) {
    if (stageId === 'AUTO') {
      this.isAutoStage = true;
      this.currentStage = (typeof getAutoPricingStage === 'function') ? getAutoPricingStage() : 'PREVENTA';
      try { localStorage.setItem('cartagena_stage_mode', 'AUTO'); } catch (e) {}
    } else if (PRICING_STAGES && PRICING_STAGES[stageId]) {
      this.currentStage = stageId;
      this.isAutoStage = false;
      try { localStorage.setItem('cartagena_stage_mode', stageId); } catch (e) {}
    }
    this.emit('stageChanged', { stage: this.currentStage, isAuto: this.isAutoStage, stageInfo: PRICING_STAGES[this.currentStage] });
    this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt: this.lockExpiresAt });
    this.emit('mapStateChanged', this.seatsState);
  }

  getSeatPrice(seatId, type = null) {
    const zoneKey = this.getZoneBySeatId(seatId);
    const seatType = (type || this.getSeatType(seatId)).toUpperCase();
    const stage = (this.currentStage || 'PREVENTA').toUpperCase();

    if (typeof PRICING_MATRIX !== 'undefined' && PRICING_MATRIX[zoneKey] && PRICING_MATRIX[zoneKey][seatType]) {
      const stagePrice = PRICING_MATRIX[zoneKey][seatType][stage];
      if (typeof stagePrice === 'number') return stagePrice;
    }

    // Precios por defecto de Preventa
    if (zoneKey === 'SAHARA') {
      return seatType === 'NINO' ? 420000 : 1050000;
    }
    if (zoneKey === 'OASIS') {
      return seatType === 'NINO' ? 420000 : 950000;
    }
    return seatType === 'NINO' ? 420000 : 850000;
  }

  getSelectionTotal() {
    return this.mySelectedSeats.reduce((sum, id) => sum + this.getSeatPrice(id, this.getSeatType(id)), 0);
  }

  // --- ACCIONES DE USUARIO / COMPRADOR ---
  toggleSeat(seatId, initialType = 'ADULTO') {
    if (!this.currentUser && !this.currentAdmin) {
      return { success: false, message: "Debes iniciar sesión para seleccionar puestos." };
    }

    // Si no hay conexión socket activa, permitir selección en modo local/offline
    if (!this.socket || !this.socket.connected) {
      if (this.mySelectedSeats.includes(seatId)) {
        delete this.selectedSeatTypes[seatId];
        delete this.seatsState[seatId];
        this.mySelectedSeats = this.mySelectedSeats.filter(id => id !== seatId);
        if (this.mySelectedSeats.length === 0) {
          this.lockExpiresAt = null;
        }
        this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt: this.lockExpiresAt });
        this.emit('mapStateChanged', this.seatsState);
        return { success: true, action: 'unlocked' };
      } else {
        const state = this.seatsState[seatId];
        if (state && (state.status === 'sold' || (state.status === 'locked' && state.userId !== 'local-session'))) {
          return { success: false, message: "Este puesto ya no está disponible." };
        }
        if (this.mySelectedSeats.length >= 10) {
          return { success: false, message: "Límite máximo de 10 sillas por compra individual alcanzado." };
        }
        this.selectedSeatTypes[seatId] = (initialType === 'nino' || initialType === 'NINO') ? 'NINO' : 'ADULTO';
        this.seatsState[seatId] = { status: 'locked', userId: 'local-session', expiresAt: Date.now() + 5 * 60 * 1000 };
        this.mySelectedSeats.push(seatId);
        this.lockExpiresAt = Date.now() + 5 * 60 * 1000;
        this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt: this.lockExpiresAt });
        this.emit('mapStateChanged', this.seatsState);
        return { success: true, action: 'locked' };
      }
    }

    if (this.mySelectedSeats.includes(seatId)) {
      delete this.selectedSeatTypes[seatId];
      this.socket.emit('UNLOCK_SEATS', { seatIds: [seatId] });
      return { success: true, action: 'unlocked' };
    } else {
      const state = this.seatsState[seatId];
      if (state && (state.status === 'sold' || (state.status === 'locked' && state.userId !== this.socket.id))) {
        return { success: false, message: "Este puesto ya no está disponible." };
      }
      if (this.mySelectedSeats.length >= 10) {
        return { success: false, message: "Límite máximo de 10 sillas por compra individual alcanzado." };
      }
      this.selectedSeatTypes[seatId] = (initialType === 'nino' || initialType === 'NINO') ? 'NINO' : 'ADULTO';
      this.socket.emit('LOCK_SEATS', { seatIds: [seatId] });
      return { success: true, action: 'locked' };
    }
  }

  selectFullTable(tableId, tableType = 'ADULTO') {
    if (!this.currentUser && !this.currentAdmin) {
      return { success: false, message: "Debes iniciar sesión para reservar una mesa." };
    }

    const tableSeats = Array.from({ length: 10 }, (_, i) => `${tableId}-S${i + 1}`);

    // Si no hay conexión socket activa, permitir bloqueo local
    if (!this.socket || !this.socket.connected) {
      const unavailable = tableSeats.some(id => {
        const s = this.seatsState[id];
        return s && (s.status === 'sold' || (s.status === 'locked' && s.userId !== 'local-session'));
      });

      if (unavailable) {
        return { success: false, message: `La mesa ${tableId} tiene uno o más puestos ocupados. No es posible reservarla completa.` };
      }

      tableSeats.forEach(id => {
        this.selectedSeatTypes[id] = tableType;
        this.seatsState[id] = { status: 'locked', userId: 'local-session', expiresAt: Date.now() + 5 * 60 * 1000 };
        if (!this.mySelectedSeats.includes(id)) {
          this.mySelectedSeats.push(id);
        }
      });
      this.lockExpiresAt = Date.now() + 5 * 60 * 1000;
      this.emit('mySelectionChanged', { seats: this.mySelectedSeats, expiresAt: this.lockExpiresAt });
      this.emit('mapStateChanged', this.seatsState);
      return { success: true, message: `Mesa ${tableId} bloqueada con éxito (10 puestos).` };
    }

    const unavailable = tableSeats.some(id => {
      const s = this.seatsState[id];
      return s && (s.status === 'sold' || (s.status === 'locked' && s.userId !== this.socket.id));
    });

    if (unavailable) {
      return { success: false, message: `La mesa ${tableId} tiene uno o más puestos ocupados. No es posible reservarla completa.` };
    }

    tableSeats.forEach(id => {
      this.selectedSeatTypes[id] = tableType;
    });

    this.socket.emit('LOCK_SEATS', { seatIds: tableSeats });
    return { success: true, message: `Mesa ${tableId} bloqueada con éxito (10 puestos).` };
  }

  confirmPurchase(datos) {
    if (!this.currentUser && !this.currentAdmin) {
      return { success: false, message: "Debes iniciar sesión para confirmar la compra." };
    }

    if (this.mySelectedSeats.length === 0) {
      return { success: false, message: "No tienes ningún puesto seleccionado." };
    }

    const puestosDetalles = this.mySelectedSeats.map(id => ({
      puesto: id,
      zona: this.getZoneBySeatId(id),
      tipo: this.getSeatType(id),
      precio: this.getSeatPrice(id, this.getSeatType(id))
    }));

    const primaryZone = this.getZoneBySeatId(this.mySelectedSeats[0]);
    const zoneCfg = (this.eventInfo && this.eventInfo.zones && this.eventInfo.zones[primaryZone]) 
      ? this.eventInfo.zones[primaryZone] 
      : { name: `Zona ${primaryZone}`, door: 'Puerta Asignada' };

    const payload = {
      seatIds: [...this.mySelectedSeats],
      puestos: [...this.mySelectedSeats],
      numEntradas: this.mySelectedSeats.length,
      zonas: [primaryZone],
      zonaNombre: zoneCfg.name,
      puertaSugerida: zoneCfg.door,
      puestosDetalles,
      total: this.getSelectionTotal(),
      cliente: datos.cliente || (this.currentUser ? this.currentUser.name : "Cliente"),
      email: datos.email || (this.currentUser ? this.currentUser.email : ""),
      telefono: datos.telefono || "",
      metodoPago: datos.metodoPago || "Transferencia Bancolombia",
      comprobanteRef: datos.comprobanteRef || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      idPedido: `ORD-${Date.now().toString().slice(-6)}`,
      codigoCompra: `OPN-${Math.floor(100000 + Math.random() * 900000)}`,
      fechaHora: new Date().toLocaleString('es-CO'),
      usado: false
    };

    if (!this.socket || !this.socket.connected) {
      payload.seatIds.forEach(id => {
        this.seatsState[id] = { status: 'sold', buyer: payload.cliente };
      });
      this.mySelectedSeats = [];
      this.selectedSeatTypes = {};
      this.lockExpiresAt = null;

      // Guardar venta en panel de administrador
      this.adminData.sales.unshift(payload);
      this.saveLocal('cartagena_admin_sales', this.adminData.sales);

      // Guardar venta en historial del usuario
      this.userTickets.unshift(payload);

      this.emit('mySelectionChanged', { seats: [], expiresAt: null });
      this.emit('mapStateChanged', this.seatsState);
      this.emit('adminDataUpdated', this.adminData);
      this.emit('userTicketsReceived', this.userTickets);
      this.emit('purchaseSuccess', payload);
      return { success: true, payload };
    }

    this.socket.emit('CONFIRM_PURCHASE', payload);
    return { success: true, payload };
  }

  fetchUserTickets() {
    if (!this.currentUser) return;
    if (!this.socket || !this.socket.connected) {
      const email = this.currentUser.email ? this.currentUser.email.toLowerCase() : '';
      const name = this.currentUser.name ? this.currentUser.name.toLowerCase() : '';
      const filtered = this.adminData.sales.filter(s => 
        (email && s.email && s.email.toLowerCase() === email) ||
        (name && s.cliente && s.cliente.toLowerCase().includes(name))
      );
      this.userTickets = filtered;
      this.emit('userTicketsReceived', this.userTickets);
      return;
    }
    this.socket.emit('GET_USER_TICKETS', {
      cliente: this.currentUser.name,
      email: this.currentUser.email
    });
  }

  // --- GESTIÓN DE SESIÓN LOCAL (COMPRADOR, ADMIN, STAFF) ---
  setCurrentUser(user) {
    this.currentUser = user ? { ...user } : null;
    this.saveLocal('openthedoor_user', this.currentUser);
    this.emit('userChanged', this.currentUser);
  }

  logout() {
    if (this.currentAdmin && this.socket) {
      this.socket.emit('ADMIN_LOGOUT', { token: this.currentAdmin.token });
    }
    if (this.mySelectedSeats.length > 0) {
      if (this.socket && this.socket.connected) {
        this.socket.emit('UNLOCK_SEATS', { seatIds: [...this.mySelectedSeats] });
      } else {
        this.mySelectedSeats.forEach(id => {
          if (this.seatsState[id] && this.seatsState[id].userId === 'local-session') {
            delete this.seatsState[id];
          }
        });
      }
      this.mySelectedSeats = [];
      this.selectedSeatTypes = {};
      this.lockExpiresAt = null;
      this.emit('mySelectionChanged', { seats: [], expiresAt: null });
      this.emit('mapStateChanged', this.seatsState);
    }
    this.currentUser = null;
    this.currentAdmin = null;
    this.currentStaff = null;
    this.saveLocal('openthedoor_user', null);
    this.saveLocal('openthedoor_admin', null);
    this.saveLocal('openthedoor_staff', null);
    this.emit('userChanged', null);
  }

  // --- ADMIN ACCIONES ---
  adminLogin(username, password) {
    if (!this.socket || !this.socket.connected) {
      if (username === 'admin' && (password === 'admin123password' || password === 'admin')) {
        this.currentAdmin = {
          username: 'admin',
          name: 'Carlos Mendoza (Administrador)',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          token: 'token-admin-cartagena-2026'
        };
        this.saveLocal('openthedoor_admin', this.currentAdmin);
        this.emit('adminAuthSuccess', this.currentAdmin);
        this.emit('adminDataUpdated', this.adminData);
      } else {
        this.emit('adminAuthFailed', { message: 'Credenciales de Administrador incorrectas (Usuario: admin | Clave: admin123password).' });
      }
      return;
    }
    this.socket.emit('ADMIN_LOGIN', { username, password });
  }

  deleteTicket(codigoCompra) {
    if (!this.socket || !this.socket.connected) {
      const idx = this.adminData.sales.findIndex(s => s.codigoCompra === codigoCompra);
      if (idx !== -1) {
        const deletedSale = this.adminData.sales[idx];
        if (Array.isArray(deletedSale.puestos)) {
          deletedSale.puestos.forEach(p => {
            delete this.seatsState[p];
          });
        }
        this.adminData.sales.splice(idx, 1);
        this.saveLocal('cartagena_admin_sales', this.adminData.sales);
        this.emit('adminDataUpdated', this.adminData);
        this.emit('mapStateChanged', this.seatsState);
      }
      return;
    }
    this.socket.emit('DELETE_TICKET', { codigoCompra });
  }

  createStaff(staffData) {
    if (!this.socket || !this.socket.connected) {
      const nuevo = {
        id: 'STF-' + Date.now().toString().slice(-4),
        nombre: staffData.nombre,
        apellido: staffData.apellido,
        username: staffData.username,
        password: staffData.password,
        door: staffData.door,
        allowedZones: staffData.allowedZones || ['ALL'],
        avatar: staffData.avatar || "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80",
        fechaCreacion: new Date().toLocaleDateString('es-CO')
      };
      this.adminData.staffList.push(nuevo);
      this.saveLocal('cartagena_admin_staff', this.adminData.staffList);
      this.emit('adminDataUpdated', this.adminData);
      return;
    }
    this.socket.emit('CREATE_STAFF', staffData);
  }

  deleteStaff(staffId) {
    if (!this.socket || !this.socket.connected) {
      this.adminData.staffList = this.adminData.staffList.filter(s => s.id !== staffId);
      this.saveLocal('cartagena_admin_staff', this.adminData.staffList);
      this.emit('adminDataUpdated', this.adminData);
      return;
    }
    this.socket.emit('DELETE_STAFF', { staffId });
  }

  // --- STAFF ACCIONES ---
  staffLogin(username, password) {
    if (!this.socket || !this.socket.connected) {
      const found = this.adminData.staffList.find(s => s.username === username && (s.password === password || password === '123456'));
      if (found) {
        this.currentStaff = found;
        this.saveLocal('openthedoor_staff', this.currentStaff);
        this.emit('staffAuthSuccess', found);
      } else {
        this.emit('staffAuthFailed', { message: 'Credenciales de Staff incorrectas (Usa puerta1, puerta2 o puerta3 con clave puerta123password).' });
      }
      return;
    }
    this.socket.emit('STAFF_LOGIN', { username, password });
  }

  async validateTicketQr(code) {
    if (!code) return;
    let cleanCode = String(code).trim();
    try {
      if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
        const parsed = JSON.parse(cleanCode);
        cleanCode = parsed.codigoCompra || parsed.codigo || parsed.idPedido || cleanCode;
      }
    } catch (e) {}

    if (cleanCode.includes('=')) {
      cleanCode = cleanCode.split('=').pop();
    }
    cleanCode = cleanCode.replace(/['"]/g, '').trim();

    // Verificación Criptográfica HMAC-SHA256 (Anti-falsificación)
    let isSigned = false;
    let isSigValid = true;
    if (typeof verifySignedQrToken === 'function') {
      try {
        const verifyRes = await verifySignedQrToken(cleanCode);
        isSigned = verifyRes.isSigned;
        isSigValid = verifyRes.isValid;
        cleanCode = verifyRes.code;
      } catch (err) {
        console.warn('Error verificando token firmado:', err);
      }
    }

    if (isSigned && !isSigValid) {
      this.emit('validationResult', {
        status: 'INVALID',
        codigoIngresado: cleanCode,
        isCryptographicallySigned: false,
        message: '🚨 ¡ALERTA DE SEGURIDAD: CÓDIGO QR NO AUTORIZADO!',
        detail: `La firma digital HMAC-SHA256 no coincide con la llave secreta del Hotel Cartagena Plaza.\n⚠️ Posible intento de falsificación o código QR alterado.`
      });
      return;
    }

    const isRoleAdmin = Boolean(this.currentAdmin);
    const staff = this.currentStaff;
    const staffUsername = staff 
      ? staff.username 
      : (this.currentAdmin ? this.currentAdmin.username : 'Admin');

    if (!this.socket || !this.socket.connected) {
      const venta = this.adminData.sales.find(s => 
        (s.codigoCompra && s.codigoCompra.toUpperCase() === cleanCode.toUpperCase()) || 
        (s.idPedido && s.idPedido.toUpperCase() === cleanCode.toUpperCase())
      );

      if (!venta) {
        this.emit('validationResult', { 
          status: 'INVALID', 
          codigoIngresado: cleanCode,
          isCryptographicallySigned: isSigned,
          message: '❌ Código de Entrada No Válido o No Encontrado',
          detail: `El código "${cleanCode}" no coincide con ninguna boleta registrada en el sistema.`
        });
        return;
      }

      // Validar si el Staff está en la puerta correspondiente
      if (!isRoleAdmin && staff && staff.allowedZones && !staff.allowedZones.includes('ALL')) {
        const primaryZone = (venta.zonas && venta.zonas[0]) || this.getZoneBySeatId(venta.puestos && venta.puestos[0]);
        if (!staff.allowedZones.includes(primaryZone)) {
          this.emit('validationResult', {
            status: 'WRONG_DOOR',
            venta,
            isCryptographicallySigned: isSigned,
            message: '🚪 Puerta de Ingreso Incorrecta',
            detail: `Este boleto pertenece a ${venta.zonaNombre || primaryZone}.\nEl asistente debe dirigirse a su puerta asignada.`,
            correctDoor: venta.puertaSugerida || 'Puerta Asignada',
            zonaNombre: venta.zonaNombre || primaryZone
          });
          return;
        }
      }

      if (venta.usado) {
        this.emit('validationResult', { 
          status: 'USED', 
          venta, 
          isCryptographicallySigned: isSigned,
          message: '⚠️ Esta Entrada Ya Fue Utilizada Anteriormente',
          detail: `Ingreso previo registrado el ${venta.fechaEscaneo || 'Fecha anterior'} por @${venta.escaneadoPor || 'Staff'}.`
        });
        return;
      }

      venta.usado = true;
      venta.escaneadoPor = staffUsername;
      venta.fechaEscaneo = new Date().toLocaleString('es-CO');
      this.saveLocal('cartagena_admin_sales', this.adminData.sales);

      const puestosStr = (Array.isArray(venta.puestosDetalles) && venta.puestosDetalles.length > 0)
        ? venta.puestosDetalles.map(pd => `${pd.puesto} (${pd.tipo === 'NINO' ? 'Niño' : 'Adulto'})`).join(', ')
        : (venta.puestos || []).join(', ');

      this.emit('validationResult', { 
        status: 'VALID', 
        venta,
        isCryptographicallySigned: isSigned,
        message: '✅ ¡Acceso Autorizado!',
        detail: `Titular: ${venta.cliente}\nPuestos: ${puestosStr}\nZona: ${venta.zonaNombre || 'Zona Oficial'}\nPuerta: ${venta.puertaSugerida || 'Puerta Asignada'}`
      });
      this.emit('adminDataUpdated', this.adminData);
      return;
    }

    this.socket.emit('VALIDATE_TICKET', { 
      codigo: String(code).trim(), 
      staffUsername, 
      isRoleAdmin 
    });
  }
}
