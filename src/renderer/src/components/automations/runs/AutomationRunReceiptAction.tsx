import { useLayoutEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

const visibleRun = createStore<{ key: string | null }>(() => ({ key: null }))

export function automationRunReceiptKey(rowKey: string, ownerKey: string, runId: string): string {
  return JSON.stringify([rowKey, ownerKey, runId])
}

export function useVisibleAutomationRunReceiptKey(key: string | null): void {
  useLayoutEffect(() => {
    visibleRun.setState({ key })
    return () => {
      if (visibleRun.getState().key === key) {
        visibleRun.setState({ key: null })
      }
    }
  }, [key])
}

export function AutomationRunReceiptAction({
  runKey,
  label,
  open
}: {
  runKey: string
  label: string
  open: () => void
}): React.JSX.Element | null {
  const runIsVisible = useStore(visibleRun, (state) => state.key === runKey)
  return runIsVisible ? null : (
    <button type="button" data-button data-action onClick={open}>
      {label}
    </button>
  )
}
