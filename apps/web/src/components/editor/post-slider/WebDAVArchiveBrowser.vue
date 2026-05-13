<script setup lang="ts">
import type { ArchiveDirNode, ArchiveFileInfo } from '@/utils/webdavArchive'
import { ChevronRight, Cloud, FileText, FolderPlus, RefreshCw, Trash2 } from 'lucide-vue-next'
import {

  checkArchiveConfigured,
  createArchiveSubDir,
  deleteArchiveDir,
  deleteArchiveFileInDir,
  listArchiveTree,
  moveArchiveItem,
  readArchiveFileInDir,
} from '@/utils/webdavArchive'

const emit = defineEmits<{
  openInEditor: [content: string, title: string, relDir: string]
  archiveConfigured: [configured: boolean]
}>()

/** 树状结构 */
const tree = ref<ArchiveDirNode[]>([])
/** 加载中 */
const isLoading = ref(false)
/** 错误信息 */
const error = ref<string | null>(null)
/** WebDAV 是否已配置 */
const configured = ref<boolean | null>(null)
/** 展开的目录 relPath 集合 */
const expandedDirs = ref(new Set<string>())
/** 新建文件夹输入框显隐 */
const showNewFolderInput = ref(false)
const newFolderName = ref(``)
const newFolderParent = ref('')

/** 当前拖拽的源信息 */
const dragSource = ref<{ type: 'file' | 'dir', relPath: string, name: string } | null>(null)
/** 当前拖拽悬浮的目标目录路径（用于高亮） */
const dragOverDir = ref<string | null>(null)

/** 当前浏览的归档子目录（用于记住归档位置） */
const currentDirRelPath = ref('')

defineExpose({ loadFiles, currentDirRelPath })

onMounted(async () => {
  // 恢复上次的记忆：如果有 lastArchiveDir，设为当前目录
  const { store } = await import('@/utils/storage')
  const lastDir = await store.get('lastArchiveDir') || ''
  if (lastDir) {
    currentDirRelPath.value = lastDir
  }
  await loadFiles()
})

/** 同步 currentDirRelPath 到 store（供 PostItem/export 等组件使用） */
async function syncArchiveDir(dirPath: string) {
  currentDirRelPath.value = dirPath
  const { store } = await import('@/utils/storage')
  await store.set('lastArchiveDir', dirPath)
}

async function loadFiles() {
  isLoading.value = true
  error.value = null

  try {
    const isConfigured = await checkArchiveConfigured()
    configured.value = isConfigured
    emit('archiveConfigured', isConfigured)
    if (isConfigured) {
      tree.value = await listArchiveTree()
    }
  }
  catch (e: any) {
    error.value = e.message || `加载失败`
    emit('archiveConfigured', false)
  }
  finally {
    isLoading.value = false
    // 加载完成后，检查是否有展开的目录
    // 如果没有目录展开，且 currentDirRelPath 不是 tree 中实际存在的目录，清空
    if (currentDirRelPath.value) {
      const exists = findDirByRelPath(tree.value, currentDirRelPath.value)
      if (!exists) {
        await syncArchiveDir('')
      }
    }
  }
}

/** 在树中查找指定 relPath 的目录 */
function findDirByRelPath(nodes: ArchiveDirNode[], relPath: string): ArchiveDirNode | null {
  for (const node of nodes) {
    if (node.relPath === relPath)
      return node
    if (node.children.length) {
      const found = findDirByRelPath(node.children, relPath)
      if (found)
        return found
    }
  }
  return null
}

/** 展开/收起目录 */
function toggleDir(node: ArchiveDirNode) {
  if (expandedDirs.value.has(node.relPath)) {
    expandedDirs.value.delete(node.relPath)
    // 收起的如果是当前目录，检查是否还有其他目录展开
    if (currentDirRelPath.value === node.relPath) {
      // 找其他展开的目录
      const fallback = expandedDirs.value.values().next().value || ''
      syncArchiveDir(fallback)
    }
  }
  else {
    expandedDirs.value.add(node.relPath)
    syncArchiveDir(node.relPath)
  }
}

/** 从指定目录读取文件并打开 */
async function openFileInDir(filename: string, relDir: string) {
  const content = await readArchiveFileInDir(filename, relDir)
  if (content !== null) {
    const title = filename.endsWith(`.md`) ? filename.slice(0, -3) : filename
    emit('openInEditor', content, title, relDir)
  }
  else {
    toast.error(`读取文件失败`)
  }
}

/** 开始新建文件夹 */
function startNewFolder(parentRelPath?: string) {
  showNewFolderInput.value = true
  newFolderName.value = ``
  newFolderParent.value = parentRelPath || ``
  nextTick(() => {
    // focus input
  })
}

/** 提交新建文件夹 */
async function submitNewFolder() {
  const name = newFolderName.value.trim()
  if (!name) {
    showNewFolderInput.value = false
    return
  }
  const relPath = newFolderParent.value
    ? `${newFolderParent.value}/${name}`
    : name

  const ok = await createArchiveSubDir(relPath)
  if (ok) {
    toast.success(`已创建文件夹「${name}」`)
    showNewFolderInput.value = false
    await loadFiles()
  }
  else {
    toast.error(`创建文件夹失败`)
  }
}

/** 删除文件 */
async function deleteFile(file: ArchiveFileInfo) {
  // eslint-disable-next-line no-alert
  const ok = confirm(`确认删除「${file.title}」？`)
  if (!ok)
    return
  const result = await deleteArchiveFileInDir(file.filename, file.relDir)
  if (result) {
    toast.success(`已删除「${file.title}」`)
    await loadFiles()
  }
  else {
    toast.error(`删除文件失败`)
  }
}

/** 删除文件夹 */
async function deleteDir(node: ArchiveDirNode) {
  const msg = `确认删除文件夹「${node.name}」及其所有内容？`
  // eslint-disable-next-line no-alert
  if (!confirm(msg))
    return
  const result = await deleteArchiveDir(node.relPath)
  if (result) {
    toast.success(`已删除文件夹「${node.name}」`)
    await loadFiles()
  }
  else {
    toast.error(`删除文件夹失败`)
  }
}

// ─── 拖拽 ───

/** 开始拖拽文件 */
function handleDragStartFile(e: DragEvent, file: ArchiveFileInfo) {
  const path = file.relDir ? `${file.relDir}/${file.filename}` : file.filename
  e.dataTransfer?.setData(`text/plain`, `file:${path}`)
  e.dataTransfer!.effectAllowed = `move`
  dragSource.value = { type: 'file', relPath: path, name: file.filename }
}

/** 开始拖拽目录 */
function handleDragStartDir(e: DragEvent, node: ArchiveDirNode) {
  e.dataTransfer?.setData(`text/plain`, `dir:${node.relPath}`)
  e.dataTransfer!.effectAllowed = `move`
  dragSource.value = { type: 'dir', relPath: node.relPath, name: node.name }
}

/** 拖拽经过目录时高亮 */
function handleDragOver(e: DragEvent, dirRelPath: string) {
  e.preventDefault()
  dragOverDir.value = dirRelPath
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = `move`
  }
}

/** 拖拽离开目录时取消高亮 */
function handleDragLeave(_e: DragEvent, dirRelPath: string) {
  // 避免子元素冒泡导致闪烁：只有真正离开该节点时才清除
  if (dragOverDir.value === dirRelPath) {
    dragOverDir.value = null
  }
}

/** 拖拽释放到目录 */
async function handleDrop(e: DragEvent, targetRelPath: string) {
  e.preventDefault()
  e.stopPropagation()
  dragOverDir.value = null

  const src = dragSource.value
  if (!src)
    return

  // 不能拖到自身或其子目录
  if (src.type === 'dir') {
    if (src.relPath === targetRelPath) {
      toast.info(`不能将文件夹拖入自身`)
      return
    }
    if (targetRelPath.startsWith(`${src.relPath}/`)) {
      toast.info(`不能将文件夹拖入其子文件夹`)
      return
    }
  }

  // 计算目标路径
  const itemName = src.relPath.split(`/`).pop() || src.name
  const targetPath = targetRelPath ? `${targetRelPath}/${itemName}` : itemName

  if (src.relPath === targetPath) {
    toast.info(`目标位置相同，无需移动`)
    return
  }

  const ok = await moveArchiveItem(src.relPath, targetPath)
  if (ok) {
    toast.success(`已移动到「${targetRelPath || '归档根目录'}」`)
    dragSource.value = null
    await loadFiles()
  }
  else {
    toast.error(`移动失败`)
  }
}

function getDirFilesCount(node: ArchiveDirNode): number {
  let count = node.files.length
  for (const child of node.children) {
    count += getDirFilesCount(child)
  }
  return count
}

function getTotalFileCount(nodes: ArchiveDirNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += node.files.length
    count += getTotalFileCount(node.children)
  }
  return count
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden border-t border-border bg-muted/10">
    <!-- 标题栏 -->
    <div class="flex items-center h-9 px-3 shrink-0 border-b border-border/40">
      <Cloud class="size-3.5 text-muted-foreground" />
      <span class="ml-1.5 text-xs text-muted-foreground font-medium">归档</span>
      <span
        v-if="tree.length"
        class="ml-1.5 inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground min-w-[16px] h-[16px]"
      >
        {{ getTotalFileCount(tree) }}
      </span>
      <span class="flex-1" />
      <button
        v-if="configured"
        class="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150"
        title="新建文件夹"
        @click="startNewFolder()"
      >
        <FolderPlus class="size-3" />
      </button>
      <button
        class="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150"
        title="刷新"
        :disabled="isLoading"
        @click="loadFiles"
      >
        <RefreshCw class="size-3" :class="{ 'animate-spin': isLoading }" />
      </button>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto thin-scrollbar px-1.5 py-0.5">
      <!-- 未配置 -->
      <div
        v-if="configured === false"
        class="flex flex-col items-center justify-center gap-2 py-8 px-4"
      >
        <Cloud class="size-5 text-muted-foreground/30" />
        <p class="text-xs text-muted-foreground/50 text-center">
          未配置归档目录<br>
          请在「文件 → 文档存储配置」中设置
        </p>
      </div>

      <!-- 加载中 -->
      <div
        v-else-if="isLoading"
        class="flex items-center justify-center py-8"
      >
        <RefreshCw class="size-4 text-muted-foreground/40 animate-spin" />
      </div>

      <!-- 加载失败 -->
      <div
        v-else-if="error"
        class="flex flex-col items-center justify-center gap-2 py-8 px-4"
      >
        <p class="text-xs text-destructive/70">
          {{ error }}
        </p>
        <button class="text-xs text-primary hover:underline" @click="loadFiles">
          重试
        </button>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="!tree.length && !showNewFolderInput"
        class="flex flex-col items-center justify-center gap-2 py-8 px-4"
      >
        <FileText class="size-5 text-muted-foreground/30" />
        <p class="text-xs text-muted-foreground/50 text-center">
          暂无归档文件<br>
          可在编辑器中将文档拖到此处归档
        </p>
      </div>

      <!-- 新建文件夹输入框（根级） -->
      <div v-if="showNewFolderInput && !newFolderParent" class="px-1 py-1">
        <input
          v-model="newFolderName"
          class="w-full h-7 rounded-md border border-border bg-background px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          placeholder="文件夹名称"
          @keyup.enter="submitNewFolder"
          @keyup.escape="showNewFolderInput = false"
          @blur="submitNewFolder"
        >
      </div>

      <!-- 树状列表 -->
      <div
        v-if="tree.length"
        @dragover.prevent="handleDragOver($event, '')"
        @drop="handleDrop($event, '')"
      >
        <template v-for="node in tree" :key="node.relPath || node.href">
          <!-- 根级文件（无目录名的虚拟节点） -->
          <template v-for="file in node.files" :key="file.href">
            <div
              v-if="!node.name"
              class="group relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-[7px] text-[13px] leading-snug transition-all duration-150 ease-out hover:bg-accent/50 hover:text-foreground"
              draggable="true"
              @click="openFileInDir(file.filename, file.relDir)"
              @dragstart="handleDragStartFile($event, file)"
            >
              <FileText class="size-3.5 shrink-0 text-muted-foreground/50" />
              <span class="truncate flex-1 select-none">{{ file.title }}</span>
              <span class="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums mr-0.5">
                {{ (file.contentLength / 1024).toFixed(1) }}KB
              </span>
              <button
                class="invisible group-hover:visible inline-flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                title="删除文件"
                @click.stop="deleteFile(file)"
              >
                <Trash2 class="size-3" />
              </button>
            </div>
          </template>

          <!-- 目录节点 -->
          <div v-if="node.name" class="select-none">
            <!-- 目录行 -->
            <div
              class="group relative flex w-full cursor-pointer items-center gap-1 rounded-lg px-1 py-[7px] text-[13px] leading-snug transition-all duration-150 ease-out"
              :class="{
                'hover:bg-accent/50': !dragSource || dragOverDir !== node.relPath,
                'bg-accent/60 ring-1 ring-accent': dragOverDir === node.relPath,
              }"
              draggable="true"
              @click="toggleDir(node)"
              @dragstart="handleDragStartDir($event, node)"
              @dragover="handleDragOver($event, node.relPath)"
              @dragleave="handleDragLeave($event, node.relPath)"
              @drop="handleDrop($event, node.relPath)"
            >
              <ChevronRight
                class="size-3.5 shrink-0 text-muted-foreground/50 transition-transform"
                :class="{ 'rotate-90': expandedDirs.has(node.relPath) }"
              />
              <Cloud class="size-3.5 shrink-0 text-muted-foreground/60" />
              <span class="flex-1 truncate text-muted-foreground/80 group-hover:text-foreground transition-colors">{{ node.name }}</span>
              <span class="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums mr-1">{{ getDirFilesCount(node) }}</span>
              <button
                class="invisible group-hover:visible inline-flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                title="删除文件夹"
                @click.stop="deleteDir(node)"
              >
                <Trash2 class="size-3" />
              </button>
              <button
                class="invisible group-hover:visible inline-flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors shrink-0"
                title="新建子文件夹"
                @click.stop="startNewFolder(node.relPath)"
              >
                <FolderPlus class="size-3" />
              </button>
            </div>

            <!-- 新建文件夹输入框（子目录） -->
            <div v-if="showNewFolderInput && newFolderParent === node.relPath" class="ml-5 pr-1 py-1">
              <input
                v-model="newFolderName"
                class="w-full h-7 rounded-md border border-border bg-background px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                placeholder="文件夹名称"
                @keyup.enter="submitNewFolder"
                @keyup.escape="showNewFolderInput = false"
                @blur="submitNewFolder"
              >
            </div>

            <!-- 子内容 -->
            <div v-if="expandedDirs.has(node.relPath)" class="ml-4 border-l border-border/40 pl-1.5">
              <!-- 子文件 -->
              <template v-for="file in node.files" :key="file.href">
                <div
                  class="group relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-[7px] text-[13px] leading-snug transition-all duration-150 ease-out hover:bg-accent/50 hover:text-foreground"
                  draggable="true"
                  @click="openFileInDir(file.filename, file.relDir)"
                  @dragstart="handleDragStartFile($event, file)"
                >
                  <FileText class="size-3.5 shrink-0 text-muted-foreground/50" />
                  <span class="truncate flex-1 select-none">{{ file.title }}</span>
                  <span class="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums mr-0.5">
                    {{ (file.contentLength / 1024).toFixed(1) }}KB
                  </span>
                  <button
                    class="invisible group-hover:visible inline-flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                    title="删除文件"
                    @click.stop="deleteFile(file)"
                  >
                    <Trash2 class="size-3" />
                  </button>
                </div>
              </template>
              <!-- 递归子目录 -->
              <template v-for="child in node.children" :key="child.relPath">
                <div>
                  <div
                    class="group relative flex w-full cursor-pointer items-center gap-1 rounded-lg px-1 py-[7px] text-[13px] leading-snug transition-all duration-150 ease-out"
                    :class="{
                      'hover:bg-accent/50': !dragSource || dragOverDir !== child.relPath,
                      'bg-accent/60 ring-1 ring-accent': dragOverDir === child.relPath,
                    }"
                    draggable="true"
                    @click="toggleDir(child)"
                    @dragstart="handleDragStartDir($event, child)"
                    @dragover="handleDragOver($event, child.relPath)"
                    @dragleave="handleDragLeave($event, child.relPath)"
                    @drop="handleDrop($event, child.relPath)"
                  >
                    <ChevronRight
                      class="size-3.5 shrink-0 text-muted-foreground/50 transition-transform"
                      :class="{ 'rotate-90': expandedDirs.has(child.relPath) }"
                    />
                    <Cloud class="size-3.5 shrink-0 text-muted-foreground/60" />
                    <span class="flex-1 truncate text-muted-foreground/80 hover:text-foreground transition-colors">{{ child.name }}</span>
                    <span class="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums mr-1">{{ getDirFilesCount(child) }}</span>
                    <button
                      class="invisible group-hover:visible inline-flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                      title="删除文件夹"
                      @click.stop="deleteDir(child)"
                    >
                      <Trash2 class="size-3" />
                    </button>
                    <button
                      class="invisible group-hover:visible inline-flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors shrink-0"
                      title="新建子文件夹"
                      @click.stop="startNewFolder(child.relPath)"
                    >
                      <FolderPlus class="size-3" />
                    </button>
                  </div>

                  <!-- 嵌套展开：子目录下的文件 -->
                  <div v-if="expandedDirs.has(child.relPath)" class="ml-4 border-l border-border/40 pl-1.5">
                    <template v-for="subFile in child.files" :key="subFile.href">
                      <div
                        class="group relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-[7px] text-[13px] leading-snug transition-all duration-150 ease-out hover:bg-accent/50 hover:text-foreground"
                        draggable="true"
                        @click="openFileInDir(subFile.filename, subFile.relDir)"
                        @dragstart="handleDragStartFile($event, subFile)"
                      >
                        <FileText class="size-3.5 shrink-0 text-muted-foreground/50" />
                        <span class="truncate flex-1 select-none">{{ subFile.title }}</span>
                        <span class="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums mr-0.5">
                          {{ (subFile.contentLength / 1024).toFixed(1) }}KB
                        </span>
                        <button
                          class="invisible group-hover:visible inline-flex items-center justify-center size-5 rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                          title="删除文件"
                          @click.stop="deleteFile(subFile)"
                        >
                          <Trash2 class="size-3" />
                        </button>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>   <!-- v-for 结束 -->
      </div>           <!-- 树状列表容器结束 -->
    </div>            <!-- 内容区结束 -->
  </div>             <!-- 归档区外层结束 -->
</template>

<style scoped>
.thin-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.thin-scrollbar:hover {
  scrollbar-color: hsl(var(--border)) transparent;
}
</style>
