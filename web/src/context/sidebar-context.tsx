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
