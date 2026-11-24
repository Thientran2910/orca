import { useAppStore } from '@/store/index'
import { workspaceCatalogConfirmsAbsence } from '@/store/workspaces/catalog/workspace-catalog-absence'
import type { Translate } from '@/i18n/use-translate'
import type { AutomationRun } from '../../../../../shared/automations/history/automation-run'
import type { AutomationsPageListState } from '../listing/use-automations-page-list-state'
import { getAutomationRunDetailsWorkspaceName } from './automation-run-workspace-display'

export function useAutomationRunWorkspaceDetails(
  run: AutomationRun | null,
  runTargetFor: AutomationsPageListState['runTargetFor'],
  t: Translate
) {
  const selectedRunTarget = run ? runTargetFor(run) : null
  const viewState = selectedRunTarget?.viewState
  const workspaceId = run?.workspaceId
  const catalogHostId = selectedRunTarget?.workspaceCatalogHostId
  const workspaceRemoved = useAppStore((state) =>
    Boolean(
      workspaceId &&
      catalogHostId &&
      !selectedRunTarget?.worktree &&
      !viewState?.canOpen &&
      workspaceCatalogConfirmsAbsence(state, workspaceId, catalogHostId)
    )
  )
  const actionLabel = viewState?.canOpen ? viewState.actionLabel : null
  const name = run
    ? getAutomationRunDetailsWorkspaceName(
        {
          run,
          worktree: selectedRunTarget?.worktree ?? null,
          actionLabel,
          workspaceRemoved
        },
        t
      )
    : null
  return { name, actionLabel }
}
