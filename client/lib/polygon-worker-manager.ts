import { devLog } from "./logger";

interface WorkerMessage {
  id: string;
  type: string;
  payload: any;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class PolygonWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private isInitialized = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      // Create worker from the polygon worker file
      this.worker = new Worker(
        new URL("../workers/polygon-worker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { id, type, payload } = event.data;
        const pendingRequest = this.pendingRequests.get(id);

        if (pendingRequest) {
          clearTimeout(pendingRequest.timeout);
          this.pendingRequests.delete(id);

          if (type === "error" || !payload.success) {
            pendingRequest.reject(
              new Error(payload.error || "Worker operation failed"),
            );
          } else {
            pendingRequest.resolve(payload.result);
          }
        }
      };

      this.worker.onerror = (error) => {
        devLog.error("Polygon worker error:", error);
        this.handleWorkerError(error);
      };

      this.isInitialized = true;
      devLog.log("✅ Polygon worker initialized successfully");
    } catch (error) {
      devLog.error("Failed to initialize polygon worker:", error);
      this.isInitialized = false;
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(`Worker error: ${error.message}`));
    });
    this.pendingRequests.clear();

    // Try to reinitialize worker
    this.cleanup();
    setTimeout(() => this.initWorker(), 1000);
  }

  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  private sendMessage<T>(
    type: string,
    payload: any,
    timeoutMs: number = 30000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.isInitialized) {
        reject(new Error("Polygon worker not initialized"));
        return;
      }

      const id = this.generateRequestId();

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Worker operation timed out"));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.worker.postMessage({ id, type, payload });
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Split polygon using worker (non-blocking)
   */
  async splitPolygon(
    polygon: GeoJSON.Feature<GeoJSON.Polygon>,
    splitLines: GeoJSON.Feature<GeoJSON.LineString>[],
  ): Promise<GeoJSON.Feature<GeoJSON.Polygon>[]> {
    try {
      devLog.log("🔄 Sending polygon splitting to worker...");
      const startTime = performance.now();

      const result = await this.sendMessage<GeoJSON.Feature<GeoJSON.Polygon>[]>(
        "split-polygon",
        { polygon, splitLines },
        60000, // 60 second timeout for complex operations
      );

      const duration = performance.now() - startTime;
      devLog.log(
        `✅ Worker polygon splitting completed in ${Math.round(duration)}ms`,
      );

      return result;
    } catch (error) {
      devLog.error("Worker polygon splitting failed:", error);
      // Fallback to main thread if worker fails
      throw error;
    }
  }

  /**
   * Simplify geometry using worker
   */
  async simplifyGeometry<T extends GeoJSON.Geometry>(
    geometry: T,
    tolerance: number = 0.001,
    highQuality: boolean = false,
  ): Promise<T> {
    try {
      const result = await this.sendMessage<T>(
        "simplify-geometry",
        { geometry, tolerance, highQuality },
        10000, // 10 second timeout
      );

      return result;
    } catch (error) {
      devLog.error("Worker geometry simplification failed:", error);
      throw error;
    }
  }

  /**
   * Check if worker is available and working
   */
  isWorkerAvailable(): boolean {
    return this.isInitialized && this.worker !== null;
  }

  /**
   * Get number of pending requests
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("Request cancelled"));
    });
    this.pendingRequests.clear();
  }

  /**
   * Cleanup worker resources
   */
  cleanup(): void {
    this.cancelAllRequests();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.isInitialized = false;
    devLog.log("🧹 Polygon worker cleaned up");
  }
}

// Create singleton instance
const polygonWorkerManager = new PolygonWorkerManager();

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    polygonWorkerManager.cleanup();
  });
}

export { polygonWorkerManager };
export type { PolygonWorkerManager };
