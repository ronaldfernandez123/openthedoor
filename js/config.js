/* ==========================================================================
   Cena San Silvestre 2026 | Hotel Cartagena Plaza - CONFIG
   Configuración Central del Evento, Etapas de Venta, Precios y Zonas
   ========================================================================== */

const STORAGE_KEY = 'cartagenaplaza_2026_data';

// ⚠️ URL del Backend en Railway
const RAILWAY_BACKEND_URL = "https://openthedoor-production.up.railway.app";

// Detección de entorno local vs producción
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const SOCKET_SERVER_URL = isLocal ? 'http://localhost:8080' : RAILWAY_BACKEND_URL;

// Inicialización global de Socket.IO
let socket = null;
try {
  if (typeof io !== 'undefined') {
    socket = io(SOCKET_SERVER_URL, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('✅ Conectado exitosamente al Servidor en tiempo real:', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.warn('⚠️ Conexión en tiempo real limitada:', error.message);
    });
  }
} catch (e) {
  console.warn('Socket.IO no disponible en este contexto:', e);
}

// Configuración de Etapas de Preventa y Precios Oficiales (Imagen 1)
const PRICING_STAGES = {
  PREVENTA: {
    id: "PREVENTA",
    name: "Preventa",
    tagline: "Hasta el 15 de oct",
    endDate: "2026-10-15T23:59:59",
    active: true
  },
  ETAPA_2: {
    id: "ETAPA_2",
    name: "Etapa 2",
    tagline: "16 de oct al 30 de nov",
    endDate: "2026-11-30T23:59:59",
    active: false
  },
  FULL: {
    id: "FULL",
    name: "Precio Full",
    tagline: "A partir del 1 de dic",
    endDate: "2026-12-31T23:59:59",
    active: false
  }
};

/**
 * Determina la etapa de venta de forma 100% automática según la fecha actual del calendario.
 * - Hasta el 15 de octubre de 2026: PREVENTA
 * - Del 16 de octubre al 30 de noviembre de 2026: ETAPA 2
 * - A partir del 1 de diciembre de 2026: PRECIO FULL
 */
function getAutoPricingStage(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const cutoffPreventa = new Date(2026, 9, 15, 23, 59, 59, 999); // 15 de Octubre 2026 23:59:59
  const cutoffEtapa2 = new Date(2026, 10, 30, 23, 59, 59, 999);  // 30 de Noviembre 2026 23:59:59

  if (d <= cutoffPreventa) {
    return 'PREVENTA';
  } else if (d <= cutoffEtapa2) {
    return 'ETAPA_2';
  } else {
    return 'FULL';
  }
}

/**
 * Resuelve la etapa actual considerando si el Administrador fijó una etapa manual o está en modo automático.
 */
function resolveCurrentPricingStage() {
  try {
    const savedMode = localStorage.getItem('cartagena_stage_mode') || 'AUTO';
    if (savedMode !== 'AUTO' && PRICING_STAGES[savedMode]) {
      return { stage: savedMode, isAuto: false, stageInfo: PRICING_STAGES[savedMode] };
    }
  } catch (e) {}

  const autoStage = getAutoPricingStage();
  return { stage: autoStage, isAuto: true, stageInfo: PRICING_STAGES[autoStage] };
}

// Matriz oficial de precios según imágenes proporcionadas
const PRICING_MATRIX = {
  SAHARA: {
    ADULTO: {
      PREVENTA: 1050000,
      ETAPA_2: 1100000,
      FULL: 1200000
    },
    NINO: {
      PREVENTA: 420000,
      ETAPA_2: 490000,
      FULL: 550000
    }
  },
  OASIS: {
    ADULTO: {
      PREVENTA: 950000,
      ETAPA_2: 1000000,
      FULL: 1100000
    },
    NINO: {
      PREVENTA: 420000,
      ETAPA_2: 490000,
      FULL: 550000
    }
  },
  NOMAD: {
    ADULTO: {
      PREVENTA: 850000,
      ETAPA_2: 900000,
      FULL: 1000000
    },
    NINO: {
      PREVENTA: 420000,
      ETAPA_2: 490000,
      FULL: 550000
    }
  }
};

const EVENT_CONFIG = {
  id: "EVT-CARTAGENAPLAZA-2026",
  title: "Cena San Silvestre 2026",
  hotel: "Hotel Cartagena Plaza",
  hotelFull: "Hotel Cartagena Plaza (EM HOTELS)",
  subtitle: "Despide el año con una noche mágica frente al mar en Cartagena de Indias",
  date: "2026-12-31T20:00",
  dateFormatted: "Jueves, 31 de Diciembre de 2026",
  venue: "Playa del Hotel Cartagena Plaza",
  address: "Cartagena de Indias D.T. y C. - RNT 5286",
  image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&auto=format&fit=crop&q=80",
  category: "Cena San Silvestre & Fiesta de Fin de Año",
  totalCapacity: 600,
  minAge: "Adulto: 12+ años | Niño: 4 a 11 años | Menores de 4 años ingresan gratis (sin asiento)",
  doorsOpen: "19:00 hs",
  parking: "Parqueadero privado con servicio del Hotel Cartagena Plaza",
  announcement: "Apertura de puertas a las 19:00 hs. Presentar comprobante digital con código QR para validación por cámara en puerta asignada.",
  currentStage: "PREVENTA", // 'PREVENTA' | 'ETAPA_2' | 'FULL'
  
  // Lo que incluye (9 puntos oficiales de la imagen)
  inclusions: [
    { title: "Cena Buffet", desc: "Gastronomía Internacional Premium", icon: "fa-utensils" },
    { title: "Coctel de Bienvenida", desc: "Bebida de cortesía exclusiva", icon: "fa-wine-glass" },
    { title: "Concierto en Vivo", desc: "Agrupación y show musical en tarima", icon: "fa-music" },
    { title: "DJ en Vivo", desc: "Animación y fiesta hasta el amanecer", icon: "fa-compact-disc" },
    { title: "Cotillones", desc: "Artículos festivos para año nuevo", icon: "fa-party-horn" },
    { title: "Uvas de la Prosperidad", desc: "Tradicionales 12 uvas a la medianoche", icon: "fa-grapes" },
    { title: "Fuegos Pirotécnicos", desc: "Espectáculo de luces sobre el mar", icon: "fa-burst" },
    { title: "Caldo de Amanecida", desc: "Tradicional reconstituyente", icon: "fa-mug-hot" },
    { title: "Set Fotográfico", desc: "Espacios temáticos para tus recuerdos", icon: "fa-camera" }
  ],

  // Organización espacial de zonas según el plano de las imágenes:
  // Escenario -> Sahara (Primera Línea) -> Oasis (Central) -> Nomad (Posterior) -> Zona Lounge
  zones: {
    SAHARA: {
      key: "SAHARA",
      name: "Zona Sahara",
      price: 1050000,
      childPrice: 420000,
      tagline: "Primera Línea frente al Escenario",
      start: 'A',
      end: 'B',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalTables: 10,
      totalSeats: 100,
      badgeColor: "bg-amber-500 text-slate-950 font-black",
      borderColor: "border-amber-400",
      accentColor: "#D4AF37",
      door: "Puerta 1 - Acceso VIP Sahara",
      description: "Mesas frontales A1 a B5 en primera fila justo frente al escenario principal."
    },
    OASIS: {
      key: "OASIS",
      name: "Zona Oasis",
      price: 950000,
      childPrice: 420000,
      tagline: "Área Central Preferencial",
      start: 'C',
      end: 'H',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalTables: 30,
      totalSeats: 300,
      badgeColor: "bg-red-800 text-white font-black",
      borderColor: "border-red-700",
      accentColor: "#842515",
      door: "Puerta 2 - Acceso Preferencial Oasis",
      description: "Mesas centrales C1 a H5 con excelente acústica, confort y vista preferencial."
    },
    NOMAD: {
      key: "NOMAD",
      name: "Zona Nomad",
      price: 850000,
      childPrice: 420000,
      tagline: "Área General Festiva",
      start: 'I',
      end: 'L',
      tablesPerLetter: 5,
      seatsPerTable: 10,
      totalTables: 20,
      totalSeats: 200,
      badgeColor: "bg-amber-900 text-white font-black",
      borderColor: "border-amber-800",
      accentColor: "#8B7355",
      door: "Puerta 3 - Acceso General Nomad",
      description: "Mesas posteriores I1 a L5 con acceso rápido a zona lounge y playa."
    }
  }
};

const BANK_CONFIG = {
  titular: "Hotel Cartagena Plaza S.A.S. - EM HOTELS",
  nit: "RNT 5286",
  bancolombiaTitular: "Hotel Cartagena Plaza S.A.S.",
  bancolombiaAccount: "530-691390-10",
  bancolombiaType: "Cuenta de Ahorros",
  nequiTitular: "Hotel Cartagena Plaza S.A.S.",
  nequiPhone: "322 722 8707",
  contactPhones: ["+57 322 7228707", "+57 310 7746755", "+57 313 5103746"],
  contactEmail: "CARTAGENAPLAZA@HOTELCARTAGENAPLAZA.CO",
  instructions: "Realiza tu pago por el monto exacto del plan seleccionado y adjunta la referencia de la transferencia en el checkout."
};
