/**
 * Reactive state store for the Migration Center Workbench UI.
 * Manages open/close state, active tab, preloaded tool contexts,
 * and composer prompt dispatch handoffs.
 *
 * @module @deepseek-ai/dsh-mmb-migration-workbench/client/workbench-state
 */

import type { WorkloadAssessmentRequest } from '../types.ts'

export type WorkbenchTab = 'portfolio' | 'assessment' | 'ingress' | 'skills' | 'recipes'

export interface WorkbenchState {
  readonly isOpen: boolean
  readonly activeTab: WorkbenchTab
  readonly filterDomain?: 'all' | 'migrate' | 'modernize' | 'build' | 'top-tier'
  readonly searchQuery: string
  readonly selectedAssetId?: string
  readonly assessmentPreload?: Partial<WorkloadAssessmentRequest> | undefined
  readonly ingressPreload?: string | undefined
}

type Listener = (state: WorkbenchState) => void

let currentState: WorkbenchState = {
  isOpen: false,
  activeTab: 'portfolio',
  filterDomain: 'all',
  searchQuery: '',
}

const listeners = new Set<Listener>()

export const workbenchStore = {
  getSnapshot(): WorkbenchState {
    return currentState
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  setOpen(isOpen: boolean): void {
    currentState = { ...currentState, isOpen }
    notify()
  },

  close(): void {
    currentState = { ...currentState, isOpen: false }
    notify()
  },

  toggleOpen(): void {
    currentState = { ...currentState, isOpen: !currentState.isOpen }
    notify()
  },

  setActiveTab(activeTab: WorkbenchTab): void {
    currentState = { ...currentState, activeTab, isOpen: true }
    notify()
  },

  setFilterDomain(filterDomain: 'all' | 'migrate' | 'modernize' | 'build' | 'top-tier'): void {
    currentState = { ...currentState, filterDomain }
    notify()
  },

  setSearchQuery(searchQuery: string): void {
    currentState = { ...currentState, searchQuery }
    notify()
  },

  selectAsset(assetId: string): void {
    currentState = { ...currentState, selectedAssetId: assetId, activeTab: 'portfolio', isOpen: true }
    notify()
  },

  openWithAssessment(request: Partial<WorkloadAssessmentRequest>): void {
    currentState = {
      ...currentState,
      activeTab: 'assessment',
      isOpen: true,
      assessmentPreload: request,
    }
    notify()
  },

  openWithIngress(yaml: string): void {
    currentState = {
      ...currentState,
      activeTab: 'ingress',
      isOpen: true,
      ingressPreload: yaml,
    }
    notify()
  },

  openWithSearch(query: string): void {
    currentState = {
      ...currentState,
      activeTab: 'portfolio',
      isOpen: true,
      searchQuery: query,
    }
    notify()
  },
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener(currentState)
    } catch (e) {
      console.error('[mmb-workbench] listener error:', e)
    }
  }
}

/**
 * Display a non-intrusive floating toast notification.
 */
export function showNotificationToast(message: string, durationMs = 3200): void {
  if (typeof document === 'undefined') return
  let toastContainer = document.getElementById('mmb-toast-container')
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'mmb-toast-container'
    toastContainer.style.position = 'fixed'
    toastContainer.style.bottom = '24px'
    toastContainer.style.right = '24px'
    toastContainer.style.zIndex = '99999'
    toastContainer.style.display = 'flex'
    toastContainer.style.flexDirection = 'column'
    toastContainer.style.gap = '8px'
    toastContainer.style.pointerEvents = 'none'
    document.body.appendChild(toastContainer)
  }

  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.background = '#202124'
  toast.style.color = '#81c995'
  toast.style.border = '1px solid #34a853'
  toast.style.padding = '10px 16px'
  toast.style.borderRadius = '8px'
  toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)'
  toast.style.fontSize = '13px'
  toast.style.fontWeight = '500'
  toast.style.transition = 'all 0.25s ease'
  toast.style.opacity = '0'
  toast.style.transform = 'translateY(10px)'
  toast.style.pointerEvents = 'auto'

  toastContainer.appendChild(toast)
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateY(0)'
  })

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(10px)'
    setTimeout(() => {
      toast.remove()
    }, 280)
  }, durationMs)
}

/**
 * Handoff helper to copy prompt, close workbench, and inject text into the
 * active DeepSeek Harness session composer.
 */
export function sendPromptToHarnessComposer(prompt: string, options?: { autoSubmit?: boolean }): void {
  // 1. Guaranteed fallback: Copy to clipboard
  try {
    navigator.clipboard?.writeText(prompt)
  } catch (e) {
    console.warn('[mmb-workbench] Clipboard copy warning:', e)
  }

  // 2. Close the workbench modal
  workbenchStore.close()

  // 3. Find and populate composer in DOM
  if (typeof document !== 'undefined') {
    setTimeout(() => {
      const composer = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea')
      if (composer instanceof HTMLElement) {
        composer.focus()
        if (composer.tagName.toLowerCase() === 'textarea') {
          const ta = composer as HTMLTextAreaElement
          ta.value = prompt
          ta.dispatchEvent(new Event('input', { bubbles: true }))
        } else {
          try {
            document.execCommand('insertText', false, prompt)
          } catch {
            const inputEvent = new InputEvent('beforeinput', {
              inputType: 'insertText',
              data: prompt,
              bubbles: true,
              cancelable: true,
            })
            composer.dispatchEvent(inputEvent)
          }
        }
      }

      if (options?.autoSubmit) {
        setTimeout(() => {
          const submitBtn = document.querySelector(
            'button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"], button[title*="Send"], button.dsh-composer-submit',
          )
          if (submitBtn instanceof HTMLElement) {
            submitBtn.click()
          }
        }, 100)
      }
    }, 60)
  }

  // 4. Confirm to practitioner
  showNotificationToast('✓ Prompt sent to active session composer & copied to clipboard!')
}
