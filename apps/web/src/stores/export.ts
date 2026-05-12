import { toPng } from 'html-to-image'
import {
  downloadFile,
  downloadMD,
  exportHTML,
  exportPDF,
  exportPureHTML,
  getHtmlContent,
  sanitizeTitle,
} from '@/utils'
import { usePostStore } from './post'
import { useRenderStore } from './render'
import { useUIStore } from './ui'
import { exportToArchiveDir } from '@/utils/webdavArchive'
import { toast } from 'vue-sonner'

/**
 * 导出功能 Store
 * 负责处理各种导出功能：HTML、PDF、MD、图片等
 */
export const useExportStore = defineStore(`export`, () => {
  const postStore = usePostStore()
  const renderStore = useRenderStore()
  const uiStore = useUIStore()

  // 将编辑器内容转换为 HTML
  const editorContent2HTML = () => {
    const temp = getHtmlContent()
    document.querySelector(`#output`)!.innerHTML = renderStore.output
    return temp
  }

  // 导出编辑器内容为 HTML，并且下载到本地
  const exportEditorContent2HTML = async () => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    await exportHTML(currentPost.title)
    document.querySelector(`#output`)!.innerHTML = renderStore.output
  }

  // 导出编辑器内容为无样式 HTML
  const exportEditorContent2PureHTML = (content: string) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    exportPureHTML(content, currentPost.title)
  }

  // 下载卡片图片
  const downloadAsCardImage = async () => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    const el = document.querySelector<HTMLElement>(`#output-wrapper>.preview`)
    if (!el)
      return

    // 添加临时样式：禁用代码块滚动，启用换行
    const style = document.createElement('style')
    style.textContent = `
      .preview pre.code__pre,
      .preview .hljs.code__pre,
      .preview pre.code__pre > code,
      .preview .hljs.code__pre > code,
      .preview .code-scroll,
      .preview pre section,
      .preview code section {
        overflow: visible !important;
      }
      .preview pre.code__pre > code,
      .preview .code-scroll,
      .preview .code-scroll > div {
        white-space: pre-wrap !important;
        word-break: break-all !important;
        min-width: auto !important;
      }
    `
    document.head.appendChild(style)

    try {
      await new Promise(resolve => setTimeout(resolve, 100))
      const url = await toPng(el, {
        backgroundColor: uiStore.isDark ? `` : `#fff`,
        skipFonts: true,
        pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        style: { margin: `0` },
      })
      downloadFile(url, `${sanitizeTitle(currentPost.title)}.png`, `image/png`)
    }
    finally {
      style.remove()
    }
  }

  // 导出编辑器内容为 PDF
  const exportEditorContent2PDF = async () => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    await exportPDF(currentPost.title)
    document.querySelector(`#output`)!.innerHTML = renderStore.output
  }

  // 导出编辑器内容到本地（Markdown）
  const exportEditorContent2MD = (content: string) => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    downloadMD(content, currentPost.title)
  }

  // 导出编辑器内容到 WebDAV 归档目录
  const exportEditorContent2Archive = async () => {
    const currentPost = postStore.currentPost
    if (!currentPost)
      return

    try {
      const { store } = await import('@/utils/storage')
      const targetDir = (await store.get('lastArchiveDir')) || ''
      const result = await exportToArchiveDir(currentPost.content, currentPost.title, targetDir)
      if (result) {
        const dirLabel = targetDir ? `「${targetDir}」` : `归档根目录`
        toast.success(`已归档到 ${dirLabel}`)
        // 触发归档完成事件，让 index.vue 刷新侧边栏并删除
        window.dispatchEvent(new CustomEvent('archive-completed', {
          detail: { title: currentPost.title },
        }))
      }
      else {
        toast.error(`归档失败：WebDAV 未配置`)
      }
    }
    catch (error: any) {
      toast.error(`归档失败：${error.message}`)
    }
  }

  return {
    editorContent2HTML,
    exportEditorContent2HTML,
    exportEditorContent2PureHTML,
    downloadAsCardImage,
    exportEditorContent2PDF,
    exportEditorContent2MD,
    exportEditorContent2Archive,
  }
})

/**
 * 解析编辑器内容中的图片链接
 */
