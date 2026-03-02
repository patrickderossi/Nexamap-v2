// Google Maps API script loader - Fixed with proper API key configuration
let isLoaded = false;
let isLoading = false;
const callbacks: (() => void)[] = [];

export function loadGoogleMapsAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isLoaded) {
      resolve();
      return;
    }

    if (isLoading) {
      callbacks.push(resolve);
      return;
    }

    isLoading = true;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error("Google Maps API key not found"));
      return;
    }

    // Set up global callback
    (window as any).initGoogleMaps = () => {
      isLoaded = true;
      isLoading = false;
      resolve();
      callbacks.forEach((callback) => callback());
      callbacks.length = 0;
    };

    // Load the script
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      isLoading = false;
      reject(new Error("Failed to load Google Maps API"));
    };

    document.head.appendChild(script);
  });
}

export function isGoogleMapsLoaded(): boolean {
  return isLoaded && !!(window as any).google?.maps?.places;
}
