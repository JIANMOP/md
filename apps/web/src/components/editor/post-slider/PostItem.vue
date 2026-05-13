<script setup lang="ts">
import type { Post, PostItemProps } from '@/types/post'
import type { ArchiveDirNode } from '@/utils/webdavArchive'
import {
  ChevronRight,
  Cloud,
  Copy,
  Edit3,
  Ellipsis,
  FileDown,
  FileInput,
  History,
  Package,
  PlusSquare,
  Trash2,
} from 'lucide-vue-next'
import { usePostStore } from '@/stores/post'
import { useTemplateStore } from '@/stores/template'
import { useUIStore } from '@/stores/ui'
import { downloadMD } from '@/utils'

const props = defineProps<PostItemProps>()
const hasArchiveConfig = ref(false)
/** 目录选择弹窗状态 */
const showDirPicker = ref(false)
/** 待归档的 postId（选择目录后执行） */
const pendingArchivePostId = ref('')
/** 归档目录树 */
const archiveTree = ref<ArchiveDirNode[]>([])
/** 选中目录路径 */
const selectedDir = ref('')
/** 目录树展开状态 */
const expandedDirs = ref(new Set<string>())

const postStore = usePostStore()
const templateStore = useTemplateStore()
const uiStore = useUIStore()
const { posts, currentPostId } = storeToRefs(postStore)
const { toggleShowTemplateDialog } = uiStore

async function checkConfig() {
  const { checkArchiveConfigured } = await import('@/utils/webdavArchive')
  hasArchiveConfig.value = await checkArchiveConfigured()
}
checkConfig()

async function archiveToWebDAV(postId: string) {
  const post = posts.value.find(p => p.id === postId)
  if (!post)
    return

  // 已有归档目录（包括空字符串表示根目录），直接使用
  if (post.archiveDir !== undefined) {
    const [{ exportToArchiveDir }] = await Promise.all([
      import('@/utils/webdavArchive'),
    ])
    try {
      await exportToArchiveDir(post.content, post.title, post.archiveDir || '')
      const dirLabel = post.archiveDir ? `「${post.archiveDir}」` : `归档根目录`
      toast.success(`「${post.title}」已归档到 ${dirLabel}`)
      window.dispatchEvent(new CustomEvent('archive-completed', {
        detail: { title: post.title },
      }))
    }
    catch (error: any) {
      toast.error(`归档失败：${error.message}`)
    }
    return
  }

  // 首次归档，弹出目录选择器
  await showArchiveDirPicker(postId)
}

/** 弹出归档目录选择器 */
async function showArchiveDirPicker(postId: string) {
  const post = posts.value.find(p => p.id === postId)
  if (!post)
    return

  const [{ listArchiveTree, checkArchiveConfigured }] = await Promise.all([
    import('@/utils/webdavArchive'),
  ])

  const configured = await checkArchiveConfigured()
  if (!configured) {
    toast.error('请先配置归档目录')
    return
  }

  archiveTree.value = await listArchiveTree()
  selectedDir.value = ''
  expandedDirs.value = new Set()
  pendingArchivePostId.value = postId
  showDirPicker.value = true
}

/** 选中目录 */
function selectArchiveDir(dirPath: string) {
  selectedDir.value = dirPath
}

/** 展开/收起目录树 */
function togglePickerDir(dirPath: string) {
  if (expandedDirs.value.has(dirPath)) {
    expandedDirs.value.delete(dirPath)
  }
  else {
    expandedDirs.value.add(dirPath)
  }
}

/** 确认归档 */
async function confirmArchive() {
  const post = posts.value.find(p => p.id === pendingArchivePostId.value)
  if (!post)
    return

  const [{ exportToArchiveDir }] = await Promise.all([
    import('@/utils/webdavArchive'),
  ])
  try {
    const targetDir = selectedDir.value
    await exportToArchiveDir(post.content, post.title, targetDir)
    post.archiveDir = targetDir
    const dirLabel = targetDir ? `「${targetDir}」` : `归档根目录`
    toast.success(`「${post.title}」已归档到 ${dirLabel}`)
    window.dispatchEvent(new CustomEvent('archive-completed', {
      detail: { title: post.title },
    }))
    showDirPicker.value = false
  }
  catch (error: any) {
    toast.error(`归档失败：${error.message}`)
  }
}

const { drag, actions } = props
const isSelectMode = computed(() => props.select?.isSelectMode ?? false)
const selectedIds = computed(() => props.select?.selectedIds ?? [])
const onToggleSelect = computed(() => props.select?.onToggleSelect)

function handleDragStart(id: string, e: DragEvent) {
  drag.setDragSourceId(id)
  e.dataTransfer?.setData(`text/plain`, id)
  e.dataTransfer!.effectAllowed = `move`
}

function togglePostExpanded(postId: string) {
  const targetPost = posts.value.find(p => p.id === postId)
  if (targetPost) {
    targetPost.collapsed = !targetPost.collapsed
  }
}

function isHasChild(postId: string) {
  return props.sortedPosts.some(p => p.parentId === postId)
}

function saveAsTemplate(postId: string) {
  const post = posts.value.find(p => p.id === postId)
  if (!post)
    return

  templateStore.createTemplate({
    name: post.title,
    content: post.content,
    description: `从「${post.title}」创建于 ${new Date().toLocaleString('zh-CN')}`,
  })
}

function duplicateSingle(postId: string) {
  const p = posts.value.find(p => p.id === postId)
  if (!p)
    return
  postStore.addPost(`${p.title} 副本`, p.parentId ?? null)
  const newPost = posts.value[posts.value.length - 1]
  postStore.updatePostContent(newPost.id, p.content)
}

function applyTemplate(postId: string) {
  currentPostId.value = postId
  toggleShowTemplateDialog(true)
}

const inlineEditId = ref<string | null>(null)
const inlineEditVal = ref(``)
let inlineInputRef: HTMLInputElement | null = null
function setInlineInputRef(el: unknown) {
  inlineInputRef = el as HTMLInputElement | null
}

function startInlineRename(post: Post) {
  inlineEditId.value = post.id
  inlineEditVal.value = post.title
  nextTick(() => {
    inlineInputRef?.select()
  })
}

function commitInlineRename() {
  const id = inlineEditId.value
  if (!id)
    return
  const trimmed = inlineEditVal.value.trim()
  if (!trimmed) {
    toast.error(`内容标题不可为空`)
    inlineEditId.value = null
    return
  }
  const currentTitle = postStore.getPostById(id)?.title
  if (trimmed !== currentTitle) {
    postStore.renamePost(id, trimmed)
    toast.success(`修改成功`)
  }
  inlineEditId.value = null
}

function cancelInlineRename() {
  inlineEditId.value = null
}

/** 统计目录中的文件数量（递归） */
function getDirFilesCount(node: ArchiveDirNode): number {
  let count = node.files.length
  for (const child of node.children) {
    count += getDirFilesCount(child)
  }
  return count
}
</script>

<template>
  <div v-for="post in props.sortedPosts.filter(p => (props.parentId == null && p.parentId == null) || p.parentId === props.parentId)" :key="post.id">
    <a
      class="post-item group relative flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 py-[7px] text-[13px] leading-snug transition-all duration-150 ease-out"
      :class="{
        'bg-accent text-accent-foreground font-medium active-item': !isSelectMode && currentPostId === post.id,
        'text-foreground/70 hover:text-foreground hover:bg-accent/50': isSelectMode ? true : currentPostId !== post.id,
        'opacity-30': drag.dragSourceId === post.id,
        'ring-1 ring-primary/40 ring-inset bg-primary/5': drag.dropTargetId === post.id,
      }"
      :draggable="!isSelectMode && inlineEditId !== post.id"
      @dragstart="!isSelectMode && handleDragStart(post.id, $event)"
      @dragend="drag.handleDragEnd"
      @drop.prevent="!isSelectMode && drag.handleDrop(post.id)"
      @dragover.stop.prevent="!isSelectMode && drag.setDropTargetId(post.id)"
      @dragleave.prevent="drag.setDropTargetId(null)"
      @click="isSelectMode ? onToggleSelect?.(post.id) : (currentPostId = post.id)"
    >
      <span
        v-if="!isSelectMode && currentPostId === post.id"
        class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary"
      />

      <span
        v-if="isSelectMode"
        class="flex shrink-0 items-center justify-center size-5"
        @click.stop="onToggleSelect?.(post.id)"
      >
        <span
          class="flex items-center justify-center size-4 rounded border transition-colors duration-150"
          :class="selectedIds?.includes(post.id)
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-border bg-background'"
        >
          <svg v-if="selectedIds?.includes(post.id)" class="size-2.5" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </span>

      <button
        v-if="!isSelectMode"
        class="flex shrink-0 items-center justify-center size-5 rounded text-muted-foreground/50 transition-colors duration-150"
        :class="{
          'hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5': isHasChild(post.id),
          'invisible': !isHasChild(post.id),
        }"
        @click.stop="isHasChild(post.id) && togglePostExpanded(post.id)"
      >
        <ChevronRight
          class="size-3.5 transition-transform duration-200 ease-out"
          :class="{ 'rotate-90': !post.collapsed }"
        />
      </button>

      <input
        v-if="inlineEditId === post.id"
        :ref="setInlineInputRef"
        v-model="inlineEditVal"
        class="flex-1 min-w-0 bg-transparent outline-none border-b border-primary text-[13px] leading-snug"
        @click.stop
        @keyup.enter="commitInlineRename"
        @keyup.escape="cancelInlineRename"
        @blur="commitInlineRename"
      >
      <span
        v-else
        class="flex-1 truncate select-none"
        @dblclick.stop="startInlineRename(post)"
      >{{ post.title }}</span>

      <DropdownMenu v-if="!isSelectMode">
        <DropdownMenuTrigger as-child>
          <button
            class="ml-auto flex shrink-0 items-center justify-center size-6 rounded-md text-muted-foreground/40 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 data-[state=open]:opacity-100 data-[state=open]:text-foreground"
            @click.stop
          >
            <Ellipsis class="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-40">
          <DropdownMenuItem @click.stop="actions.openAddPostDialog(post.id)">
            <PlusSquare class="mr-2 size-4" /> 新增内容
          </DropdownMenuItem>
          <DropdownMenuItem @click.stop="actions.startRenamePost(post.id)">
            <Edit3 class="mr-2 size-4" /> 重命名
          </DropdownMenuItem>
          <DropdownMenuItem @click.stop="duplicateSingle(post.id)">
            <Copy class="mr-2 size-4" /> 复制
          </DropdownMenuItem>
          <DropdownMenuItem @click.stop="actions.openHistoryDialog(post.id)">
            <History class="mr-2 size-4" /> 历史记录
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click.stop="downloadMD(post.content, post.title)">
            <FileDown class="mr-2 size-4" /> 导出 .md
          </DropdownMenuItem>
          <DropdownMenuItem
            :disabled="!hasArchiveConfig"
            @click.stop="archiveToWebDAV(post.id)"
          >
            <Cloud class="mr-2 size-4" /> 归档到 WebDAV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click.stop="saveAsTemplate(post.id)">
            <Package class="mr-2 size-4" /> 存储为模板
          </DropdownMenuItem>
          <DropdownMenuItem @click.stop="applyTemplate(post.id)">
            <FileInput class="mr-2 size-4" /> 应用模板
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="posts.length > 1" />
          <DropdownMenuItem
            v-if="posts.length > 1"
            class="text-destructive focus:text-destructive"
            @click.stop="actions.startDelPost(post.id)"
          >
            <Trash2 class="mr-2 size-4" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </a>

    <div
      v-if="isHasChild(post.id) && !post.collapsed"
      class="ml-3 border-l border-border/40 pl-1.5 py-0.5"
    >
      <PostItem
        :parent-id="post.id"
        :sorted-posts="props.sortedPosts"
        :actions="actions"
        :drag="drag"
        :select="select"
      />
    </div>
  </div>

  <!-- 归档目录选择弹窗 -->
  <Teleport to="body">
    <div
      v-if="showDirPicker"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="showDirPicker = false"
    >
      <div class="bg-background border border-border rounded-xl shadow-xl w-80 max-h-[70vh] flex flex-col">
        <!-- 弹窗标题 -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
          <span class="text-sm font-medium">选择归档目录</span>
          <button
            class="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            @click="showDirPicker = false"
          >
            <span class="text-lg leading-none">&times;</span>
          </button>
        </div>
        <!-- 目录树 -->
        <div class="flex-1 overflow-y-auto thin-scrollbar px-2 py-2">
          <!-- 根目录选项 -->
          <div
            class="flex items-center gap-2 px-2 py-[7px] rounded-lg cursor-pointer transition-colors text-[13px]"
            :class="selectedDir === '' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
            @click="selectArchiveDir('')"
          >
            <Cloud class="size-3.5 shrink-0 text-muted-foreground/60" />
            <span class="truncate">归档根目录</span>
          </div>
          <template v-for="node in archiveTree" :key="node.relPath || node.href">
            <!-- 目录节点 -->
            <div v-if="node.name">
              <div
                class="flex items-center gap-1 px-2 py-[7px] rounded-lg cursor-pointer transition-colors text-[13px]"
                :class="selectedDir === node.relPath ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
                @click="selectArchiveDir(node.relPath)"
              >
                <ChevronRight
                  class="size-3 shrink-0 text-muted-foreground/50 transition-transform"
                  :class="{ 'rotate-90': expandedDirs.has(node.relPath) }"
                  @click.stop="togglePickerDir(node.relPath)"
                />
                <Cloud class="size-3.5 shrink-0 text-muted-foreground/60" />
                <span class="truncate flex-1">{{ node.name }}</span>
                <span class="text-[10px] text-muted-foreground/40 tabular-nums">{{ getDirFilesCount(node) }}</span>
              </div>
              <!-- 展开的子目录 -->
              <div v-if="expandedDirs.has(node.relPath)" class="ml-4 border-l border-border/40 pl-1.5">
                <template v-for="child in node.children" :key="child.relPath">
                  <div
                    class="flex items-center gap-1 px-2 py-[7px] rounded-lg cursor-pointer transition-colors text-[13px]"
                    :class="selectedDir === child.relPath ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
                    @click="selectArchiveDir(child.relPath)"
                  >
                    <ChevronRight
                      class="size-3 shrink-0 text-muted-foreground/50 transition-transform"
                      :class="{ 'rotate-90': expandedDirs.has(child.relPath) }"
                      @click.stop="togglePickerDir(child.relPath)"
                    />
                    <Cloud class="size-3.5 shrink-0 text-muted-foreground/60" />
                    <span class="truncate flex-1">{{ child.name }}</span>
                    <span class="text-[10px] text-muted-foreground/40 tabular-nums">{{ getDirFilesCount(child) }}</span>
                  </div>
                  <!-- 更深层展开 -->
                  <div v-if="expandedDirs.has(child.relPath)" class="ml-4 border-l border-border/40 pl-1.5">
                    <template v-for="subChild in child.children" :key="subChild.relPath">
                      <div
                        class="flex items-center gap-1 px-2 py-[7px] rounded-lg cursor-pointer transition-colors text-[13px]"
                        :class="selectedDir === subChild.relPath ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
                        @click="selectArchiveDir(subChild.relPath)"
                      >
                        <Cloud class="size-3.5 shrink-0 text-muted-foreground/60" />
                        <span class="truncate flex-1">{{ subChild.name }}</span>
                        <span class="text-[10px] text-muted-foreground/40 tabular-nums">{{ getDirFilesCount(subChild) }}</span>
                      </div>
                    </template>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
        <!-- 操作栏 -->
        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/40 shrink-0">
          <button
            class="px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            @click="showDirPicker = false"
          >
            取消
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            @click="confirmArchive"
          >
            归档到此目录
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
