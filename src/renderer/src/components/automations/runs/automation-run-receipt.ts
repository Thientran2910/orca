import { useLayoutEffect } from 'react'
import { toast, type Action } from 'sonner'
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

export function showAutomationRunReceipt(
  message: string,
  { runKey, label, open }: { runKey: string; label: string; open: () => void }
): void {
  const action: Action = {
    label,
    onClick: (event) => {
      event.preventDefault()
      open()
    }
  }
  const show = (visible: boolean, id?: string | number): string | number =>
    toast.message(message, {
      id,
      duration: Infinity,
      closeButton: true,
      action: visible ? null : action,
      onDismiss: () => unsubscribe()
    })
  const unsubscribe = visibleRun.subscribe((current, previous) => {
    const visible = current.key === runKey
    if (visible === (previous.key === runKey)) {
      return
    }
    if (!toast.getToasts().some((entry) => entry.id === id)) {
      unsubscribe()
      return
    }
    // Sonner measures again when its native action changes.
    show(visible, id)
  })
  const id = show(visibleRun.getState().key === runKey)
}
