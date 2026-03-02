import { useEffect } from "react";

/**
 * Hook to preload critical images for better FCP (First Contentful Paint)
 * @param imageUrl - The URL of the image to preload
 * @param priority - Whether this is a high priority image
 */
export function useImagePreload(imageUrl: string, priority: boolean = true) {
  useEffect(() => {
    if (!imageUrl) return;

    // Create preload link element
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = imageUrl;

    if (priority) {
      link.setAttribute("fetchpriority", "high");
    }

    // Add to document head
    document.head.appendChild(link);

    // Cleanup function to remove the preload link
    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link);
      }
    };
  }, [imageUrl, priority]);
}

/**
 * Optimizes Builder.io CDN image URLs for better performance
 * @param originalUrl - Original Builder.io image URL
 * @param options - Optimization options
 */
export function optimizeBuilderImage(
  originalUrl: string,
  options: {
    width?: number;
    quality?: number;
    format?: "webp" | "avif" | "auto";
  } = {},
): string {
  const { width = 1200, quality = 80, format = "webp" } = options;

  // Parse the existing URL to maintain the asset ID
  const url = new URL(originalUrl);

  // Update optimization parameters
  url.searchParams.set("format", format);
  url.searchParams.set("width", width.toString());
  url.searchParams.set("quality", quality.toString());

  return url.toString();
}
