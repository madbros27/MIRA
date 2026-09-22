'use client'

import type { Portal } from '@/lib/supabase/portal'

export type SessionMessageType =
  | 'SESSION_REFRESHED'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'SESSION_EXPIRED'
  | 'WORKSPACE_SWITCHED'
  | 'PERMISSIONS_CHANGED'
  | 'DATA_INVALIDATED'

export type SessionMessage = {
  type: SessionMessageType
  originTabId: string
  queryKeys?: ReadonlyArray<ReadonlyArray<unknown>>
  reason?: string
}

const tabId = typeof window === 'undefined'
  ? ''
  : (() => {
      const key = 'mira.origin_tab_id'
      const existing = sessionStorage.getItem(key)
      if (existing) return existing
      const created = crypto.randomUUID()
      sessionStorage.setItem(key, created)
      return created
    })()

const channels: Partial<Record<Portal, BroadcastChannel>> = {}

function channelName(portal: Portal) {
  return `mira-session-${portal}`
}

function storageKey(portal: Portal) {
  return `mira.session.bus.${portal}`
}

export function getOriginTabId() {
  return tabId
}

export function createSessionBus(portal: Portal, onMessage: (message: SessionMessage) => void) {
  let closed = false
  const channel = typeof BroadcastChannel !== 'undefined'
    ? (channels[portal] ??= new BroadcastChannel(channelName(portal)))
    : null

  const receive = (raw: string | MessageEvent<SessionMessage>) => {
    const message = typeof raw === 'string' ? JSON.parse(raw) as SessionMessage : raw.data
    if (!message || message.originTabId === tabId) return
    onMessage(message)
  }

  const channelListener = (event: MessageEvent<SessionMessage>) => receive(event)
  const storageListener = (event: StorageEvent) => {
    if (event.key === storageKey(portal) && event.newValue) receive(event.newValue)
  }

  channel?.addEventListener('message', channelListener)
  window.addEventListener('storage', storageListener)

  return {
    post(message: Omit<SessionMessage, 'originTabId'>) {
      if (closed) return
      const payload: SessionMessage = { ...message, originTabId: tabId }
      if (channel) channel.postMessage(payload)
      else localStorage.setItem(storageKey(portal), JSON.stringify(payload))
    },
    close() {
      closed = true
      channel?.removeEventListener('message', channelListener)
      window.removeEventListener('storage', storageListener)
    },
  }
}

export function broadcastSessionMessage(
  portal: Portal,
  message: Omit<SessionMessage, 'originTabId'>
) {
  const payload: SessionMessage = { ...message, originTabId: tabId }
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(channelName(portal))
    channel.postMessage(payload)
    channel.close()
  } else {
    localStorage.setItem(storageKey(portal), JSON.stringify(payload))
  }
}

export function broadcastDataInvalidated(
  portal: Portal,
  queryKeys: ReadonlyArray<ReadonlyArray<unknown>>
) {
  broadcastSessionMessage(portal, { type: 'DATA_INVALIDATED', queryKeys })
}
