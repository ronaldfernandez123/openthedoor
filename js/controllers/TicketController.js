/* ==========================================================================
   OpenTheDoor - CONTROLLER (Controlador Principal, Eventos & Coordinación)
   ========================================================================== */

class TicketController {
  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.activeZone = 'SAHARA';
    this.timerInterval = null;
    this.html5QrCode = null;
    this.selectedStaffAvatarDataUrl = null;
    this.selectedUserAvatarDataUrl = null;
    this.lastConfirmedPurchase = null;
    this.pendingSeatSelection = null;
    this.pendingTableSelection = null;
    this.html5QrEngine = null;
    this.isCameraScanning = false;
    this.cameraFacingMode = "environment";
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
      this.view.renderSelectionSidebar(seats, (id, type) => this.model.getSeatPrice(id, type), expiresAt, (id) => this.model.getSeatType(id));
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
      this.view.renderAdminPanel(data, this.model.currentStage, this.model.isAutoStage);
    });

    this.model.on('stageChanged', () => {
      this.updateActiveStageUI();
      this.renderTableMap();
      this.view.renderAdminPanel(this.model.adminData, this.model.currentStage, this.model.isAutoStage);
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
      if (user) {
        if (this.pendingSeatSelection) {
          const seatToReserve = this.pendingSeatSelection;
          this.pendingSeatSelection = null;
          setTimeout(() => {
            this.handleToggleSeat(seatToReserve);
          }, 300);
        } else if (this.pendingTableSelection) {
          const tableToReserve = this.pendingTableSelection;
          this.pendingTableSelection = null;
          setTimeout(() => {
            this.handleBuyFullTable(tableToReserve);
          }, 300);
        }
      }
    });
  }

  // --- RENDERIZADO GENERAL ---
  renderAll() {
    this.view.renderHeaderUser(this.model.currentUser, this.model.currentAdmin, this.model.currentStaff);
    this.renderTableMap();
    this.updateActiveStageUI();
    this.view.renderSelectionSidebar(
      this.model.mySelectedSeats,
      (id, type) => this.model.getSeatPrice(id, type),
      this.model.lockExpiresAt,
      (id) => this.model.getSeatType(id)
    );
    if (this.model.currentAdmin) {
      this.view.renderAdminPanel(this.model.adminData, this.model.currentStage, this.model.isAutoStage);
    }
  }

  renderTableMap() {
    const socketId = this.model.socket ? this.model.socket.id : null;
    const zones = (this.model.eventInfo && this.model.eventInfo.zones && this.model.eventInfo.zones.SAHARA)
      ? this.model.eventInfo.zones
      : EVENT_CONFIG.zones;

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

    // Controlar visibilidad del botón flotante para volver a Admin
    const floatBar = document.getElementById('admin-floating-bar');
    if (floatBar) {
      if (this.model.currentAdmin && viewName !== 'admin') {
        floatBar.classList.remove('hidden');
      } else {
        floatBar.classList.add('hidden');
      }
    }

    if (viewName === 'my-tickets') {
      if (!this.model.currentUser) {
        this.handleOpenAuthModal('login');
        return;
      }
      this.model.fetchUserTickets();
    } else if (viewName === 'staff') {
      this.initScanner();
    } else {
      if (this.isCameraScanning) {
        this.handleStopCameraScan();
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- NAVEGACIÓN INTELIGENTE A SECCIONES (DESDE ADMIN, CLIENTE O CUALQUIER VISTA) ---
  handleNavToSection(sectionId, event) {
    if (event) {
      event.preventDefault();
    }

    const clientView = document.getElementById('view-client');
    const wasHidden = clientView && clientView.classList.contains('hidden');

    if (wasHidden) {
      // Activar vista cliente
      const views = {
        client: document.getElementById('view-client'),
        'my-tickets': document.getElementById('view-my-tickets'),
        admin: document.getElementById('view-admin'),
        staff: document.getElementById('view-staff')
      };
      Object.keys(views).forEach(k => {
        if (views[k]) {
          if (k === 'client') views[k].classList.remove('hidden');
          else views[k].classList.add('hidden');
        }
      });

      const floatBar = document.getElementById('admin-floating-bar');
      if (floatBar && this.model.currentAdmin) {
        floatBar.classList.remove('hidden');
      }
    }

    const performScroll = () => {
      if (sectionId === 'hero' || sectionId === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        history.pushState(null, null, '#hero');
        return;
      }

      // Si se selecciona 'zones' o 'mapa-reserva', asegurar que el mapa esté desplegado y la zona visible
      if (sectionId === 'zones' || sectionId === 'mapa-reserva') {
        this.handleEnsureMapOpen();
        const saharaContent = document.getElementById('zone-content-sahara');
        if (saharaContent && saharaContent.classList.contains('hidden')) {
          this.handleToggleZone('sahara');
        }
      }

      const target = document.getElementById(sectionId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, null, `#${sectionId}`);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    if (wasHidden) {
      setTimeout(performScroll, 70);
    } else {
      performScroll();
    }
  }

  // --- CONTROL DEL DESPLEGABLE "MAPA DE ORGANIZACIÓN DE MESAS" ---
  handleToggleMap() {
    const mapContent = document.getElementById('mapa-reserva-content');
    const toggleLabel = document.getElementById('mapa-toggle-label');
    const toggleBtn = document.getElementById('btn-toggle-mapa');
    if (!mapContent) return;

    const isClosed = mapContent.classList.contains('hidden');
    if (isClosed) {
      this.handleEnsureMapOpen();
      setTimeout(() => {
        const target = document.getElementById('mapa-reserva');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    } else {
      mapContent.classList.add('hidden');
      if (toggleLabel) {
        toggleLabel.innerHTML = '<span>Desplegar Mapa</span><i id="mapa-toggle-icon" class="fa-solid fa-chevron-down text-xs transition-transform duration-300"></i>';
      }
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    }
  }

  handleEnsureMapOpen() {
    const mapContent = document.getElementById('mapa-reserva-content');
    const toggleLabel = document.getElementById('mapa-toggle-label');
    const toggleBtn = document.getElementById('btn-toggle-mapa');
    if (!mapContent) return;

    if (mapContent.classList.contains('hidden')) {
      mapContent.classList.remove('hidden');
      if (toggleLabel) {
        toggleLabel.innerHTML = '<span>Ocultar Mapa</span><i id="mapa-toggle-icon" class="fa-solid fa-chevron-up text-xs transition-transform duration-300"></i>';
      }
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'true');
      }
      // Re-renderizar las mesas para asegurar estado actualizado
      this.renderTableMap();
    }
  }

  // --- ACORDEÓN DE ZONAS (SAHARA, OASIS, NOMAD) ---
  handleToggleZone(selectedZone) {
    this.activeZone = selectedZone.toUpperCase();
    const zones = ['sahara', 'oasis', 'nomad'];

    zones.forEach(z => {
      const content = document.getElementById(`zone-content-${z}`);
      const header = document.getElementById(`zone-header-${z}`);
      const icon = document.getElementById(`zone-icon-${z}`);

      if (z === selectedZone.toLowerCase()) {
        const isClosed = content.classList.contains('hidden');
        if (isClosed) {
          content.classList.remove('hidden');
          if (icon) icon.className = "fa-solid fa-chevron-down text-xs transition-transform";
          if (header) header.classList.add('bg-amber-50', 'dark:bg-slate-700/80');
        } else {
          content.classList.add('hidden');
          if (icon) icon.className = "fa-solid fa-chevron-right text-xs transition-transform";
          if (header) header.classList.remove('bg-amber-50', 'dark:bg-slate-700/80');
        }
      } else {
        content.classList.add('hidden');
        if (icon) icon.className = "fa-solid fa-chevron-right text-xs transition-transform";
        if (header) header.classList.remove('bg-amber-50', 'dark:bg-slate-700/80');
      }
    });
  }

  // --- REDIRECCIÓN Y APERTURA DE ZONA DESDE LAS TARJETAS DE PRECIOS (IMAGEN 1) ---
  handleSelectZoneFromPrices(selectedZone) {
    const z = (selectedZone || 'sahara').toLowerCase();

    // Si la vista principal de cliente estaba oculta, activarla
    const clientView = document.getElementById('view-client');
    if (clientView && clientView.classList.contains('hidden')) {
      this.handleNavigate('client');
    }

    // Asegurar que el mapa de organización de mesas esté desplegado
    this.handleEnsureMapOpen();

    // Asegurarse de abrir la zona seleccionada en el acordeón del mapa
    const zones = ['sahara', 'oasis', 'nomad'];
    zones.forEach(zoneKey => {
      const content = document.getElementById(`zone-content-${zoneKey}`);
      const header = document.getElementById(`zone-header-${zoneKey}`);
      const icon = document.getElementById(`zone-icon-${zoneKey}`);
      if (zoneKey === z) {
        if (content) content.classList.remove('hidden');
        if (icon) icon.className = "fa-solid fa-chevron-down text-xs transition-transform";
        if (header) header.classList.add('bg-amber-50', 'dark:bg-slate-700/80');
      } else {
        if (content) content.classList.add('hidden');
        if (icon) icon.className = "fa-solid fa-chevron-right text-xs transition-transform";
        if (header) header.classList.remove('bg-amber-50', 'dark:bg-slate-700/80');
      }
    });

    // Scroll suave hacia el encabezado de la zona
    const zoneHeader = document.getElementById(`zone-header-${z}`);
    if (zoneHeader) {
      zoneHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      this.handleNavToSection('mapa-reserva');
    }

    const zoneNames = {
      sahara: 'Zona Sahara (Primera Línea VIP)',
      oasis: 'Zona Oasis (Área Central Preferencial)',
      nomad: 'Zona Nomad (Área General & Lounge)'
    };
    this.view.showToast(`📍 Mostrando puestos disponibles para ${zoneNames[z] || z}.`, 'info');
  }

  // --- INTERACCIÓN CON SILLAS & MESAS (PANTALLA EMERGENTE ADULTO / NIÑO) ---
  handleToggleSeat(seatId) {
    // Si no ha iniciado sesión, exigir inicio de sesión inmediato
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.pendingSeatSelection = seatId;
      this.view.showToast("Debes iniciar sesión para seleccionar y comprar tus sillas.", "warning");
      this.handleOpenAuthModal('login');
      return;
    }

    // Si ya está seleccionado por el usuario, liberarlo / quitarlo
    if (this.model.mySelectedSeats.includes(seatId)) {
      const res = this.model.toggleSeat(seatId);
      if (res.success) {
        this.view.showToast(`Puesto ${seatId} liberado.`, "info");
      }
      return;
    }

    const state = this.model.seatsState[seatId];
    if (state && (state.status === 'sold' || (state.status === 'locked' && (!this.model.socket || state.userId !== this.model.socket.id)))) {
      this.view.showToast("Este puesto ya no está disponible.", "warning");
      return;
    }

    // Abrir pantalla emergente para seleccionar si es Niño o Adulto
    this.handleOpenSeatTypeModal(seatId);
  }

  handleOpenSeatTypeModal(seatId) {
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.pendingSeatSelection = seatId;
      this.view.showToast("Debes iniciar sesión para seleccionar tus puestos.", "warning");
      this.handleOpenAuthModal('login');
      return;
    }

    const zoneKey = this.model.getZoneBySeatId(seatId);
    const zoneConfig = EVENT_CONFIG.zones[zoneKey] || { name: `Zona ${zoneKey}`, badgeColor: 'bg-amber-500 text-slate-900' };
    const priceAdult = this.model.getSeatPrice(seatId, 'ADULTO');
    const priceChild = this.model.getSeatPrice(seatId, 'NINO');
    const currentType = this.model.getSeatType(seatId);

    const stagesNames = {
      PREVENTA: "Preventa (Hasta 15 Oct)",
      ETAPA_2: "Etapa 2 (16-30 Nov)",
      FULL: "Precio Full (Desde 1 Dic)"
    };
    const stageName = stagesNames[this.model.currentStage] || "Preventa";

    this.view.openSeatTypeModal({
      seatId,
      zoneName: zoneConfig.name,
      badgeClass: zoneConfig.badgeColor,
      stageName,
      priceAdult,
      priceChild,
      currentType,
      onSelect: (id, type) => this.handleSelectSeatType(id, type)
    });
  }

  handleSelectSeatType(seatId, type) {
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.pendingSeatSelection = seatId;
      this.view.showToast("Debes iniciar sesión para seleccionar tus puestos.", "warning");
      this.handleOpenAuthModal('login');
      return;
    }

    if (this.model.mySelectedSeats.includes(seatId)) {
      this.model.setSeatType(seatId, type);
      this.view.showToast(`Puesto ${seatId} actualizado a ${type === 'NINO' ? 'Niño (4-11 años)' : 'Adulto'}.`, "info");
      return;
    }

    const res = this.model.toggleSeat(seatId, type);
    if (!res.success) {
      this.view.showToast(res.message, "warning");
    } else {
      this.view.showToast(`Puesto ${seatId} seleccionado como ${type === 'NINO' ? 'Niño (4-11 años)' : 'Adulto'}.`, "success");
    }
  }

  handleSetStage(stageId) {
    this.model.setStage(stageId);
    const stagesNames = {
      AUTO: "Automático según fecha del calendario",
      PREVENTA: "Preventa (Hasta 15 Oct)",
      ETAPA_2: "Etapa 2 (16-30 Nov)",
      FULL: "Precio Full (Desde 1 Dic)"
    };
    this.view.showToast(`Tarifas cambiadas a: ${stagesNames[stageId] || stageId}`, "info");
    this.updateActiveStageUI();
  }

  handleAdminChangeStage(stageMode) {
    this.model.setStage(stageMode);
    const names = {
      AUTO: "Automático según fecha del calendario",
      PREVENTA: "Preventa (Hasta 15 Oct)",
      ETAPA_2: "Etapa 2 (16-30 Nov)",
      FULL: "Precio Full (Desde 1 Dic)"
    };
    this.view.showToast(`Tarifas actualizadas en todo el sistema: ${names[stageMode] || stageMode}`, "info");
    this.updateActiveStageUI();
    this.view.renderAdminPanel(this.model.adminData, this.model.currentStage, this.model.isAutoStage);
  }

  updateActiveStageUI() {
    const stage = this.model.currentStage;
    const isAuto = this.model.isAutoStage;
    const stageInfo = (typeof PRICING_STAGES !== 'undefined' && PRICING_STAGES[stage]) 
      ? PRICING_STAGES[stage] 
      : { name: 'Preventa', tagline: 'Hasta 15 Oct' };

    // 1. Badge de etapa en Hero
    const stageBadge = document.getElementById('current-stage-badge');
    if (stageBadge) {
      const colorBg = stage === 'PREVENTA' ? 'bg-amber-500 text-slate-950' : (stage === 'ETAPA_2' ? 'bg-orange-500 text-white' : 'bg-red-600 text-white');
      stageBadge.innerHTML = `
        <div class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl ${colorBg} font-black text-xs shadow-lg">
          <i class="fa-solid fa-tag"></i>
          <span>${stageInfo.name.toUpperCase()} (${stageInfo.tagline})</span>
          ${isAuto ? '<span class="text-[9px] uppercase tracking-wider bg-black/25 px-1.5 py-0.5 rounded-full font-bold ml-0.5">Automático</span>' : '<span class="text-[9px] uppercase tracking-wider bg-black/25 px-1.5 py-0.5 rounded-full font-bold ml-0.5">Manual</span>'}
        </div>
      `;
    }

    // 2. Columna activa resaltada en las 3 tarjetas de precios (Imagen 1)
    const stageKey = (stage || 'PREVENTA').toLowerCase(); // 'preventa', 'etapa_2', 'full'
    const stages = ['preventa', 'etapa_2', 'full'];
    const zones = ['sahara', 'oasis', 'nomad'];

    zones.forEach(zone => {
      stages.forEach(st => {
        const topCell = document.getElementById(`price-cell-${zone}-${st}-adult`);
        const bottomCell = document.getElementById(`price-cell-${zone}-${st}-child`);
        if (topCell && bottomCell) {
          if (st === stageKey) {
            topCell.classList.add('stage-pill-top');
            bottomCell.classList.add('stage-pill-bottom');
          } else {
            topCell.classList.remove('stage-pill-top');
            bottomCell.classList.remove('stage-pill-bottom');
          }
        }
      });
    });

    // 3. Precios en cabeceras de acordeón
    const priceSahara = document.getElementById('price-header-sahara');
    const priceOasis = document.getElementById('price-header-oasis');
    const priceNomad = document.getElementById('price-header-nomad');

    if (priceSahara) {
      const a = this.model.getSeatPrice('A1-S1', 'ADULTO');
      const n = this.model.getSeatPrice('A1-S1', 'NINO');
      priceSahara.textContent = `Adulto: $${a.toLocaleString('es-CO')} | Niño: $${n.toLocaleString('es-CO')}`;
    }
    if (priceOasis) {
      const a = this.model.getSeatPrice('C1-S1', 'ADULTO');
      const n = this.model.getSeatPrice('C1-S1', 'NINO');
      priceOasis.textContent = `Adulto: $${a.toLocaleString('es-CO')} | Niño: $${n.toLocaleString('es-CO')}`;
    }
    if (priceNomad) {
      const a = this.model.getSeatPrice('I1-S1', 'ADULTO');
      const n = this.model.getSeatPrice('I1-S1', 'NINO');
      priceNomad.textContent = `Adulto: $${a.toLocaleString('es-CO')} | Niño: $${n.toLocaleString('es-CO')}`;
    }
  }

  handleBuyFullTable(tableId) {
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.pendingTableSelection = tableId;
      this.view.showToast("Inicia sesión o regístrate para reservar la mesa completa.", "warning");
      this.handleOpenAuthModal('login');
      return;
    }

    const res = this.model.selectFullTable(tableId, 'ADULTO');
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

  handleStartCheckout() {
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.view.showToast("Debes iniciar sesión para completar la compra de tus entradas.", "warning");
      this.handleOpenAuthModal('login');
      return;
    }

    if (this.model.mySelectedSeats.length === 0) {
      this.view.showToast("No has seleccionado ninguna silla aún.", "warning");
      return;
    }

    const modal = document.getElementById('checkout-modal');
    if (!modal) return;

    const total = this.model.getSelectionTotal();
    const user = this.model.currentUser || { name: (this.model.currentAdmin ? this.model.currentAdmin.name : ""), email: "" };

    const breakdownList = this.model.mySelectedSeats.map(id => {
      const type = this.model.getSeatType(id);
      return `${id} (${type === 'NINO' ? 'Niño' : 'Adulto'})`;
    }).join(', ');

    document.getElementById('checkoutTotalBadge').textContent = `$${total.toLocaleString('es-CO')} COP`;
    document.getElementById('checkoutSeatsList').textContent = breakdownList;
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
    if (!this.model.currentUser && !this.model.currentAdmin) {
      this.view.showToast("Debes iniciar sesión para confirmar la compra.", "error");
      this.handleOpenAuthModal('login');
      return;
    }
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
    const puestosStr = (Array.isArray(p.puestosDetalles) && p.puestosDetalles.length > 0)
      ? p.puestosDetalles.map(d => `${d.puesto} (${d.tipo === 'NINO' ? 'Niño' : 'Adulto'})`).join(', ')
      : (Array.isArray(p.puestos) ? p.puestos.join(', ') : '');
    const text = `🎟️ ¡Mis Boletos para la Cena San Silvestre 2026 - Hotel Cartagena Plaza!\nCódigo Único: ${p.codigoCompra}\nPuerta: ${p.puertaSugerida || 'Puerta Asignada'}\nPuestos (${p.numEntradas || p.puestos.length}): ${puestosStr}\nTotal: $${p.total.toLocaleString('es-CO')} COP\n(1 Solo Código QR para toda la reserva)`;
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
      if (tabLogin) tabLogin.className = "flex-1 py-2 text-xs font-bold text-amber-600 dark:text-amber-400 border-b-2 border-amber-600 dark:border-amber-400";
      if (tabReg) tabReg.className = "flex-1 py-2 text-xs font-bold text-slate-400 border-b-2 border-transparent hover:text-slate-600";
    } else {
      if (formLogin) formLogin.classList.add('hidden');
      if (formReg) formReg.classList.remove('hidden');
      if (tabReg) tabReg.className = "flex-1 py-2 text-xs font-bold text-amber-600 dark:text-amber-400 border-b-2 border-amber-600 dark:border-amber-400";
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
    this.clearPortalInputs();
    this.handleSwitchPortalTab(tab);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  handleClosePortalModal() {
    const modal = document.getElementById('portal-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      this.clearPortalInputs();
    }
  }

  clearPortalInputs() {
    const uAdmin = document.getElementById('admin-user');
    const pAdmin = document.getElementById('admin-pass');
    const uStaff = document.getElementById('staff-user');
    const pStaff = document.getElementById('staff-pass');
    if (uAdmin) uAdmin.value = '';
    if (pAdmin) pAdmin.value = '';
    if (uStaff) uStaff.value = '';
    if (pStaff) pStaff.value = '';
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
    this.pendingSeatSelection = null;
    this.pendingTableSelection = null;
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
    if (door.includes('VIP') || door.includes('Sahara') || door.includes('1')) {
      allowedZones = ['SAHARA'];
    } else if (door.includes('Oasis') || door.includes('Preferencial') || door.includes('2')) {
      allowedZones = ['OASIS'];
    } else if (door.includes('Nomad') || door.includes('General') || door.includes('3')) {
      allowedZones = ['NOMAD'];
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

  // --- STAFF & ADMIN: MÓDULO ESCÁNER QR ---
  initScanner() {
    const readerContainer = document.getElementById('reader');
    if (!readerContainer) return;

    // Configurar badge de rol y botón de retorno
    const btnReturn = document.getElementById('btn-scanner-return');
    const badgeRole = document.getElementById('scanner-role-badge');
    
    if (this.model.currentAdmin) {
      if (badgeRole) {
        badgeRole.textContent = "Super Administrador";
        badgeRole.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300";
      }
      if (btnReturn) {
        btnReturn.innerHTML = `<i class="fa-solid fa-chart-line"></i> <span>Volver al Panel Administrador</span>`;
        btnReturn.onclick = () => this.handleNavigate('admin');
      }
    } else if (this.model.currentStaff) {
      if (badgeRole) {
        badgeRole.textContent = `Staff: ${this.model.currentStaff.door || 'Validador'}`;
        badgeRole.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300";
      }
      if (btnReturn) {
        btnReturn.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> <span>Volver al Plano</span>`;
        btnReturn.onclick = () => this.handleNavigate('client');
      }
    }

    // Inicializar instancia de Html5Qrcode si no existe
    if (!this.html5QrEngine && typeof Html5Qrcode !== 'undefined') {
      try {
        this.html5QrEngine = new Html5Qrcode("reader");
      } catch (e) {
        console.warn('Error inicializando Html5Qrcode engine:', e);
      }
    }
  }

  handleSwitchScannerTab(tab) {
    const tabs = ['camera', 'file', 'manual'];
    tabs.forEach(t => {
      const panel = document.getElementById(`panel-scanner-${t}`);
      const btn = document.getElementById(`tab-scan-${t}-btn`);
      if (panel) {
        if (t === tab) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }
      if (btn) {
        if (t === tab) {
          btn.className = "flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-black shadow-sm transition-all";
        } else {
          btn.className = "flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all";
        }
      }
    });

    if (tab !== 'camera') {
      this.handleStopCameraScan();
    }
  }

  async handleStartCameraScan() {
    const placeholder = document.getElementById('camera-idle-placeholder');
    const errorBanner = document.getElementById('camera-error-banner');
    const errorMsg = document.getElementById('camera-error-msg');
    const activeControls = document.getElementById('camera-active-controls');

    if (errorBanner) errorBanner.classList.add('hidden');

    if (!this.html5QrEngine && typeof Html5Qrcode !== 'undefined') {
      try {
        this.html5QrEngine = new Html5Qrcode("reader");
      } catch (e) {
        console.warn('Error instanciando Html5Qrcode:', e);
      }
    }

    if (!this.html5QrEngine) {
      if (errorBanner) errorBanner.classList.remove('hidden');
      if (errorMsg) errorMsg.textContent = "El motor del escáner no se encuentra disponible. Puedes subir la imagen o validar el código manualmente.";
      return;
    }

    try {
      if (placeholder) placeholder.classList.add('hidden');
      
      const config = {
        fps: 12,
        qrbox: { width: 230, height: 230 },
        aspectRatio: 1.0
      };

      await this.html5QrEngine.start(
        { facingMode: this.cameraFacingMode || "environment" },
        config,
        (decodedText) => {
          this.handleValidateCode(decodedText);
          this.view.showToast("⚡ Código detectado correctamente", "success");
        },
        (error) => {
          // Ignorar cuadros sin código
        }
      );

      this.isCameraScanning = true;
      if (activeControls) activeControls.classList.remove('hidden');

    } catch (err) {
      console.warn("Error al encender cámara:", err);
      this.isCameraScanning = false;
      if (placeholder) placeholder.classList.add('hidden');
      if (errorBanner) errorBanner.classList.remove('hidden');
      if (activeControls) activeControls.classList.add('hidden');

      let userMsg = "No se pudo acceder a la cámara. Asegúrate de otorgar permisos al navegador.";
      const errStr = String(err);
      if (errStr.includes('NotFoundError') || errStr.includes('Requested device not found')) {
        userMsg = "No se detectó ninguna cámara web conectada a este equipo. Puedes usar 'Subir Foto QR' o 'Código Manual'.";
      } else if (errStr.includes('NotAllowedError') || errStr.includes('Permission denied')) {
        userMsg = "Permiso de cámara denegado. Permite el acceso a la cámara en los permisos de tu navegador o usa 'Subir Foto QR'.";
      }
      if (errorMsg) errorMsg.textContent = userMsg;
      this.view.showToast(userMsg, "warning");
    }
  }

  async handleStopCameraScan() {
    const placeholder = document.getElementById('camera-idle-placeholder');
    const activeControls = document.getElementById('camera-active-controls');

    if (this.html5QrEngine && this.isCameraScanning) {
      try {
        await this.html5QrEngine.stop();
      } catch (e) {
        console.warn("Error al detener cámara:", e);
      }
      this.isCameraScanning = false;
    }

    if (activeControls) activeControls.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
  }

  async handleToggleCameraDevice() {
    this.cameraFacingMode = (this.cameraFacingMode === "user") ? "environment" : "user";
    await this.handleStopCameraScan();
    await this.handleStartCameraScan();
  }

  async handleQrFileScan(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!this.html5QrEngine && typeof Html5Qrcode !== 'undefined') {
      try {
        this.html5QrEngine = new Html5Qrcode("reader");
      } catch (e) {}
    }

    this.view.showToast("🔍 Procesando imagen QR...", "info");

    try {
      const decodedText = await this.html5QrEngine.scanFile(file, true);
      this.handleValidateCode(decodedText);
      this.view.showToast("✅ ¡Código QR leído exitosamente desde el archivo!", "success");
    } catch (err) {
      console.warn("Error leyendo QR desde archivo:", err);
      this.view.showToast("No se pudo detectar un código QR claro en esta imagen. Puedes ingresar el código alfanumérico manualmente.", "warning");
    }

    event.target.value = '';
  }

  handleQuickTestCode(code) {
    const input = document.getElementById('input-manual-code');
    if (input) input.value = code;
    this.handleValidateCode(code);
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
