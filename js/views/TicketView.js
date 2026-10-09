/* ==========================================================================
   OpenTheDoor - VIEW (Renderizado de Interfaz, Mesas, Puertas & Validaciones)
   ========================================================================== */

class TicketView {
  constructor() {
    this.toastContainer = document.getElementById('toastContainer');
  }

  showToast(message, type = "info") {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    const colors = {
      info: "bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-950/50",
      success: "bg-emerald-600 text-white shadow-emerald-200 dark:shadow-emerald-950/50",
      warning: "bg-amber-500 text-slate-900 shadow-amber-200 dark:shadow-amber-950/50",
      error: "bg-rose-600 text-white shadow-rose-200 dark:shadow-rose-950/50"
    };
    const icons = {
      info: "fa-circle-info",
      success: "fa-circle-check",
      warning: "fa-triangle-exclamation",
      error: "fa-circle-xmark"
    };

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl font-medium text-xs sm:text-sm transition-all duration-300 transform translate-y-4 opacity-0 ${colors[type] || colors.info}`;
    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info} text-base shrink-0"></i>
      <span class="flex-1 leading-snug">${message}</span>
      <button onclick="this.parentElement.remove()" class="opacity-70 hover:opacity-100 transition-opacity ml-2 shrink-0">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  updateThemeIcon(theme) {
    const btn = document.getElementById('btnToggleTheme');
    if (!btn) return;
    btn.innerHTML = theme === 'dark' 
      ? '<i class="fa-solid fa-sun text-amber-400"></i>' 
      : '<i class="fa-solid fa-moon text-slate-600 dark:text-slate-300"></i>';
  }

  renderHeaderUser(user, admin, staff) {
    const authGroup = document.getElementById('auth-buttons-group');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const btnAdmin = document.getElementById('btn-panel-admin');
    const btnStaff = document.getElementById('btn-panel-staff');
    const btnMisBoletas = document.getElementById('btn-mis-boletas');
    const btnScannerAdmin = document.getElementById('btn-scanner-admin');

    if (admin) {
      if (authGroup) authGroup.classList.add('hidden');
      if (userInfo) userInfo.classList.remove('hidden');
      if (userName) userName.textContent = `Admin (${admin.name || admin.username})`;
      if (userAvatar) userAvatar.src = admin.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80";
      if (btnAdmin) btnAdmin.classList.remove('hidden');
      if (btnScannerAdmin) btnScannerAdmin.classList.remove('hidden');
      if (btnStaff) btnStaff.classList.add('hidden');
      if (btnMisBoletas) btnMisBoletas.classList.add('hidden');
    } else if (staff) {
      if (authGroup) authGroup.classList.add('hidden');
      if (userInfo) userInfo.classList.remove('hidden');
      if (userName) userName.textContent = `Staff: ${staff.nombre} (${staff.door || 'Puerta'})`;
      if (userAvatar) userAvatar.src = staff.avatar || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80";
      if (btnAdmin) btnAdmin.classList.add('hidden');
      if (btnScannerAdmin) btnScannerAdmin.classList.add('hidden');
      if (btnStaff) btnStaff.classList.remove('hidden');
      if (btnMisBoletas) btnMisBoletas.classList.add('hidden');
    } else if (user) {
      if (authGroup) authGroup.classList.add('hidden');
      if (userInfo) userInfo.classList.remove('hidden');
      if (userName) userName.textContent = user.name || user.email.split('@')[0];
      if (userAvatar) userAvatar.src = user.avatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80";
      if (btnAdmin) btnAdmin.classList.add('hidden');
      if (btnScannerAdmin) btnScannerAdmin.classList.add('hidden');
      if (btnStaff) btnStaff.classList.add('hidden');
      if (btnMisBoletas) btnMisBoletas.classList.remove('hidden');
    } else {
      if (authGroup) authGroup.classList.remove('hidden');
      if (userInfo) userInfo.classList.add('hidden');
      if (btnAdmin) btnAdmin.classList.add('hidden');
      if (btnScannerAdmin) btnScannerAdmin.classList.add('hidden');
      if (btnStaff) btnStaff.classList.add('hidden');
      if (btnMisBoletas) btnMisBoletas.classList.add('hidden');
    }
  }

  // --- MAPA DE MESAS CIRCULARES ---
  renderTableGrid(zoneKey, zoneConfig, seatsState, mySelectedSeats, socketId) {
    const container = document.getElementById(`tables-zone-${zoneKey.toLowerCase()}`);
    if (!container) return;

    let html = '';
    const startChar = zoneConfig.start.charCodeAt(0);
    const endChar = zoneConfig.end.charCodeAt(0);

    for (let charCode = startChar; charCode <= endChar; charCode++) {
      const letra = String.fromCharCode(charCode);
      for (let i = 1; i <= zoneConfig.tablesPerLetter; i++) {
        const tableId = `${letra}${i}`;
        html += this.buildTableHtml(tableId, zoneKey, zoneConfig, seatsState, mySelectedSeats, socketId);
      }
    }

    container.innerHTML = html;
  }

  buildTableHtml(tableId, zoneKey, zoneConfig, seatsState, mySelectedSeats, socketId) {
    let seatsHtml = '';
    let availableCount = 0;

    for (let s = 1; s <= 10; s++) {
      const seatId = `${tableId}-S${s}`;
      const state = seatsState[seatId];
      let statusClass = 'available';
      let titleTooltip = `Puesto: ${seatId} | ${zoneConfig.name} | ${zoneConfig.door || 'Puerta'} | $${zoneConfig.price.toLocaleString('es-CO')} COP`;

      if (state) {
        if (state.status === 'sold') {
          statusClass = 'sold';
          titleTooltip = `Puesto: ${seatId} (VENDIDO)`;
        } else if (state.status === 'locked') {
          if (socketId && state.userId === socketId) {
            statusClass = 'my-selection';
            titleTooltip = `Puesto: ${seatId} (Tu Selección - Bloqueado)`;
          } else {
            statusClass = 'locked';
            titleTooltip = `Puesto: ${seatId} (En Proceso de Pago por Otro Usuario)`;
          }
        }
      }

      if (mySelectedSeats.includes(seatId)) {
        statusClass = 'my-selection';
      }

      if (statusClass === 'available') {
        availableCount++;
      }

      // Distribución circular de 10 sillas
      const angle = (s - 1) * 36 * (Math.PI / 180);
      const left = Math.round(48 + 42 * Math.cos(angle) - 9);
      const top = Math.round(48 + 42 * Math.sin(angle) - 9);

      seatsHtml += `
        <div 
          class="seat ${statusClass}" 
          id="seat-${seatId}" 
          data-seat-id="${seatId}" 
          style="left: ${left}px; top: ${top}px;" 
          title="${titleTooltip}"
          onclick="appController.handleToggleSeat('${seatId}')">
        </div>
      `;
    }

    const isFullAvailable = availableCount === 10;
    const isFullSold = availableCount === 0;

    return `
      <div class="table-card ${isFullSold ? 'opacity-60 border-rose-300 dark:border-rose-900' : ''}" id="table-${tableId}">
        <div class="table-label">
          <div class="font-black text-xs text-slate-800 dark:text-slate-100">${tableId}</div>
          ${isFullAvailable ? `
            <button type="button" class="btn-buy-table" onclick="event.stopPropagation(); appController.handleBuyFullTable('${tableId}')" title="Bloquear los 10 puestos de esta mesa">
              Mesa Completa
            </button>
          ` : `
            <span class="text-[9px] font-bold ${availableCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}">
              ${availableCount}/10
            </span>
          `}
        </div>
        ${seatsHtml}
      </div>
    `;
  }

  renderSelectionSidebar(mySelectedSeats, getSeatPriceFn, lockExpiresAt) {
    const listContainer = document.getElementById('selected-list');
    const totalEl = document.getElementById('total-price');
    const timerEl = document.getElementById('timer-display');
    const btnCheckout = document.getElementById('btn-checkout');
    const countBadge = document.getElementById('selected-count-badge');

    if (!listContainer || !totalEl || !btnCheckout) return;

    if (countBadge) countBadge.textContent = mySelectedSeats.length;

    if (mySelectedSeats.length === 0) {
      listContainer.innerHTML = `
        <div class="p-6 text-center text-slate-400 dark:text-slate-500 space-y-2">
          <i class="fa-solid fa-chair text-3xl opacity-40"></i>
          <p class="text-xs font-semibold">Haz clic en los puestos verdes del mapa para seleccionar tus sillas o reservar mesas completas.</p>
        </div>
      `;
      totalEl.textContent = "$0 COP";
      btnCheckout.disabled = true;
      if (timerEl) {
        timerEl.textContent = "⏱️ Tiempo de Reserva: 05:00";
        timerEl.className = "timer bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-2.5 rounded-xl text-xs font-bold text-center border border-slate-200 dark:border-slate-700";
      }
      return;
    }

    btnCheckout.disabled = false;
    let total = 0;
    let html = '<div class="space-y-2 max-h-52 overflow-y-auto pr-1">';

    mySelectedSeats.forEach(seatId => {
      const price = getSeatPriceFn(seatId);
      total += price;
      const letter = seatId.charAt(0).toUpperCase();
      let zoneName = "Zona Silver";
      let doorName = "Puerta 3";
      let badgeClass = "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";

      if (letter >= 'A' && letter <= 'B') {
        zoneName = "Diamond VIP";
        doorName = "Puerta 1 (VIP)";
        badgeClass = "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
      } else if (letter >= 'C' && letter <= 'H') {
        zoneName = "Gold Preferencial";
        doorName = "Puerta 2 (Gold)";
        badgeClass = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
      }

      html += `
        <div class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-[10px]">
              <i class="fa-solid fa-chair"></i>
            </span>
            <div>
              <div class="font-extrabold text-slate-800 dark:text-slate-100">${seatId}</div>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="text-[9px] font-bold px-1.5 py-0.2 rounded ${badgeClass}">${zoneName}</span>
                <span class="text-[9px] font-bold text-slate-400">🚪 ${doorName}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">$${price.toLocaleString('es-CO')}</span>
            <button onclick="appController.handleToggleSeat('${seatId}')" class="text-slate-400 hover:text-rose-500 transition-colors p-1" title="Quitar puesto">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `;
    });

    html += '</div>';
    listContainer.innerHTML = html;
    totalEl.textContent = `$${total.toLocaleString('es-CO')} COP`;
  }

  updateTimerDisplay(remainingSeconds) {
    const timerEl = document.getElementById('timer-display');
    if (!timerEl) return;

    if (remainingSeconds <= 0) {
      timerEl.textContent = "⚠️ Reserva Expirada";
      timerEl.className = "timer bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 p-2.5 rounded-xl text-xs font-black text-center border border-rose-300 dark:border-rose-800 animate-pulse";
      return;
    }

    const min = Math.floor(remainingSeconds / 60);
    const sec = remainingSeconds % 60;
    const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    timerEl.textContent = `⏱️ Tiempo de Reserva: ${formatted}`;
    if (remainingSeconds < 60) {
      timerEl.className = "timer bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 p-2.5 rounded-xl text-xs font-black text-center border border-rose-300 dark:border-rose-800 animate-pulse";
    } else {
      timerEl.className = "timer bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 p-2.5 rounded-xl text-xs font-black text-center border border-amber-300 dark:border-amber-800";
    }
  }

  // --- COMPROBANTE OFICIAL DE RESERVA (MODAL & PDF) ---
  renderReceiptModal(venta) {
    const modal = document.getElementById('ticket-modal');
    if (!modal) return;

    document.getElementById('lbl-id-pedido').textContent = venta.idPedido;
    document.getElementById('lbl-nombre-cliente').textContent = venta.cliente;
    document.getElementById('lbl-fecha-hora').textContent = venta.fechaHora;
    document.getElementById('lbl-codigo-compra').textContent = venta.codigoCompra;
    document.getElementById('lbl-puestos-detalles').textContent = venta.puestos.join(', ');
    document.getElementById('lbl-valor-pagar').textContent = `$${venta.total.toLocaleString('es-CO')} COP`;
    
    // Puerta y Zona Asignada
    const puertaEl = document.getElementById('lbl-puerta-asignada');
    if (puertaEl) {
      puertaEl.textContent = venta.puertaSugerida || 'Puerta 1 - Acceso VIP & Diamond';
    }
    const zonaEl = document.getElementById('lbl-zona-nombre');
    if (zonaEl) {
      zonaEl.textContent = venta.zonaNombre || 'Zona Oficial';
    }

    const qrContainer = document.getElementById('qr-canvas-wrapper');
    if (qrContainer) {
      qrContainer.innerHTML = '';
      const qrPayload = venta.codigoCompra || venta.idPedido || 'OPN-TICKET';

      try {
        if (typeof QRCode === 'function') {
          new QRCode(qrContainer, {
            text: qrPayload,
            width: 170,
            height: 170,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: (QRCode.CorrectLevel && QRCode.CorrectLevel.H) ? QRCode.CorrectLevel.H : 2
          });
        } else {
          const img = document.createElement('img');
          img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;
          img.className = 'w-44 h-44 mx-auto object-contain block rounded-lg shadow-sm';
          img.alt = `Código QR ${qrPayload}`;
          qrContainer.appendChild(img);
        }
      } catch (e) {
        console.warn('Error inicializando QRCode.js, usando respaldo de imagen:', e);
        const img = document.createElement('img');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;
        img.className = 'w-44 h-44 mx-auto object-contain block rounded-lg shadow-sm';
        img.alt = `Código QR ${qrPayload}`;
        qrContainer.appendChild(img);
      }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  // --- MIS BOLETAS COMPRADAS ---
  renderMyTickets(tickets) {
    const container = document.getElementById('my-tickets-container');
    if (!container) return;

    if (!tickets || tickets.length === 0) {
      container.innerHTML = `
        <div class="p-12 text-center bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-2xl">
            <i class="fa-solid fa-ticket-simple"></i>
          </div>
          <h3 class="text-base font-bold text-slate-800 dark:text-slate-100">No tienes boletos registrados aún</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">Selecciona tus mesas y puestos en el mapa principal para adquirir tus entradas en tiempo real.</p>
          <button onclick="appController.handleNavigate('client')" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all">
            Ir al Mapa de Boletos
          </button>
        </div>
      `;
      return;
    }

    let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
    tickets.forEach(t => {
      const isUsed = t.usado;
      html += `
        <div class="bg-white dark:bg-slate-800 rounded-3xl border ${isUsed ? 'border-slate-200 dark:border-slate-700 opacity-80' : 'border-indigo-100 dark:border-indigo-900 shadow-lg shadow-indigo-100/50 dark:shadow-none'} overflow-hidden p-6 space-y-4">
          <div class="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isUsed ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}">
                  ${isUsed ? '● ENTRADA UTILIZADA' : '● ENTRADA VÁLIDA'}
                </span>
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  🚪 ${t.puertaSugerida || 'Puerta Asignada'}
                </span>
              </div>
              <h4 class="text-sm font-black text-slate-900 dark:text-slate-100 mt-1.5">Gran Gala & Concierto Exclusivo</h4>
              <div class="text-[11px] text-slate-500 dark:text-slate-400"><i class="fa-regular fa-clock"></i> ${t.fechaHora}</div>
            </div>
            <div class="font-mono font-black text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-xl border border-indigo-100 dark:border-indigo-900">
              ${t.codigoCompra}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-700/40 p-3 rounded-2xl">
            <div>
              <span class="text-[10px] font-bold text-slate-400 block">Puestos Asignados:</span>
              <span class="font-extrabold text-slate-800 dark:text-slate-200">${t.puestos.join(', ')}</span>
            </div>
            <div>
              <span class="text-[10px] font-bold text-slate-400 block">Total Pagado:</span>
              <span class="font-mono font-black text-emerald-600 dark:text-emerald-400">$${t.total.toLocaleString('es-CO')} COP</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2">
            <button onclick='appController.handleOpenReceiptModal(${JSON.stringify(t)})' class="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5">
              <i class="fa-solid fa-qrcode"></i> Ver Código QR / PDF
            </button>
            <span class="text-[10px] text-slate-400 font-medium">Pedido: ${t.idPedido}</span>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // --- PANEL DE CONTROL ADMINISTRADOR ---
  renderAdminPanel(adminData) {
    const sales = adminData.sales || [];
    const staffList = adminData.staffList || [];
    const totalCapacity = adminData.totalCapacity || 600;

    let totalSillas = 0;
    let totalIngresado = 0;
    let pendientesCount = 0;
    let ingresadasCount = 0;

    sales.forEach(s => {
      totalSillas += (s.numEntradas || s.puestos.length);
      totalIngresado += (s.total || 0);
      if (s.usado) ingresadasCount += (s.numEntradas || s.puestos.length);
      else pendientesCount += (s.numEntradas || s.puestos.length);
    });

    const statSillas = document.getElementById('stat-sillas-vendidas');
    const statPorcentaje = document.getElementById('stat-porcentaje');
    const statTotal = document.getElementById('stat-total-ingresado');
    const statPendientes = document.getElementById('stat-pendientes');
    const statIngresadas = document.getElementById('stat-ingresadas');

    if (statSillas) statSillas.textContent = `${totalSillas} / ${totalCapacity}`;
    if (statPorcentaje) statPorcentaje.textContent = `${((totalSillas / totalCapacity) * 100).toFixed(1)}%`;
    if (statTotal) statTotal.textContent = `$${totalIngresado.toLocaleString('es-CO')} COP`;
    if (statPendientes) statPendientes.textContent = pendientesCount;
    if (statIngresadas) statIngresadas.textContent = ingresadasCount;

    // Tabla de Ventas en Vivo
    const tbody = document.getElementById('admin-sales-table');
    if (tbody) {
      if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">No hay compras registradas todavía.</td></tr>`;
      } else {
        let html = '';
        sales.forEach(s => {
          html += `
            <tr class="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors text-xs">
              <td class="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">${s.codigoCompra}</td>
              <td class="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">${s.cliente}</td>
              <td class="py-3 px-4 font-bold text-center">${s.numEntradas || s.puestos.length}</td>
              <td class="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">${s.puestos.join(', ')}</td>
              <td class="py-3 px-4 text-[11px] text-slate-500 font-bold">${s.puertaSugerida || 'Puerta 1'}</td>
              <td class="py-3 px-4 text-[11px] text-slate-500">${s.fechaHora}</td>
              <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${s.usado ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}">
                  ${s.usado ? 'Ingresado' : 'Pendiente'}
                </span>
              </td>
              <td class="py-3 px-4 text-right">
                <button onclick="appController.handleDeleteTicket('${s.codigoCompra}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-300 rounded-lg text-[11px] font-bold transition-all" title="Liberar sillas en el mapa">
                  <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    }

    // Tabla de Staff
    const staffTbody = document.getElementById('admin-staff-table');
    if (staffTbody) {
      if (staffList.length === 0) {
        staffTbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-slate-400">No hay usuarios Staff creados.</td></tr>`;
      } else {
        let staffHtml = '';
        staffList.forEach(stf => {
          staffHtml += `
            <tr class="border-b border-slate-100 dark:border-slate-700/60 text-xs">
              <td class="py-3 px-4 flex items-center gap-2.5">
                <img src="${stf.avatar || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120'}" class="w-7 h-7 rounded-full object-cover border border-slate-200">
                <span class="font-bold text-slate-800 dark:text-slate-100">${stf.nombre} ${stf.apellido || ''}</span>
              </td>
              <td class="py-3 px-4 font-mono text-slate-500">${stf.username}</td>
              <td class="py-3 px-4">
                <span class="font-bold text-slate-700 dark:text-slate-200">${stf.door || 'Puerta Asignada'}</span>
                <span class="text-[10px] text-indigo-500 dark:text-indigo-400 block font-semibold">Zonas: ${(stf.allowedZones || ['ALL']).join(', ')}</span>
              </td>
              <td class="py-3 px-4 text-right">
                <button onclick="appController.handleDeleteStaff('${stf.id}')" class="text-rose-500 hover:text-rose-700 p-1" title="Eliminar validador">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </td>
            </tr>
          `;
        });
        staffTbody.innerHTML = staffHtml;
      }
    }
  }

  // --- RESULTADOS DEL ESCÁNER QR (VALID, USED, WRONG_DOOR, INVALID) ---
  renderScanResult(result) {
    const resDiv = document.getElementById('scan-result-card');
    if (!resDiv) return;

    resDiv.classList.remove('hidden');
    const status = result.status || 'INVALID';

    const colors = {
      VALID: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100",
      USED: "bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100",
      WRONG_DOOR: "bg-rose-50 dark:bg-rose-950/60 border-rose-400 dark:border-rose-800 text-rose-950 dark:text-rose-100",
      INVALID: "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100"
    };

    const icons = {
      VALID: "fa-circle-check text-emerald-500",
      USED: "fa-triangle-exclamation text-amber-500",
      WRONG_DOOR: "fa-door-closed text-rose-600",
      INVALID: "fa-circle-xmark text-rose-500"
    };

    let guidanceHtml = '';
    if (status === 'WRONG_DOOR') {
      guidanceHtml = `
        <div class="mt-3 p-3.5 bg-white dark:bg-slate-900 rounded-2xl border-2 border-rose-300 dark:border-rose-700 shadow-sm space-y-1">
          <div class="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-black text-xs uppercase tracking-wider">
            <i class="fa-solid fa-location-arrow animate-bounce"></i> Dirección de Ingreso Correcta:
          </div>
          <div class="text-sm font-extrabold text-slate-900 dark:text-white">
            👉 ${result.correctDoor || 'Puerta Asignada al Boleto'}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">
            Zona del Boleto: <strong>${result.zonaNombre || 'Zona Oficial'}</strong>
          </div>
        </div>
      `;
    }

    resDiv.className = `p-4 rounded-3xl border-2 ${colors[status] || colors.INVALID} space-y-2 transition-all duration-300 shadow-lg`;
    resDiv.innerHTML = `
      <div class="flex items-start gap-3">
        <i class="fa-solid ${icons[status] || icons.INVALID} text-2xl shrink-0 mt-0.5"></i>
        <div class="flex-1">
          <h4 class="font-black text-sm">${result.message}</h4>
          <p class="text-xs opacity-90 mt-1 whitespace-pre-line leading-relaxed">${result.detail || ''}</p>
          ${guidanceHtml}
        </div>
      </div>
    `;
  }
}
