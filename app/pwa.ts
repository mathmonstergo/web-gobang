export function registerServiceWorker(): void {
  if (import.meta.env.DEV) {
    clearDevelopmentServiceWorkers();
    return;
  }

  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("service_worker_registration_failed", { error });
    });
  });
}

function clearDevelopmentServiceWorkers(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch((error: unknown) => {
        console.error("service_worker_unregister_failed", { error });
      });
    }
  }).catch((error: unknown) => {
    console.error("service_worker_list_failed", { error });
  });

  if (!("caches" in window)) {
    return;
  }

  window.caches.keys().then((cacheNames) => {
    for (const cacheName of cacheNames) {
      if (cacheName.startsWith("web-gobang")) {
        window.caches.delete(cacheName).catch((error: unknown) => {
          console.error("service_worker_cache_delete_failed", { error });
        });
      }
    }
  }).catch((error: unknown) => {
    console.error("service_worker_cache_list_failed", { error });
  });
}
