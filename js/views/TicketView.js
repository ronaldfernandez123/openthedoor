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
      const adultPrice = (zoneConfig && typeof zoneConfig.price === 'number') ? zoneConfig.price : 1050000;
      let titleTooltip = `Puesto: ${seatId} | ${(zoneConfig && zoneConfig.name) || 'Zona'} | ${(zoneConfig && zoneConfig.door) || 'Puerta'} | $${adultPrice.toLocaleString('es-CO')} COP`;

      if (state) {
        if (state.status === 'sold') {
          statusClass = 'sold';
          titleTooltip = `Puesto: ${seatId} (VENDIDO)`;
        } else if (state.status === 'locked') {
          if ((socketId && state.userId === socketId) || state.userId === 'local-session') {
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

  renderSelectionSidebar(mySelectedSeats, getSeatPriceFn, lockExpiresAt, getSeatTypeFn) {
    const listContainer = document.getElementById('selected-list');
    const totalEl = document.getElementById('total-price');
    const timerEl = document.getElementById('timer-display');
    const btnCheckout = document.getElementById('btn-checkout');
    const countBadge = document.getElementById('selected-count-badge');
    const mobileCartBar = document.getElementById('mobile-cart-bar');
    const mobileCartCount = document.getElementById('mobile-cart-count');
    const mobileCartTotal = document.getElementById('mobile-cart-total');

    if (!listContainer || !totalEl || !btnCheckout) return;

    if (countBadge) countBadge.textContent = mySelectedSeats.length;

    if (mySelectedSeats.length === 0) {
      if (mobileCartBar) mobileCartBar.classList.add('hidden');
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
    let html = '<div class="space-y-2 max-h-56 overflow-y-auto pr-1">';

    mySelectedSeats.forEach(seatId => {
      const type = getSeatTypeFn ? getSeatTypeFn(seatId) : 'ADULTO';
      const price = getSeatPriceFn(seatId, type);
      total += price;
      const letter = seatId.charAt(0).toUpperCase();
      let zoneName = "Zona Nomad";
      let doorName = "Puerta 3";
      let badgeClass = "bg-amber-900/10 text-amber-900 dark:text-amber-300 border border-amber-900/30";

      if (letter >= 'A' && letter <= 'B') {
        zoneName = "Sahara VIP";
        doorName = "Puerta 1 (VIP)";
        badgeClass = "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40";
      } else if (letter >= 'C' && letter <= 'H') {
        zoneName = "Oasis Preferencial";
        doorName = "Puerta 2 (Oasis)";
        badgeClass = "bg-red-800/15 text-red-800 dark:text-red-300 border border-red-800/40";
      }

      const isChild = type === 'NINO' || type === 'nino';
      const typeBadge = isChild
        ? `<button onclick="appController.handleOpenSeatTypeModal('${seatId}')" class="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800 hover:bg-sky-200 transition-colors cursor-pointer" title="Clic para cambiar tipo">🧒 Niño (4-11)</button>`
        : `<button onclick="appController.handleOpenSeatTypeModal('${seatId}')" class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-200 transition-colors cursor-pointer" title="Clic para cambiar tipo">👤 Adulto</button>`;

      html += `
        <div class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg ${letter <= 'B' ? 'bg-amber-500 text-slate-900' : letter <= 'H' ? 'bg-red-800 text-white' : 'bg-amber-900 text-white'} flex items-center justify-center font-black text-[11px] shrink-0">
              <i class="fa-solid fa-chair"></i>
            </span>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-extrabold text-slate-900 dark:text-slate-100">${seatId}</span>
                ${typeBadge}
              </div>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="text-[9px] font-bold px-1.5 py-0.2 rounded ${badgeClass}">${zoneName}</span>
                <span class="text-[9px] font-bold text-slate-400">🚪 ${doorName}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-amber-600 dark:text-amber-400">$${price.toLocaleString('es-CO')}</span>
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

    if (mobileCartBar) {
      mobileCartBar.classList.remove('hidden');
      if (mobileCartCount) {
        mobileCartCount.textContent = `${mySelectedSeats.length} ${mySelectedSeats.length === 1 ? 'puesto' : 'puestos'}`;
      }
      if (mobileCartTotal) {
        mobileCartTotal.textContent = `$${total.toLocaleString('es-CO')} COP`;
      }
    }
  }

  updateTimerDisplay(remainingSeconds, hasSeats = false) {
    const timerEl = document.getElementById('timer-display');
    if (!timerEl) return;

    if (!hasSeats || remainingSeconds === null || remainingSeconds === undefined) {
      timerEl.textContent = "⏱️ Tiempo de Reserva: 05:00";
      timerEl.className = "timer bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-2.5 rounded-xl text-xs font-bold text-center border border-slate-200 dark:border-slate-700";
      const mobileCartBar = document.getElementById('mobile-cart-bar');
      if (mobileCartBar) mobileCartBar.classList.add('hidden');
      return;
    }

    if (remainingSeconds <= 0) {
      timerEl.textContent = "⚠️ Reserva Expirada";
      timerEl.className = "timer bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 p-2.5 rounded-xl text-xs font-black text-center border border-rose-300 dark:border-rose-800 animate-pulse";
      const mobileCartBar = document.getElementById('mobile-cart-bar');
      if (mobileCartBar) mobileCartBar.classList.add('hidden');
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

  // --- MODAL DE SELECCIÓN ADULTO / NIÑO (PANTALLA EMERGENTE) ---
  openSeatTypeModal(data) {
    const modal = document.getElementById('seat-type-modal');
    if (!modal) return;

    const seatIdEl = document.getElementById('modal-seat-id');
    const zoneNameEl = document.getElementById('modal-seat-zone');
    const stageNameEl = document.getElementById('modal-seat-stage');
    const priceAdultEl = document.getElementById('modal-price-adult');
    const priceChildEl = document.getElementById('modal-price-child');
    const cardAdult = document.getElementById('modal-card-adult');
    const cardChild = document.getElementById('modal-card-child');

    if (seatIdEl) seatIdEl.textContent = data.seatId;
    if (zoneNameEl) {
      zoneNameEl.textContent = data.zoneName;
      zoneNameEl.className = `px-2.5 py-0.5 rounded-full text-xs font-black ${data.badgeClass || 'bg-amber-500 text-slate-900'}`;
    }
    if (stageNameEl) stageNameEl.textContent = `Etapa: ${data.stageName || 'Preventa'}`;
    if (priceAdultEl) priceAdultEl.textContent = `$${data.priceAdult.toLocaleString('es-CO')} COP`;
    if (priceChildEl) priceChildEl.textContent = `$${data.priceChild.toLocaleString('es-CO')} COP`;

    if (cardAdult) {
      cardAdult.onclick = () => {
        if (typeof data.onSelect === 'function') data.onSelect(data.seatId, 'ADULTO');
        this.closeSeatTypeModal();
      };
    }
    if (cardChild) {
      cardChild.onclick = () => {
        if (typeof data.onSelect === 'function') data.onSelect(data.seatId, 'NINO');
        this.closeSeatTypeModal();
      };
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  closeSeatTypeModal() {
    const modal = document.getElementById('seat-type-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  // --- COMPROBANTE OFICIAL DE RESERVA (MODAL & PDF) ---
  renderReceiptModal(venta) {
    const modal = document.getElementById('ticket-modal');
    if (!modal) return;

    document.getElementById('lbl-id-pedido').textContent = venta.idPedido;
    document.getElementById('lbl-nombre-cliente').textContent = venta.cliente;
    document.getElementById('lbl-fecha-hora').textContent = venta.fechaHora;
    document.getElementById('lbl-codigo-compra').textContent = venta.codigoCompra;
    const numPuestos = Array.isArray(venta.puestos) ? venta.puestos.length : (venta.numEntradas || 1);
    const badgeEl = document.getElementById('lbl-total-entradas-badge');
    if (badgeEl) {
      badgeEl.textContent = `${numPuestos} ${numPuestos === 1 ? 'Puesto' : 'Puestos (Pase Unificado)'}`;
    }

    const puestosTexto = (Array.isArray(venta.puestosDetalles) && venta.puestosDetalles.length > 0)
      ? venta.puestosDetalles.map(d => `${d.puesto} (${d.tipo === 'NINO' ? 'Niño' : 'Adulto'})`).join(', ')
      : (Array.isArray(venta.puestos) ? venta.puestos.join(', ') : '');

    document.getElementById('lbl-puestos-detalles').textContent = puestosTexto;
    document.getElementById('lbl-valor-pagar').textContent = `$${venta.total.toLocaleString('es-CO')} COP`;
    
    // Puerta y Zona Asignada
    const puertaEl = document.getElementById('lbl-puerta-asignada');
    if (puertaEl) {
      puertaEl.textContent = venta.puertaSugerida || 'Puerta 1 - Acceso VIP Sahara';
    }
    const zonaEl = document.getElementById('lbl-zona-nombre');
    if (zonaEl) {
      zonaEl.textContent = venta.zonaNombre || 'Zona Oficial';
    }

    const qrContainer = document.getElementById('qr-canvas-wrapper');
    if (qrContainer) {
      qrContainer.innerHTML = '';

      const drawQr = (payload) => {
        qrContainer.innerHTML = '';
        const token = String(payload || 'OPN-TICKET').trim();

        // 1. Intentar renderizar con QRCode.js en contenedor aislado para obtener dataURL limpio
        try {
          if (typeof QRCode === 'function') {
            const tempDiv = document.createElement('div');
            new QRCode(tempDiv, {
              text: token,
              width: 190,
              height: 190,
              colorDark: "#000000",
              colorLight: "#ffffff",
              correctLevel: (QRCode.CorrectLevel && QRCode.CorrectLevel.M !== undefined) ? QRCode.CorrectLevel.M : 0
            });

            const canvas = tempDiv.querySelector('canvas');
            if (canvas && typeof canvas.toDataURL === 'function') {
              try {
                const dataUrl = canvas.toDataURL("image/png");
                if (dataUrl && dataUrl.length > 100) {
                  const img = document.createElement('img');
                  img.src = dataUrl;
                  img.alt = `Código QR Oficial ${token}`;
                  img.className = 'w-[190px] h-[190px] mx-auto object-contain block rounded-lg shadow-sm';
                  img.style.width = '190px';
                  img.style.height = '190px';
                  img.style.aspectRatio = '1 / 1';
                  qrContainer.appendChild(img);
                  return;
                }
              } catch (e) {
                console.warn('Error en toDataURL:', e);
              }
            }
          }
        } catch (err) {
          console.warn('QRCode.js falló, usando respaldo directo:', err);
        }

        // 2. Respaldo directo de alta disponibilidad (Garantiza que NUNCA quede vacío)
        const backupImg = document.createElement('img');
        backupImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=1&data=${encodeURIComponent(token)}`;
        backupImg.alt = `Código QR Oficial ${token}`;
        backupImg.className = 'w-[190px] h-[190px] mx-auto object-contain block rounded-lg shadow-sm';
        backupImg.style.width = '190px';
        backupImg.style.height = '190px';
        backupImg.style.aspectRatio = '1 / 1';
        qrContainer.appendChild(backupImg);
      };

      // Dibujar de forma inmediata para que NUNCA aparezca en blanco
      const baseCode = venta.codigoCompra || venta.idPedido || 'OPN-TICKET';
      if (venta.qrToken && venta.qrToken.includes('.s.')) {
        drawQr(venta.qrToken);
      } else {
        drawQr(baseCode);
        if (typeof generateSignedQrToken === 'function') {
          generateSignedQrToken(baseCode).then(signedToken => {
            if (signedToken && signedToken !== baseCode) {
              venta.qrToken = signedToken;
              drawQr(signedToken);
            }
          }).catch(e => {
            console.warn('Error generando token firmado:', e);
          });
        }
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
          <div class="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto text-2xl">
            <i class="fa-solid fa-ticket-simple"></i>
          </div>
          <h3 class="text-base font-bold text-slate-800 dark:text-slate-100">No tienes boletos registrados aún</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">Selecciona tus mesas y puestos en el plano principal para adquirir tus entradas en tiempo real.</p>
          <button onclick="appController.handleNavigate('client')" class="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition-all">
            Ir al Plano de Boletos
          </button>
        </div>
      `;
      return;
    }

    let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
    tickets.forEach(t => {
      const isUsed = t.usado;
      html += `
        <div class="bg-white dark:bg-slate-800 rounded-3xl border ${isUsed ? 'border-slate-200 dark:border-slate-700 opacity-80' : 'border-amber-200 dark:border-amber-900 shadow-lg dark:shadow-none'} overflow-hidden p-6 space-y-4">
          <div class="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isUsed ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}">
                  ${isUsed ? '● ENTRADA UTILIZADA' : '● ENTRADA VÁLIDA'}
                </span>
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  🚪 ${t.puertaSugerida || 'Puerta Asignada'}
                </span>
              </div>
              <h4 class="text-sm font-black text-slate-900 dark:text-slate-100 mt-1.5">Cena San Silvestre 2026 - Hotel Cartagena Plaza</h4>
              <div class="text-[11px] text-slate-500 dark:text-slate-400"><i class="fa-regular fa-clock"></i> ${t.fechaHora}</div>
            </div>
            <div class="font-mono font-black text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-xl border border-amber-100 dark:border-amber-900">
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
  renderAdminPanel(adminData, currentStage = 'PREVENTA', isAutoStage = true) {
    const sales = adminData.sales || [];
    const staffList = adminData.staffList || [];
    const totalCapacity = adminData.totalCapacity || 600;

    let totalSillas = 0;
    let totalIngresado = 0;
    let pendientesCount = 0;
    let ingresadasCount = 0;
    let adultosCount = 0;
    let ninosCount = 0;

    sales.forEach(s => {
      const num = (s.numEntradas || (Array.isArray(s.puestos) ? s.puestos.length : 1));
      totalSillas += num;
      totalIngresado += (s.total || 0);
      if (s.usado) ingresadasCount += num;
      else pendientesCount += num;

      if (Array.isArray(s.puestosDetalles) && s.puestosDetalles.length > 0) {
        s.puestosDetalles.forEach(pd => {
          if (pd.tipo === 'NINO') ninosCount++;
          else adultosCount++;
        });
      } else {
        adultosCount += num;
      }
    });

    const statSillas = document.getElementById('stat-sillas-vendidas');
    const statPorcentaje = document.getElementById('stat-porcentaje');
    const statTotal = document.getElementById('stat-total-ingresado');
    const statPendientes = document.getElementById('stat-pendientes');
    const statIngresadas = document.getElementById('stat-ingresadas');
    const statAdultos = document.getElementById('stat-adultos-vendidos');
    const statNinos = document.getElementById('stat-ninos-vendidos');

    if (statSillas) statSillas.textContent = `${totalSillas} / ${totalCapacity}`;
    if (statPorcentaje) statPorcentaje.textContent = `${((totalSillas / totalCapacity) * 100).toFixed(1)}%`;
    if (statTotal) statTotal.textContent = `$${totalIngresado.toLocaleString('es-CO')} COP`;
    if (statPendientes) statPendientes.textContent = pendientesCount;
    if (statIngresadas) statIngresadas.textContent = ingresadasCount;
    if (statAdultos) statAdultos.textContent = adultosCount;
    if (statNinos) statNinos.textContent = ninosCount;

    // Actualizar indicador de etapa en panel admin
    const stagePill = document.getElementById('admin-current-stage-pill');
    const stageText = document.getElementById('admin-current-stage-text');
    const stageSelect = document.getElementById('admin-stage-select');
    const stageDesc = document.getElementById('admin-stage-status-desc');

    const stageNames = {
      PREVENTA: "Preventa (Hasta 15 Oct)",
      ETAPA_2: "Etapa 2 (16 Oct - 30 Nov)",
      FULL: "Precio Full (Desde 1 Dic)"
    };

    if (stageText) {
      stageText.textContent = `${stageNames[currentStage] || currentStage} ${isAutoStage ? '• Modo Automático' : '• Forzado Manual'}`;
    }
    if (stagePill) {
      if (currentStage === 'PREVENTA') {
        stagePill.className = "px-4 py-2 rounded-2xl text-xs font-black bg-amber-500 text-slate-950 shadow-sm flex items-center gap-2";
      } else if (currentStage === 'ETAPA_2') {
        stagePill.className = "px-4 py-2 rounded-2xl text-xs font-black bg-orange-500 text-white shadow-sm flex items-center gap-2";
      } else {
        stagePill.className = "px-4 py-2 rounded-2xl text-xs font-black bg-red-600 text-white shadow-sm flex items-center gap-2";
      }
    }
    if (stageSelect) {
      stageSelect.value = isAutoStage ? 'AUTO' : currentStage;
    }
    if (stageDesc) {
      stageDesc.textContent = isAutoStage 
        ? "✓ Los precios cambian automáticamente según el reloj y calendario del sistema." 
        : "⚠️ Modo manual activo: La etapa seleccionada está fija independientemente de la fecha.";
    }

    // Tabla de Ventas en Vivo
    const tbody = document.getElementById('admin-sales-table');
    if (tbody) {
      if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400">No hay compras registradas todavía.</td></tr>`;
      } else {
        let html = '';
        sales.forEach(s => {
          let tiposHtml = '';
          if (Array.isArray(s.puestosDetalles) && s.puestosDetalles.length > 0) {
            tiposHtml = s.puestosDetalles.map(pd => `
              <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${pd.tipo === 'NINO' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'}">
                ${pd.puesto}: ${pd.tipo === 'NINO' ? 'Niño' : 'Adulto'}
              </span>
            `).join(' ');
          } else {
            tiposHtml = '<span class="text-slate-400 text-[11px]">Adulto</span>';
          }

          const primaryZone = (s.zonas && s.zonas[0]) || 'NOMAD';
          const zoneBadgeClass = primaryZone === 'SAHARA' 
            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
            : (primaryZone === 'OASIS' ? 'bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30' : 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border border-yellow-500/30');

          const pList = Array.isArray(s.puestos) ? s.puestos : (Array.isArray(s.seatIds) ? s.seatIds : []);
          html += `
            <tr class="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors text-xs">
              <td class="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">${s.codigoCompra}</td>
              <td class="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                ${s.cliente}
                ${s.telefono ? `<span class="block text-[10px] text-slate-400">${s.telefono}</span>` : ''}
              </td>
              <td class="py-3 px-4 font-bold text-center">${s.numEntradas || pList.length}</td>
              <td class="py-3 px-4 space-x-1">${tiposHtml}</td>
              <td class="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                <span class="font-bold">${pList.join(', ')}</span>
                <span class="block text-[10px] px-1.5 py-0.5 rounded border ${zoneBadgeClass} font-sans font-bold w-fit mt-0.5">
                  ${s.zonaNombre || primaryZone} • ${s.puertaSugerida || 'Puerta Asignada'}
                </span>
              </td>
              <td class="py-3 px-4 font-mono font-black text-emerald-600 dark:text-emerald-400">$${(s.total || 0).toLocaleString('es-CO')}</td>
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
      VALID: "bg-emerald-50 dark:bg-emerald-950/80 border-emerald-400 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100",
      USED: "bg-amber-50 dark:bg-amber-950/80 border-amber-400 dark:border-amber-700 text-amber-950 dark:text-amber-100",
      WRONG_DOOR: "bg-rose-50 dark:bg-rose-950/80 border-rose-500 dark:border-rose-700 text-rose-950 dark:text-rose-100",
      INVALID: "bg-rose-50 dark:bg-rose-950/80 border-rose-400 dark:border-rose-700 text-rose-950 dark:text-rose-100"
    };

    const icons = {
      VALID: "fa-circle-check text-emerald-500 text-3xl",
      USED: "fa-triangle-exclamation text-amber-500 text-3xl",
      WRONG_DOOR: "fa-door-closed text-rose-600 text-3xl",
      INVALID: "fa-circle-xmark text-rose-500 text-3xl"
    };

    let securityBadgeHtml = '';
    if (result.isCryptographicallySigned) {
      securityBadgeHtml = `
        <div class="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 text-xs font-black shadow-xs">
          <i class="fa-solid fa-shield-halved text-emerald-600 dark:text-emerald-400"></i>
          <span>🛡️ Firma Criptográfica Verificada (HMAC-SHA256)</span>
        </div>
      `;
    }

    let guidanceHtml = '';
    if (status === 'WRONG_DOOR') {
      guidanceHtml = `
        <div class="mt-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border-2 border-rose-400 dark:border-rose-600 shadow-sm space-y-1">
          <div class="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-black text-xs uppercase tracking-wider">
            <i class="fa-solid fa-location-arrow animate-bounce"></i> Puerta Asignada Correcta:
          </div>
          <div class="text-sm font-extrabold text-slate-900 dark:text-white">
            👉 ${result.correctDoor || 'Puerta Asignada al Boleto'}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">
            Zona correspondiente: <strong>${result.zonaNombre || 'Zona Oficial'}</strong>
          </div>
        </div>
      `;
    }

    resDiv.className = `p-5 rounded-3xl border-2 ${colors[status] || colors.INVALID} space-y-3 transition-all duration-300 shadow-xl`;
    resDiv.innerHTML = `
      <div class="flex items-start gap-3.5">
        <i class="fa-solid ${icons[status] || icons.INVALID} shrink-0 mt-0.5"></i>
        <div class="flex-1 space-y-1">
          <h4 class="font-black text-base">${result.message || 'Resultado de la Validación'}</h4>
          ${securityBadgeHtml}
          <p class="text-xs opacity-90 whitespace-pre-line leading-relaxed font-medium">${result.detail || ''}</p>
          ${guidanceHtml}
        </div>
      </div>
      <div class="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold tracking-wider opacity-60">Control de Acceso • Cartagena Plaza</span>
        <button onclick="document.getElementById('scan-result-card').classList.add('hidden')" class="px-3 py-1 bg-white/80 dark:bg-slate-800/80 hover:bg-white text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 transition-all">
          Cerrar Notificación
        </button>
      </div>
    `;
    resDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
