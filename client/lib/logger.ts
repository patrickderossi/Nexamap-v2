/**
 * Development-only logger utility
 * Logs messages only in development mode to reduce production noise
 */

const isDev = import.meta.env.DEV;

export const devLog = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  }
};
