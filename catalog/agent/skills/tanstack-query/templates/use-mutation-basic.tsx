import {
  mutationOptions,
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";

import { sdk } from "#lib/graphql-client";

type UpdateOrganizationInput = {
  organizationId: string;
  displayName: string;
};

const updateOrganizationMutationKey = ["organizations", "update"] as const;

export const updateOrganizationOptions = () =>
  mutationOptions({
    mutationKey: updateOrganizationMutationKey,
    mutationFn: ({ organizationId, displayName }: UpdateOrganizationInput) =>
      sdk.UpdateOrganization({ organizationId, set: { displayName } }),
  });

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    ...updateOrganizationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

/**
 * Prefer TanStack mutation-state primitives for sibling pending UI.
 */
export function OrganizationSaveIndicator() {
  const pendingLabels = useMutationState<string>({
    filters: { mutationKey: updateOrganizationMutationKey, status: "pending" },
    select: (mutation) => mutation.state.variables?.displayName ?? "Saving…",
  });

  const pendingCount = useIsMutating({ mutationKey: updateOrganizationMutationKey });

  if (pendingCount === 0) {
    return null;
  }

  return <div>{pendingLabels.join(", ")}</div>;
}
