import { useMemo } from 'react'
import { useOrganizationsList } from '~/generated/frontend/hooks/useOrganizationsList'

/**
 * Prefer generated CRUD hooks/options whenever generation can own the contract.
 *
 * This file shows the only acceptable kind of custom hook here: thin
 * composition over generated outputs. It should not become a new data-layer
 * owner.
 */
export function useOrganizationSwitcherModel() {
  const { data } = useOrganizationsList({ first: 20 })
  return useMemo(
    () =>
      (data?.organizationsList.nodes ?? []).map((organization) => ({
        label: organization.name,
        value: organization.id,
      })),
    [data?.organizationsList.nodes],
  )
}

/**
 * If you need more than a small composition layer, stop and check whether the
 * generator or a shared factory should own the contract instead.
 */
