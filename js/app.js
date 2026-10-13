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

  // Limpieza de Service Workers y Caches antiguos para garantizar recarga de cambios en tiempo real
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }
});
