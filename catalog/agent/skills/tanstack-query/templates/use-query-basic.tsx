import { queryOptions, usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";

import { sdk } from "#lib/graphql-client";
import { queryClient } from "#lib/query-client";

type OrganizationsFilters = {
  first?: number;
  search?: string;
};

function organizationsListKey(filters: OrganizationsFilters = {}) {
  return ["organizations", "list", filters] as const;
}

function organizationMembersKey(organizationId: string) {
  return ["organizations", organizationId, "members"] as const;
}

/**
 * Canonical query factory: reusable, SDK-backed, and safe to share with
 * suspense hooks, prefetch, tests, and RR7 clientLoader functions.
 */
export const organizationsListOptions = (filters: OrganizationsFilters = {}) =>
  queryOptions({
    queryKey: organizationsListKey(filters),
    queryFn: () => sdk.OrganizationsList(filters),
  });

export const organizationMembersOptions = (organizationId: string) =>
  queryOptions({
    queryKey: organizationMembersKey(organizationId),
    queryFn: () => sdk.OrganizationMembers({ organizationId }),
  });

/**
 * Route-critical data should be prefetched before render.
 */
export async function clientLoader() {
  await queryClient.ensureQueryData(organizationsListOptions({ first: 20 }));
  return null;
}

export function OrganizationsRoute() {
  const { data } = useSuspenseQuery(organizationsListOptions({ first: 20 }));
  const firstOrganizationId = data.organizationsList.nodes[0]?.id;

  return (
    <>
      {firstOrganizationId ? (
        <OrganizationMembersPrefetch organizationId={firstOrganizationId} />
      ) : null}
      <OrganizationsTable organizations={data.organizationsList.nodes} />
    </>
  );
}

/**
 * Use render-time prefetch only to flatten a secondary suspense boundary.
 */
function OrganizationMembersPrefetch({ organizationId }: { organizationId: string }) {
  usePrefetchQuery(organizationMembersOptions(organizationId));
  return null;
}

function OrganizationsTable({
  organizations,
}: {
  organizations: Array<{ id: string; name: string }>;
}) {
  return (
    <ul>
      {organizations.map((organization) => (
        <li key={organization.id}>{organization.name}</li>
      ))}
    </ul>
  );
}
