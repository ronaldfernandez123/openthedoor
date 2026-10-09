/* ==========================================================================
   TicketEntry - APP BOOTSTRAP (Punto de Entrada & Inicialización MVC)
   ========================================================================== */

let appModel = null;
let appView = null;
let appController = null;

// Inicialización cuando el DOM esté completamente cargado
window.addEventListener('DOMContentLoaded', () => {
  appModel = new TicketModel();
  appView = new TicketView();
  appController = new TicketController(appModel, appView);
  
  // Exponer a window para compatibilidad con manejadores inline en el DOM y Google Sign-In
  window.appModel = appModel;
  window.appView = appView;
  window.appController = appController;
  window.handleGoogleCredentialResponse = (res) => appController.handleGoogleCredentialResponse(res);

  // Iniciar ciclo de vida del controlador
  appController.init();

  // Registro del Service Worker para PWA & soporte offline
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registrado exitosamente con alcance:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Error al registrar Service Worker:', err);
        });
    });
  }
});
