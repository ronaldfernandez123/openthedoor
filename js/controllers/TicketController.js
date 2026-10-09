/* ==========================================================================
   OpenTheDoor - CONTROLLER (Controlador Principal, Eventos & Coordinación)
   ========================================================================== */

class TicketController {
  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.activeZone = 'DIAMOND';
    this.timerInterval = null;
    this.html5QrCode = null;
    this.selectedStaffAvatarDataUrl = null;
    this.selectedUserAvatarDataUrl = null;
    this.lastConfirmedPurchase = null;
  }

  init() {
    this.setupTheme();
    this.setupModelListeners();
    this.renderAll();
    this.startHoldCountdown();
    this.setupGlobalShortcuts();
    this.initGoogleAuth();
  }

  // --- TEMA CLARO / OSCURO ---
  setupTheme() {
    const saved = localStorage.getItem('openthedoor_theme') || 'light';
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    this.view.updateThemeIcon(saved);
  }

  handleToggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('openthedoor_theme', newTheme);
    this.view.updateThemeIcon(newTheme);
    this.view.showToast(`Modo ${newTheme === 'dark' ? 'Oscuro 🌙' : 'Claro ☀️'} activado`, "info");
  }

  // --- LISTENERS DEL MODELO Y WEBSOCKETS ---
  setupModelListeners() {
    // 1. Cambio en el estado del mapa
    this.model.on('mapStateChanged', () => {
      this.renderTableMap();
    });

    // 2. Mi selección modificada
    this.model.on('mySelectionChanged', ({ seats, expiresAt }) => {
      this.view.renderSelectionSidebar(seats, (id) => this.model.getSeatPrice(id), expiresAt);
      this.renderTableMap();
    });

    // 3. Compra exitosa
    this.model.on('purchaseSuccess', (venta) => {
      this.lastConfirmedPurchase = venta;
      this.handleCloseCheckoutModal();
      this.view.renderReceiptModal(venta);
      this.view.showToast("🎉 ¡Reserva y compra confirmada con éxito!", "success");
      this.renderTableMap();
    });

    this.model.on('purchaseFailed', (err) => {
      this.view.showToast(err.message || "Error procesando la compra.", "error");
    });

    this.model.on('lockFailed', (err) => {
      this.view.showToast(err.message || "Error al bloquear sillas.", "warning");
    });

    // 4. Autenticación Administrador
    this.model.on('adminAuthSuccess', (admin) => {
      this.handleClosePortalModal();
      this.view.renderHeaderUser(null, admin, null);
      this.handleNavigate('admin');
      this.view.showToast(`👑 Bienvenido Administrador, ${admin.name || admin.username}`, "success");
    });

    this.model.on('adminDataUpdated', (data) => {
      this.view.renderAdminPanel(data);
    });

    this.model.on('adminSessionInvalid', () => {
      this.view.renderHeaderUser(null, null, null);
      this.handleNavigate('client');
      this.view.showToast("Tu sesión de administrador ha expirado.", "warning");
    });

    this.model.on('adminAuthFailed', (err) => {
      this.view.showToast(err.message || "Credenciales de administrador incorrectas.", "error");
    });

    // 5. Autenticación Staff
    this.model.on('staffAuthSuccess', (staff) => {
      this.handleClosePortalModal();
      this.view.renderHeaderUser(null, null, staff);
      this.handleNavigate('staff');
      this.view.showToast(`🛡️ Módulo de Validación Activo: ${staff.nombre}`, "success");
      this.initScanner();
    });

    this.model.on('staffAuthFailed', (err) => {
      this.view.showToast(err.message || "Credenciales de Staff incorrectas.", "error");
    });

    // 6. Validación QR
    this.model.on('validationResult', (result) => {
      this.view.renderScanResult(result);
    });

    // 7. Boletas del usuario
    this.model.on('userTicketsReceived', (tickets) => {
      this.view.renderMyTickets(tickets);
    });

    // 8. Usuario normal
    this.model.on('userChanged', (user) => {
      this.view.renderHeaderUser(user, this.model.currentAdmin, this.model.currentStaff);
    });
  }

  // --- RENDERIZADO GENERAL ---
  renderAll() {
    this.view.renderHeaderUser(this.model.currentUser, this.model.currentAdmin, this.model.currentStaff);
    this.renderTableMap();
    this.view.renderSelectionSidebar(
      this.model.mySelectedSeats,
      (id) => this.model.getSeatPrice(id),
      this.model.lockExpiresAt
    );
  }

  renderTableMap() {
    const socketId = this.model.socket ? this.model.socket.id : null;
    const zones = this.model.eventInfo.zones || EVENT_CONFIG.zones;

    Object.keys(zones).forEach(zoneKey => {
      this.view.renderTableGrid(
        zoneKey,
        zones[zoneKey],
        this.model.seatsState,
        this.model.mySelectedSeats,
        socketId
      );
    });
  }

  // --- NAVEGACIÓN ENTRE VISTAS ---
  handleNavigate(viewName) {
    const views = {
      client: document.getElementById('view-client'),
      'my-tickets': document.getElementById('view-my-tickets'),
      admin: document.getElementById('view-admin'),
      staff: document.getElementById('view-staff')
    };

    Object.keys(views).forEach(k => {
      if (views[k]) {
        if (k === viewName) {
          views[k].classList.remove('hidden');
        } else {
          views[k].classList.add('hidden');
        }
      }
    });

    if (viewName === 'my-tickets') {
      if (!this.model.currentUser) {
        this.handleOpenAuthModal('login');
        return;
      }
      this.model.fetchUserTickets();
    } else if (viewName === 'staff') {
      this.initScanner();
    } else {
      if (this.html5QrCode) {
        try { this.html5QrCode.stop(); } catch (e) {}
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- ACORDEÓN DE ZONAS ---
  handleToggleZone(selectedZone) {
    this.activeZone = selectedZone.toUpperCase();
    const zones = ['diamond', 'gold', 'silver'];

    zones.forEach(z => {
      const content = document.getElementById(`zone-content-${z}`);
      const header = document.getElementById(`zone-header-${z}`);
      const icon = document.getElementById(`zone-icon-${z}`);

      if (z === selectedZone.toLowerCase()) {
        const isClosed = content.classList.contains('hidden');
        if (isClosed) {
          content.classList.remove('hidden');
          if (icon) icon.className = "fa-solid fa-chevron-down text-xs transition-transform";
          if (header) header.classList.add('bg-slate-100', 'dark:bg-slate-700/80');
        } else {
          content.classList.add('hidden');
          if (icon) icon.className = "fa-solid fa-chevron-right text-xs transition-transform";
          if (header) header.classList.remove('bg-slate-100', 'dark:bg-slate-700/80');
        }
      } else {
        content.classList.add('hidden');
        if (icon) icon.className = "fa-solid fa-chevron-right text-xs transition-transform";
        if (header) header.classList.remove('bg-slate-100', 'dark:bg-slate-700/80');
      }
    });
  }

  // --- INTERACCIÓN CON SILLAS & MESAS ---
  handleToggleSeat(seatId) {
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.view.showToast("Inicia sesión o regístrate para seleccionar tus sillas.", "info");
      this.handleOpenAuthModal('login');
      return;
    }

    const res = this.model.toggleSeat(seatId);
    if (!res.success) {
      this.view.showToast(res.message, "warning");
    }
  }

  handleBuyFullTable(tableId) {
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.view.showToast("Inicia sesión para reservar la mesa completa.", "info");
      this.handleOpenAuthModal('login');
      return;
    }

    const res = this.model.selectFullTable(tableId);
    if (res.success) {
      this.view.showToast(res.message, "success");
    } else {
      this.view.showToast(res.message, "warning");
    }
  }

  // --- TEMPORIZADOR DE BLOQUEO (HOLD TIMER - 5 MIN) ---
  startHoldCountdown() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (this.model.lockExpiresAt && this.model.mySelectedSeats.length > 0) {
        const remainingMs = Math.max(0, this.model.lockExpiresAt - Date.now());
        const remainingSec = Math.floor(remainingMs / 1000);
        this.view.updateTimerDisplay(remainingSec);

        if (remainingSec <= 0) {
          this.view.showToast("⏱️ El tiempo de reserva (5 min) ha finalizado. Las sillas han sido liberadas.", "warning");
          this.model.mySelectedSeats = [];
          this.model.lockExpiresAt = null;
          this.renderAll();
        }
      } else {
        this.view.updateTimerDisplay(0);
      }
    }, 1000);
  }

  // --- MODAL DE CHECKOUT & PAGO ---
  handleStartCheckout() {
    if (this.model.mySelectedSeats.length === 0) {
      this.view.showToast("No has seleccionado ninguna silla aún.", "warning");
      return;
    }

    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.handleOpenAuthModal('login');
      return;
    }

    const modal = document.getElementById('checkout-modal');
    if (!modal) return;

    const total = this.model.getSelectionTotal();
    const user = this.model.currentUser || { name: this.model.currentAdmin.name || "Administrador", email: "admin@openthedoor.com" };

    document.getElementById('checkoutTotalBadge').textContent = `$${total.toLocaleString('es-CO')} COP`;
    document.getElementById('checkoutSeatsList').textContent = this.model.mySelectedSeats.join(', ');
    document.getElementById('checkoutBuyerName').value = user.name || "";
    document.getElementById('checkoutBuyerEmail').value = user.email || "";

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  handleCloseCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  handleConfirmPayment(e) {
    e.preventDefault();
    const cliente = document.getElementById('checkoutBuyerName').value.trim();
    const email = document.getElementById('checkoutBuyerEmail').value.trim();
    const telefono = document.getElementById('checkoutBuyerPhone').value.trim();
    const metodoPago = document.getElementById('checkoutPaymentMethod').value;
    const comprobanteRef = document.getElementById('checkoutReceiptRef').value.trim();

    if (!cliente || !email) {
      this.view.showToast("Completa tu nombre y correo para el envío del boleto.", "warning");
      return;
    }

    const res = this.model.confirmPurchase({
      cliente,
      email,
      telefono,
      metodoPago,
      comprobanteRef
    });

    if (!res.success) {
      this.view.showToast(res.message, "error");
    }
  }

  // --- MODAL DE COMPROBANTE OFICIAL & EXPORTACIÓN ---
  handleOpenReceiptModal(venta) {
    this.view.renderReceiptModal(venta);
  }

  handleCloseReceiptModal() {
    const modal = document.getElementById('ticket-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  handleDownloadPdf() {
    const element = document.getElementById('ticket-print-area');
    if (!element) return;

    this.view.showToast("📄 Generando PDF oficial con Código QR...", "info");

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Boleto-OpenTheDoor-${Date.now().toString().slice(-6)}.pdf`,
      image: { type: 'jpeg', quality: 0.99 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        logging: false,
        letterRendering: true
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    if (typeof html2pdf !== 'undefined') {
      html2pdf().set(opt).from(element).save().then(() => {
        this.view.showToast("✅ PDF descargado exitosamente con Código QR.", "success");
      });
    } else {
      window.print();
    }
  }

  handleShareReceipt() {
    if (!this.lastConfirmedPurchase) return;
    const p = this.lastConfirmedPurchase;
    const text = `🎟️ ¡Mis Boletos para la Gran Gala OpenTheDoor!\nCódigo: ${p.codigoCompra}\nPuestos: ${p.puestos.join(', ')}\nTotal: $${p.total.toLocaleString('es-CO')} COP`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  // --- MODAL DE AUTENTICACIÓN (LOGIN / REGISTRO CON AVATAR) ---
  handleOpenAuthModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    this.handleSwitchAuthTab(tab);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  handleCloseAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  handleSwitchAuthTab(tab) {
    const formLogin = document.getElementById('form-login');
    const formReg = document.getElementById('form-register');
    const tabLogin = document.getElementById('tab-login-btn');
    const tabReg = document.getElementById('tab-register-btn');

    if (tab === 'login') {
      if (formLogin) formLogin.classList.remove('hidden');
      if (formReg) formReg.classList.add('hidden');
      if (tabLogin) tabLogin.className = "flex-1 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400";
      if (tabReg) tabReg.className = "flex-1 py-2 text-xs font-bold text-slate-400 border-b-2 border-transparent hover:text-slate-600";
    } else {
      if (formLogin) formLogin.classList.add('hidden');
      if (formReg) formReg.classList.remove('hidden');
      if (tabReg) tabReg.className = "flex-1 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400";
      if (tabLogin) tabLogin.className = "flex-1 py-2 text-xs font-bold text-slate-400 border-b-2 border-transparent hover:text-slate-600";
    }
  }

  handleUserAvatarSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedUserAvatarDataUrl = e.target.result;
      const preview = document.getElementById('regAvatarPreview');
      if (preview) preview.src = this.selectedUserAvatarDataUrl;
    };
    reader.readAsDataURL(file);
  }

  handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    if (!email) return;

    const user = {
      name: email.split('@')[0],
      email: email.toLowerCase(),
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80"
    };

    this.model.setCurrentUser(user);
    this.handleCloseAuthModal();
    this.view.showToast(`👋 ¡Bienvenido de vuelta, ${user.name}!`, "success");
  }

  handleRegisterSubmit(e) {
    e.preventDefault();
    const nombre = document.getElementById('reg-name').value.trim();
    const apellido = document.getElementById('reg-lastname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const passConfirm = document.getElementById('reg-confirm-password').value;

    if (pass !== passConfirm) {
      this.view.showToast("Las contraseñas no coinciden.", "warning");
      return;
    }

    const newUser = {
      name: `${nombre} ${apellido}`.trim(),
      email: email.toLowerCase(),
      avatar: this.selectedUserAvatarDataUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
    };

    this.model.setCurrentUser(newUser);
    this.handleCloseAuthModal();
    this.view.showToast(`✨ Cuenta creada con éxito para ${newUser.name}.`, "success");
  }

  // --- AUTENTICACIÓN CON GOOGLE SIGN-IN ---
  handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      this.view.showToast("No se recibió credencial válida de Google.", "error");
      return;
    }

    try {
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      const payload = JSON.parse(jsonPayload);

      const user = {
        name: payload.name || payload.given_name || payload.email.split('@')[0],
        email: (payload.email || '').toLowerCase().trim(),
        avatar: payload.picture || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        googleId: payload.sub,
        isGoogle: true
      };

      this.model.setCurrentUser(user);
      this.handleCloseAuthModal();
      this.view.showToast(`✨ ¡Bienvenido(a) con Google, ${user.name}!`, "success");
    } catch (e) {
      console.error("Error decodificando token de Google:", e);
      this.view.showToast("Error procesando autenticación de Google.", "error");
    }
  }

  initGoogleAuth() {
    const setupGsi = () => {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        try {
          google.accounts.id.initialize({
            client_id: "18644068943-j2ij8oe9bnmjgk01e8rr5g8fvsito3je.apps.googleusercontent.com",
            callback: (res) => this.handleGoogleCredentialResponse(res),
            auto_select: false,
            cancel_on_tap_outside: true
          });
          const btnElem = document.getElementById('google-btn-rendered');
          if (btnElem) {
            google.accounts.id.renderButton(btnElem, {
              type: 'standard',
              shape: 'pill',
              theme: 'outline',
              text: 'continue_with',
              size: 'large',
              logo_alignment: 'left',
              width: 280
            });
          }
        } catch (err) {
          console.warn('GSI Setup Note:', err);
        }
      }
    };

    if (typeof google !== 'undefined' && google.accounts) {
      setupGsi();
    } else {
      window.addEventListener('load', () => setTimeout(setupGsi, 500));
    }
  }

  handleGooglePromptOrDemo() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      try {
        google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            this.handleGoogleDemoLogin();
          }
        });
      } catch (e) {
        this.handleGoogleDemoLogin();
      }
    } else {
      this.handleGoogleDemoLogin();
    }
  }

  handleGoogleDemoLogin() {
    const promptEmail = prompt("Ingresa tu cuenta de Google (Gmail):", "usuario.google@gmail.com");
    if (!promptEmail) return;

    const cleanEmail = promptEmail.trim().toLowerCase();
    const cleanName = cleanEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const googleUser = {
      name: cleanName || "Usuario Google",
      email: cleanEmail,
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
      isGoogle: true
    };

    this.model.setCurrentUser(googleUser);
    this.handleCloseAuthModal();
    this.view.showToast(`✨ ¡Bienvenido(a) con Google, ${googleUser.name}!`, "success");
  }

  // --- MODAL DE PORTAL (ADMIN / STAFF) ---
  handleOpenPortalModal(tab = 'admin') {
    const modal = document.getElementById('portal-modal');
    if (!modal) return;
    this.handleSwitchPortalTab(tab);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  handleClosePortalModal() {
    const modal = document.getElementById('portal-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  handleSwitchPortalTab(tab) {
    const formAdmin = document.getElementById('form-portal-admin');
    const formStaff = document.getElementById('form-portal-staff');
    const tabAdmin = document.getElementById('tab-portal-admin-btn');
    const tabStaff = document.getElementById('tab-portal-staff-btn');

    if (tab === 'admin') {
      if (formAdmin) formAdmin.classList.remove('hidden');
      if (formStaff) formStaff.classList.add('hidden');
      if (tabAdmin) tabAdmin.className = "flex-1 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400";
      if (tabStaff) tabStaff.className = "flex-1 py-2 text-xs font-bold text-slate-400 border-b-2 border-transparent hover:text-slate-600";
    } else {
      if (formAdmin) formAdmin.classList.add('hidden');
      if (formStaff) formStaff.classList.remove('hidden');
      if (tabStaff) tabStaff.className = "flex-1 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400";
      if (tabAdmin) tabAdmin.className = "flex-1 py-2 text-xs font-bold text-slate-400 border-b-2 border-transparent hover:text-slate-600";
    }
  }

  handleAdminLoginSubmit(e) {
    e.preventDefault();
    const user = document.getElementById('admin-user').value.trim();
    const pass = document.getElementById('admin-pass').value.trim();
    this.model.adminLogin(user, pass);
  }

  handleStaffLoginSubmit(e) {
    e.preventDefault();
    const user = document.getElementById('staff-user').value.trim();
    const pass = document.getElementById('staff-pass').value.trim();
    this.model.staffLogin(user, pass);
  }

  handleLogout() {
    this.model.logout();
    this.handleNavigate('client');
    this.view.showToast("Has cerrado sesión exitosamente.", "info");
  }

  // --- ADMINISTRADOR: GESTIÓN DE ENTRADAS & STAFF ---
  handleDeleteTicket(codigoCompra) {
    if (confirm(`¿Estás seguro de eliminar el boleto ${codigoCompra}? Esta acción liberará las sillas en el mapa inmediatamente.`)) {
      this.model.deleteTicket(codigoCompra);
      this.view.showToast(`Boleto ${codigoCompra} eliminado y puestos liberados.`, "info");
    }
  }

  handleStaffAvatarSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedStaffAvatarDataUrl = e.target.result;
      const preview = document.getElementById('newStaffAvatarPreview');
      if (preview) preview.src = this.selectedStaffAvatarDataUrl;
    };
    reader.readAsDataURL(file);
  }

  handleCreateStaffSubmit(e) {
    e.preventDefault();
    const nombre = document.getElementById('stf-nombre').value.trim();
    const apellido = document.getElementById('stf-apellido').value.trim();
    const username = document.getElementById('stf-username').value.trim();
    const password = document.getElementById('stf-password').value.trim();
    const doorSelect = document.getElementById('stf-door');
    const door = doorSelect ? doorSelect.value : "Puerta 1 - Acceso VIP & Diamond";

    let allowedZones = ['ALL'];
    if (door.includes('VIP') || door.includes('Diamond') || door.includes('1')) {
      allowedZones = ['DIAMOND'];
    } else if (door.includes('Gold') || door.includes('Preferencial') || door.includes('2')) {
      allowedZones = ['GOLD'];
    } else if (door.includes('Silver') || door.includes('General') || door.includes('3')) {
      allowedZones = ['SILVER'];
    } else {
      allowedZones = ['ALL'];
    }

    this.model.createStaff({
      nombre,
      apellido,
      username,
      password,
      door,
      allowedZones,
      avatar: this.selectedStaffAvatarDataUrl || "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80"
    });

    e.target.reset();
    this.selectedStaffAvatarDataUrl = null;
    this.view.showToast(`🛡️ Validador @${username} creado exitosamente con asignación: ${door}`, "success");
  }

  handleDeleteStaff(staffId) {
    if (confirm("¿Estás seguro de eliminar este usuario Staff?")) {
      this.model.deleteStaff(staffId);
      this.view.showToast("Usuario Staff eliminado.", "info");
    }
  }

  // --- STAFF: ESCÁNER QR ---
  initScanner() {
    const readerContainer = document.getElementById('reader');
    if (!readerContainer) return;

    if (this.html5QrCode) {
      try { this.html5QrCode.stop(); } catch (e) {}
    }

    if (typeof Html5QrcodeScanner !== 'undefined') {
      const scanner = new Html5QrcodeScanner("reader", {
        fps: 10,
        qrbox: 240,
        aspectRatio: 1.0
      });

      scanner.render((decodedText) => {
        try {
          const parsed = JSON.parse(decodedText);
          this.handleValidateCode(parsed.codigo || parsed.pedido || decodedText);
        } catch (e) {
          this.handleValidateCode(decodedText);
        }
      });
      this.html5QrCode = scanner;
    }
  }

  handleValidateManualCode() {
    const code = document.getElementById('input-manual-code').value.trim();
    if (!code) {
      this.view.showToast("Ingresa un código de entrada para validar.", "warning");
      return;
    }
    this.handleValidateCode(code);
  }

  handleValidateCode(code) {
    this.model.validateTicketQr(code);
  }

  setupGlobalShortcuts() {
    // Escape para cerrar cualquier modal abierto
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.handleCloseAuthModal();
        this.handleClosePortalModal();
        this.handleCloseCheckoutModal();
        this.handleCloseReceiptModal();
      }
    });
  }
}
