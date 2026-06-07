/**
 * Creates an authenticated request with session cookie.
 *
 * @param path - Request path (e.g., '/graphql')
 * @param options - Additional request options (method, headers, body)
 * @param baseUrl - Base URL for the request (default: https://api.test)
 * @returns Request object with authentication headers
 *
 * @example
 * ```typescript
 * const request = createAuthenticatedRequest('/api/users', { method: 'POST', body: JSON.stringify(data) })
 * ```
 */
export declare function createAuthenticatedRequest(path: string, options?: RequestInit, baseUrl?: string): Request;
/**
 * Creates an unauthenticated request (no session cookie).
 *
 * @param path - Request path (e.g., '/health')
 * @param options - Additional request options
 * @param baseUrl - Base URL for the request (default: https://api.test)
 * @returns Request object without authentication
 *
 * @example
 * ```typescript
 * const request = createUnauthenticatedRequest('/health')
 * ```
 */
export declare function createUnauthenticatedRequest(path: string, options?: RequestInit, baseUrl?: string): Request;
/**
 * Creates a request with custom origin for CORS testing.
 *
 * @param path - Request path
 * @param origin - Origin header value
 * @param options - Additional request options
 * @param baseUrl - Base URL for the request (default: https://api.test)
 * @returns Request object with Origin header
 *
 * @example
 * ```typescript
 * const request = createCorsRequest('/api/data', 'https://example.com')
 * ```
 */
export declare function createCorsRequest(path: string, origin: string, options?: RequestInit, baseUrl?: string): Request;
//# sourceMappingURL=requests.d.ts.map