import { QueryErrorResetBoundary, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { isRouteErrorResponse, useRouteError } from 'react-router'

function getErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}

/**
 * RR7-native query error boundary.
 * No react-error-boundary dependency required.
 */
export function RouteQueryErrorBoundary({ queryKey }: { queryKey?: QueryKey }) {
  const routeError = useRouteError()
  const queryClient = useQueryClient()

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/70">{getErrorMessage(routeError)}</p>
          <button
            type="button"
            className="mt-4 rounded-md border px-3 py-2"
            onClick={() => {
              reset()
              queryClient.resetQueries(queryKey ? { queryKey } : undefined)
            }}
          >
            Try again
          </button>
        </section>
      )}
    </QueryErrorResetBoundary>
  )
}

/**
 * Route usage example:
 *
 * export function ErrorBoundary() {
 *   return <RouteQueryErrorBoundary queryKey={['organizations']} />
 * }
 */
