/**
 * Service Worker registration for improved caching and performance
 */

import { devLog } from './logger';

// Register service worker for production builds
export function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', async () => {
      try {
        devLog.log('Registering service worker...');
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        
        devLog.log('Service Worker registered successfully:', registration);
        
        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                devLog.log('New service worker available. Consider refreshing the page.');
                
                // Optionally show a notification to the user
                if (window.confirm('New version available. Refresh to update?')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
              }
            });
          }
        });
        
        // Handle service worker controller changes
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          devLog.log('Service worker controller changed');
          window.location.reload();
        });
        
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    });
  }
}

// Unregister service worker (useful for development)
export async function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        devLog.log('Service Worker unregistered:', registration);
      }
    } catch (error) {
      console.error('Service Worker unregistration failed:', error);
    }
  }
}

// Check if service worker is supported
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

// Get service worker registration status
export async function getServiceWorkerStatus() {
  if (!isServiceWorkerSupported()) {
    return { supported: false, registered: false, active: false };
  }
  
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      supported: true,
      registered: !!registration,
      active: !!registration?.active,
      scope: registration?.scope
    };
  } catch (error) {
    console.error('Error checking service worker status:', error);
    return { supported: true, registered: false, active: false, error };
  }
}
