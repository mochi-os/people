// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type SidebarContextValue = {
  groupId: string | null
  setGroupId: (id: string | null) => void
  // Dialog state
  createGroupDialogOpen: boolean
  openCreateGroupDialog: () => void
  closeCreateGroupDialog: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false)

  const openCreateGroupDialog = useCallback(() => {
    setCreateGroupDialogOpen(true)
  }, [])

  const closeCreateGroupDialog = useCallback(() => {
    setCreateGroupDialogOpen(false)
  }, [])

  return (
    <SidebarContext.Provider value={{
      groupId,
      setGroupId,
      createGroupDialogOpen,
      openCreateGroupDialog,
      closeCreateGroupDialog,
    }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebarContext must be used within a SidebarProvider')
  }
  return context
}
