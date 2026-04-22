import {
  infiniteQueryOptions,
  usePrefetchInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'

import { sdk } from '#lib/graphql-client'
import { queryClient } from '#lib/query-client'

type FeedPage = {
  activityFeed: {
    nodes: Array<{ id: string; summary: string }>
    pageInfo: {
      endCursor: string | null
      hasNextPage: boolean
    }
  }
}

const activityFeedKey = (projectId: string) => ['projects', projectId, 'activity-feed'] as const

export const activityFeedOptions = (projectId: string) =>
  infiniteQueryOptions({
    queryKey: activityFeedKey(projectId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      sdk.ProjectActivityFeed({ projectId, after: pageParam, first: 20 }) as Promise<FeedPage>,
    getNextPageParam: (lastPage) =>
      lastPage.activityFeed.pageInfo.hasNextPage ? lastPage.activityFeed.pageInfo.endCursor : null,
  })

export async function clientLoader({ params }: { params: { projectId: string } }) {
  await queryClient.ensureQueryData(activityFeedOptions(params.projectId))
  return null
}

export function ActivityFeedRoute({ projectId }: { projectId: string }) {
  usePrefetchInfiniteQuery(activityFeedOptions(projectId))

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
    activityFeedOptions(projectId),
  )

  const rows = data.pages.flatMap((page) => page.activityFeed.nodes)

  return (
    <div>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{row.summary}</li>
        ))}
      </ul>

      {hasNextPage ? (
        <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading more…' : 'Load more'}
        </button>
      ) : null}
    </div>
  )
}
