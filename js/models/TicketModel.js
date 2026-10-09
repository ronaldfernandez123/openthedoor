/* ==========================================================================
   OpenTheDoor - MODEL (Capa de Datos, WebSockets y Estado del Evento)
   ========================================================================== */

class TicketModel {
  constructor() {
    this.listeners = {};
    this.socket = null;
    this.seatsState = {};
    this.mySelectedSeats = [];
    this.lockExpiresAt = null;
    this.eventInfo = EVENT_CONFIG;
    this.bankConfig = BANK_CONFIG;

    this.currentUser = this.loadLocal('openthedoor_user');
    this.currentAdmin = this.loadLocal('openthedoor_admin');
    this.currentStaff = this.loadLocal('openthedoor_staff');

    this.adminData = {
      sales: [],
      staffList: [],
      totalCapacity: 600
    };

    this.userTickets = [];
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
          if (info) this.eventInfo = info;
          this.emit('eventInfoChanged', this.eventInfo);
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
      return s && s.status === 'locked' && s.userId === this.socket.id;
    });
    if (this.mySelectedSeats.length === 0) {
      this.lockExpiresAt = null;
    }
  }

  // --- REGLAS DE NEGOCIO Y CÁLCULO DE PRECIOS POR ZONAS ---
  getZoneBySeatId(seatId) {
    if (!seatId) return 'SILVER';
    const letter = seatId.charAt(0).toUpperCase();
    if (letter >= 'A' && letter <= 'B') return 'DIAMOND';
    if (letter >= 'C' && letter <= 'H') return 'GOLD';
    return 'SILVER';
  }

  getSeatPrice(seatId) {
    const zoneKey = this.getZoneBySeatId(seatId);
    return EVENT_CONFIG.prices[zoneKey] || 40000;
  }

  getSelectionTotal() {
    return this.mySelectedSeats.reduce((sum, id) => sum + this.getSeatPrice(id), 0);
  }

  // --- ACCIONES DE USUARIO / COMPRADOR ---
  toggleSeat(seatId) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, message: "Sin conexión con el servidor en tiempo real." };
    }

    if (this.mySelectedSeats.includes(seatId)) {
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
      this.socket.emit('LOCK_SEATS', { seatIds: [seatId] });
      return { success: true, action: 'locked' };
    }
  }

  selectFullTable(tableId) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, message: "Sin conexión con el servidor en tiempo real." };
    }

    const tableSeats = Array.from({ length: 10 }, (_, i) => `${tableId}-S${i + 1}`);
    const unavailable = tableSeats.some(id => {
      const s = this.seatsState[id];
      return s && (s.status === 'sold' || (s.status === 'locked' && s.userId !== this.socket.id));
    });

    if (unavailable) {
      return { success: false, message: `La mesa ${tableId} tiene uno o más puestos ocupados. No es posible reservarla completa.` };
    }

    this.socket.emit('LOCK_SEATS', { seatIds: tableSeats });
    return { success: true, message: `Mesa ${tableId} bloqueada con éxito (10 puestos).` };
  }

  confirmPurchase(datos) {
    if (!this.socket || !this.socket.connected) {
      return { success: false, message: "Sin conexión con el servidor." };
    }
    if (this.mySelectedSeats.length === 0) {
      return { success: false, message: "No tienes ningún puesto seleccionado." };
    }

    const payload = {
      seatIds: this.mySelectedSeats,
      total: this.getSelectionTotal(),
      cliente: datos.cliente || (this.currentUser ? this.currentUser.name : "Cliente"),
      email: datos.email || (this.currentUser ? this.currentUser.email : ""),
      telefono: datos.telefono || "",
      metodoPago: datos.metodoPago || "Transferencia Bancolombia",
      comprobanteRef: datos.comprobanteRef || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      idPedido: `ORD-${Date.now().toString().slice(-6)}`,
      codigoCompra: `OPN-${Math.floor(100000 + Math.random() * 900000)}`,
      fechaHora: new Date().toLocaleString('es-CO')
    };

    this.socket.emit('CONFIRM_PURCHASE', payload);
    return { success: true, payload };
  }

  fetchUserTickets() {
    if (!this.socket || !this.currentUser) return;
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
    if (!this.socket) return;
    this.socket.emit('ADMIN_LOGIN', { username, password });
  }

  deleteTicket(codigoCompra) {
    if (!this.socket) return;
    this.socket.emit('DELETE_TICKET', { codigoCompra });
  }

  createStaff(staffData) {
    if (!this.socket) return;
    this.socket.emit('CREATE_STAFF', staffData);
  }

  deleteStaff(staffId) {
    if (!this.socket) return;
    this.socket.emit('DELETE_STAFF', { staffId });
  }

  // --- STAFF ACCIONES ---
  staffLogin(username, password) {
    if (!this.socket) return;
    this.socket.emit('STAFF_LOGIN', { username, password });
  }

  validateTicketQr(code) {
    if (!this.socket) return;
    const isRoleAdmin = Boolean(this.currentAdmin);
    const staffUsername = this.currentStaff 
      ? this.currentStaff.username 
      : (this.currentAdmin ? this.currentAdmin.username : 'Admin');

    this.socket.emit('VALIDATE_TICKET', { 
      codigo: code, 
      staffUsername, 
      isRoleAdmin 
    });
  }
}
