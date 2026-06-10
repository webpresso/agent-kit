// ============================================================================
// Request Helpers
// ============================================================================
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
export function createAuthenticatedRequest(path, options = {}, baseUrl = 'https://api.test') {
    const { headers: optionHeaders, ...restOptions } = options;
    return new Request(`${baseUrl}${path}`, {
        ...restOptions,
        headers: {
            Cookie: 'session=mock-session-token',
            ...optionHeaders,
        },
    });
}
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
export function createUnauthenticatedRequest(path, options = {}, baseUrl = 'https://api.test') {
    return new Request(`${baseUrl}${path}`, {
        headers: {
            ...options.headers,
        },
        ...options,
    });
}
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
export function createCorsRequest(path, origin, options = {}, baseUrl = 'https://api.test') {
    return new Request(`${baseUrl}${path}`, {
        headers: {
            Origin: origin,
            ...options.headers,
        },
        ...options,
    });
}
//# sourceMappingURL=requests.js.map