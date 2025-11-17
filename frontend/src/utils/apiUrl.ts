/**
 * Utility functions for constructing API URLs
 * Supports api.<hostname> subdomain for domain names
 * Falls back to same-origin /api path for IP addresses
 */

/**
 * Get the base API URL
 * For domain names: uses api.<hostname> subdomain
 * For IP addresses: uses same origin (api subdomain won't resolve via DNS)
 */
export function getApiBaseUrl(): string {
  const hostname = window.location.hostname
  const port = window.location.port || '3003'
  const protocol = window.location.protocol || 'https:'
  const isProduction = import.meta.env.PROD
  
  // In development, use same origin (Vite proxy handles /api)
  if (!isProduction) {
    return window.location.origin
  }
  
  // For IP addresses, use same origin (api subdomain won't resolve)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return `${protocol}//${hostname}:${port}`
  }
  
  // For domain names, use api subdomain
  return `${protocol}//api.${hostname}${port ? ':' + port : ''}`
}

/**
 * Get a full API endpoint URL
 * @param endpoint - API endpoint path (e.g., '/api/health' or '/health')
 */
export function getApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl()
  const hostname = window.location.hostname
  
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  
  // For IP addresses, ensure /api prefix is present
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    // Same origin - endpoint should include /api
    return `${baseUrl}${cleanEndpoint}`
  }
  
  // For api subdomain, endpoint should NOT include /api (backend handles it)
  // But Mastra client expects /api, so we'll keep it
  return `${baseUrl}${cleanEndpoint}`
}




