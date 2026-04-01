import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type SidebarContextValue = {
  groupId: string | null
  setGroupId: (id: string | null) => void
  // Dialog state
  createGroupDialogOpen: boolean
  openCreateGroupDialog: () => void
  closeCreateGroupDialog: () => void
  editGroupDialogOpen: boolean
  editGroupId: string | null
  openEditGroupDialog: (id: string) => void
  closeEditGroupDialog: () => void
  addMemberDialogOpen: boolean
  addMemberGroupId: string | null
  openAddMemberDialog: (id: string) => void
  closeAddMemberDialog: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false)
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false)
  const [addMemberGroupId, setAddMemberGroupId] = useState<string | null>(null)

  const openCreateGroupDialog = useCallback(() => {
    setCreateGroupDialogOpen(true)
  }, [])

  const closeCreateGroupDialog = useCallback(() => {
    setCreateGroupDialogOpen(false)
  }, [])

  const openEditGroupDialog = useCallback((id: string) => {
    setEditGroupId(id)
    setEditGroupDialogOpen(true)
  }, [])

  const closeEditGroupDialog = useCallback(() => {
    setEditGroupDialogOpen(false)
    setEditGroupId(null)
  }, [])

  const openAddMemberDialog = useCallback((id: string) => {
    setAddMemberGroupId(id)
    setAddMemberDialogOpen(true)
  }, [])

  const closeAddMemberDialog = useCallback(() => {
    setAddMemberDialogOpen(false)
    setAddMemberGroupId(null)
  }, [])

  return (
    <SidebarContext.Provider value={{
      groupId,
      setGroupId,
      createGroupDialogOpen,
      openCreateGroupDialog,
      closeCreateGroupDialog,
      editGroupDialogOpen,
      editGroupId,
      openEditGroupDialog,
      closeEditGroupDialog,
      addMemberDialogOpen,
      addMemberGroupId,
      openAddMemberDialog,
      closeAddMemberDialog,
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
