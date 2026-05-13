export interface PostHistory {
  datetime: string
  content: string
}

export interface Post {
  id: string
  title: string
  content: string
  history: PostHistory[]
  createDatetime: Date
  updateDatetime: Date
  parentId?: string | null
  collapsed?: boolean
  /** WebDAV 归档目标目录（相对归档根），如 "folder1" 或 "folder1/sub" */
  archiveDir?: string
}

export interface PostItemDragState {
  dragSourceId: string | null
  dropTargetId: string | null
  setDragSourceId: (id: string | null) => void
  setDropTargetId: (id: string | null) => void
  handleDrop: (targetId: string | null) => void
  handleDragEnd: () => void
}

export interface PostItemSelectState {
  isSelectMode: boolean
  selectedIds: string[]
  onToggleSelect: (id: string) => void
}

export interface PostItemActions {
  startRenamePost: (id: string) => void
  openHistoryDialog: (id: string) => void
  startDelPost: (id: string) => void
  openAddPostDialog: (parentId: string) => void
}

export interface PostItemProps {
  parentId: string | null
  sortedPosts: Post[]
  actions: PostItemActions
  drag: PostItemDragState
  select?: PostItemSelectState
}
