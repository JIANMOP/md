/**
 * WebDAV 归档工具
 * 提供单个 .md 文件的导出、列出、读取、删除等操作
 * 与 documentStorage.ts 的 WebDAVDocumentEngine（操作 documents.json 打包文件）并行工作
 */

import { store } from './storage'

const BASE = import.meta.env.BASE_URL

/** WebDAV 配置（复用文档存储的 webdavDocConfig） */
interface WebDAVConfig {
  url: string
  username: string
  password: string
  path: string
  archivePath: string
}

/**
 * 通过本地服务端代理发送请求，解决跨域问题
 * 复用了 documentStorage.ts 中的 proxyFetch 逻辑
 */
async function proxyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin === window.location.origin) {
      return fetch(url, options)
    }
  }
  catch {
    return fetch(url, options)
  }

  const proxyURL = `${BASE}api/proxy/?url=${encodeURIComponent(url)}`
  const { method, headers, body } = options
  const proxyOptions: RequestInit = { method }
  if (headers)
    proxyOptions.headers = headers
  if (body)
    proxyOptions.body = body

  return fetch(proxyURL, proxyOptions)
}

/**
 * 获取 WebDAV 基础认证头
 */
function getAuthHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

/**
 * 加载 WebDAV 配置
 */
async function loadConfig(): Promise<WebDAVConfig | null> {
  const config = await store.getJSON<WebDAVConfig | null>(`webdavDocConfig`, null)
  if (!config || !config.url || !config.username || !config.password) {
    return null
  }
  return config
}

/**
 * 安全的文件名，避免特殊字符
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, `_`).trim() || `untitled`
}

/**
 * WebDAV 归档文件信息
 */
export interface ArchiveFileInfo {
  /** 纯文件名，如 "我的文章.md" */
  filename: string
  /** 完整 URL 路径 */
  href: string
  /** 文件大小（字节） */
  contentLength: number
  /** 最后修改时间 */
  lastModified: string
  /** 仅标题部分（不含 .md） */
  title: string
  /** 所属目录路径（相对归档根） */
  relDir: string
}

/** WebDAV 目录节点 */
export interface ArchiveDirNode {
  /** 目录名 */
  name: string
  /** 完整 WebDAV 路径 */
  href: string
  /** 相对归档根路径 */
  relPath: string
  /** 子文件 */
  files: ArchiveFileInfo[]
  /** 子目录 */
  children: ArchiveDirNode[]
}

/**
 * 检查归档目录是否已配置（需 WebDAV 地址和归档目录同时配置）
 */
export async function checkArchiveConfigured(): Promise<boolean> {
  const config = await loadConfig()
  if (!config) return false
  return !!config.archivePath?.trim()
}

/**
 * 获取归档目录路径
 */
export async function getArchivePath(): Promise<string> {
  const config = await loadConfig()
  if (config?.archivePath) return config.archivePath
  return `/`
}

/**
 * 导出 Markdown 内容到 WebDAV 归档目录的根目录（直接覆盖同名文件）
 * @param content - Markdown 内容
 * @param title - 文档标题（不含 .md）
 * @param _overwrite - 保留参数，始终覆盖
 * @returns 成功时返回文件 URL，失败时返回 null
 */
export async function exportToArchive(
  content: string,
  title: string,
  _overwrite: boolean = true,
): Promise<string | null> {
  const config = await loadConfig()
  if (!config) {
    console.error(`[WebDAV Archive] WebDAV 未配置`)
    return null
  }

  const safeName = sanitizeFilename(title)
  const filename = `${safeName}.md`
  const archivePath = config.archivePath || `/`

  // 确保归档目录路径以 / 结尾
  const dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  // 使用 URL 对象构建 + pathname 赋值，确保路径段被正确的 UTF-8 编码一次
  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${dir}${filename}`
  const fileUrl = urlObj.href
  const encodedContent = new TextEncoder().encode(content)

  // 直接覆盖写入
  const response = await proxyFetch(fileUrl, {
    method: `PUT`,
    headers: {
      'Authorization': getAuthHeader(config.username, config.password),
      'Content-Type': `text/markdown; charset=utf-8`,
    },
    body: encodedContent,
  })

  if (!response.ok) {
    throw new Error(`WebDAV PUT 失败: ${response.status} ${response.statusText}`)
  }

  return fileUrl
}

/**
 * 导出 Markdown 内容到 WebDAV 归档目录的指定子目录
 * @param content - Markdown 内容
 * @param title - 文档标题（不含 .md）
 * @param relDir - 相对于归档根的目录路径（如 "folder/sub" 或 "" 表示根）
 * @returns 成功时返回文件 URL，失败时返回 null
 */
export async function exportToArchiveDir(
  content: string,
  title: string,
  relDir: string,
): Promise<string | null> {
  const config = await loadConfig()
  if (!config) {
    console.error(`[WebDAV Archive] WebDAV 未配置`)
    return null
  }

  const safeName = sanitizeFilename(title)
  const filename = `${safeName}.md`
  const archivePath = config.archivePath || `/`

  // 构建完整目录路径：归档根 + 子目录
  let dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  if (relDir) {
    const cleanDir = relDir.replace(/^\/+|\/+$/g, ``)
    if (cleanDir) dir = `${dir}${cleanDir}/`
  }

  // 使用 URL 对象构建
  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${dir}${filename}`
  const fileUrl = urlObj.href
  const encodedContent = new TextEncoder().encode(content)

  // 直接覆盖写入
  const response = await proxyFetch(fileUrl, {
    method: `PUT`,
    headers: {
      'Authorization': getAuthHeader(config.username, config.password),
      'Content-Type': `text/markdown; charset=utf-8`,
    },
    body: encodedContent,
  })

  if (!response.ok) {
    throw new Error(`WebDAV PUT 失败: ${response.status} ${response.statusText}`)
  }

  return fileUrl
}

/**
 * 列出归档目录中的 .md 文件（单层，用于根目录列表）
 */
export async function listArchiveFiles(): Promise<ArchiveFileInfo[]> {
  const tree = await listArchiveTree()
  return tree.flatMap(node => node.files)
}

/**
 * 列出归档目录的完整树状结构
 */
export async function listArchiveTree(): Promise<ArchiveDirNode[]> {
  const config = await loadConfig()
  if (!config) {
    console.error(`[WebDAV Archive] WebDAV 未配置`)
    return []
  }

  const archivePath = config.archivePath || `/`
  const dirUrl = archivePath.endsWith(`/`) ? archivePath.slice(0, -1) : archivePath
  const url = `${config.url}${dirUrl}`

  try {
    const response = await proxyFetch(url, {
      method: `PROPFIND`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
        'Depth': `infinity`,
        'Content-Type': `application/xml`,
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <displayname/>
    <getcontentlength/>
    <getlastmodified/>
    <resourcetype/>
  </prop>
</propfind>`,
    })

    if (!response.ok) {
      await createArchiveDir(config)
      return []
    }

    const text = await response.text()
    return parsePropfindTree(text, config)
  }
  catch (error) {
    console.error(`[WebDAV Archive] 列出文件失败:`, error)
    return []
  }
}

/**
 * 如果归档目录不存在，尝试创建
 */
async function createArchiveDir(config: WebDAVConfig): Promise<void> {
  const archivePath = config.archivePath || `/`
  const url = `${config.url}${archivePath}`

  try {
    await proxyFetch(url, {
      method: `MKCOL`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
      },
    })
  }
  catch {
    // 目录可能已存在，忽略错误
  }
}

/**
 * 在归档目录下新建子文件夹
 * @param relDir - 相对于归档根的目录路径
 */
export async function createArchiveSubDir(relDir: string): Promise<boolean> {
  const config = await loadConfig()
  if (!config) return false

  const archivePath = config.archivePath || `/`
  const dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  const cleanDir = relDir.replace(/^\/+|\/+$/g, ``)
  const fullDir = `${dir}${cleanDir}/`

  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${fullDir}`
  const url = urlObj.href

  try {
    const response = await proxyFetch(url, {
      method: `MKCOL`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
      },
    })
    // 部分 WebDAV 服务器返回 201 Created 或 204 No Content
    // 也有返回 405 Method Not Allowed（目录已存在），都算成功
    return response.ok || response.status === 405
  }
  catch {
    return false
  }
}

/**
 * 解析 PROPFIND 响应为树状结构
 *
 * 检测流程（按优先级）：
 * 1. resourcetype 包含 collection → 目录
 * 2. href 以 / 结尾且没有 .md 扩展名 → 目录（fallback）
 * 3. 其余 → 文件（仅保留 .md 文件）
 */
function parsePropfindTree(xml: string, config: WebDAVConfig): ArchiveDirNode[] {
  const archivePath = config.archivePath || `/`
  const archiveNormalized = archivePath.replace(/\/+$/, ``)

  // 解析所有响应块
  const responseRegex = /<(?:[a-zA-Z]+:)?response>([\s\S]*?)<\/(?:[a-zA-Z]+:)?response>/gi
  let match
  const items: { href: string; isDir: boolean; contentLength: number; lastModified: string }[] = []

  while (true) {
    match = responseRegex.exec(xml)
    if (!match) break
    const block = match[1]

    // 提取 href
    const hrefMatch = /<(?:[a-zA-Z]+:)?href>([\s\S]*?)<\/(?:[a-zA-Z]+:)?href>/i.exec(block)
    if (!hrefMatch) continue
    const rawHref = hrefMatch[1].trim()
    let href: string
    try {
      href = decodeURIComponent(rawHref)
    }
    catch {
      href = rawHref
    }

    // ─── 跳过归档目录自身 ───
    // 从 href 中提取 archiveNormalized 之后的部分（如果有的话）
    // 如果没有任何内容跟在 archiveNormalized 后面 → 根目录自身
    const hrefTrimmed = href.replace(/\/+$/, ``)
    const selfIdx = hrefTrimmed.indexOf(archiveNormalized)
    if (selfIdx !== -1) {
      const after = hrefTrimmed.slice(selfIdx + archiveNormalized.length).replace(/^\/+|\/+$/g, ``)
      if (!after) {
        // 根目录自身，跳过
        continue
      }
    }
    else {
      // archiveNormalized 不在 href 中 → 不可识别的条目，跳过
      console.warn(`[WebDAV Archive] href 不包含 archivePath:`, href, archiveNormalized)
      continue
    }

    // ─── 区分目录/文件（三重检测） ───
    // 1. resourcetype 检测
    const rtBlock = /<(?:[a-zA-Z]+:)?resourcetype>([\s\S]*?)<\/(?:[a-zA-Z]+:)?resourcetype>/i.exec(block)
    let isCollectionByRT = false
    if (rtBlock) {
      isCollectionByRT = /<(?:[a-zA-Z]+:)?collection\s*\/?>/i.test(rtBlock[1])
    }

    // 2. href 结尾检测（备用）
    const isCollectionBySlash = href.endsWith(`/`)

    // 3. 文件名后缀检测（排除文件）
    const filename = href.split(`/`).filter(Boolean).pop() || ``
    const isFileByExt = filename.endsWith(`.md`)

    const isDir = isCollectionByRT || (isCollectionBySlash && !isFileByExt)

    // 如果不是目录也不是 .md 文件，跳过
    if (!isDir && !isFileByExt) continue

    // 提取大小
    const sizeMatch = /<(?:[a-zA-Z]+:)?getcontentlength>([\s\S]*?)<\/(?:[a-zA-Z]+:)?getcontentlength>/i.exec(block)
    const contentLength = sizeMatch ? parseInt(sizeMatch[1].trim(), 10) || 0 : 0

    // 提取修改时间
    const modifiedMatch = /<(?:[a-zA-Z]+:)?getlastmodified>([\s\S]*?)<\/(?:[a-zA-Z]+:)?getlastmodified>/i.exec(block)
    const lastModified = modifiedMatch ? modifiedMatch[1].trim() : ``

    items.push({ href, isDir, contentLength, lastModified })
  }

  if (items.length === 0) {
    console.warn(`[WebDAV Archive] PROPFIND 返回 0 个条目`)
    return []
  }

  // ─── 提取相对路径 ───
  function getRelPath(href: string): string | null {
    const h = href.replace(/\/+$/, ``)
    const idx = h.indexOf(archiveNormalized)
    if (idx === -1) return null
    let rel = h.slice(idx + archiveNormalized.length)
    rel = rel.replace(/^\/+|\/+$/g, ``)
    return rel || null
  }

  // ─── 构建树 ───
  const rootNodes: ArchiveDirNode[] = []
  const dirMap = new Map<string, ArchiveDirNode>()

  // 先处理目录
  for (const item of items) {
    if (!item.isDir) continue
    const relPath = getRelPath(item.href)
    if (!relPath) continue

    const name = relPath.split(`/`).pop() || relPath
    const node: ArchiveDirNode = {
      name,
      href: item.href,
      relPath,
      files: [],
      children: [],
    }
    dirMap.set(relPath, node)
  }

  // 建立父子关系
  for (const [relPath, node] of dirMap) {
    const parentRelPath = relPath.split(`/`).slice(0, -1).join(`/`)
    if (parentRelPath && dirMap.has(parentRelPath)) {
      dirMap.get(parentRelPath)!.children.push(node)
    }
    else {
      rootNodes.push(node)
    }
  }

  // 处理文件
  for (const item of items) {
    if (item.isDir) continue

    const relPath = getRelPath(item.href)
    if (!relPath) continue

    const parts = relPath.split(`/`)
    const filename = parts.pop() || ``
    const parentRelPath = parts.join(`/`)
    const title = filename.endsWith(`.md`) ? filename.slice(0, -3) : filename

    const fileInfo: ArchiveFileInfo = {
      filename,
      href: item.href,
      contentLength: item.contentLength,
      lastModified: item.lastModified,
      title,
      relDir: parentRelPath,
    }

    if (parentRelPath && dirMap.has(parentRelPath)) {
      dirMap.get(parentRelPath)!.files.push(fileInfo)
    }
    else if (!parentRelPath) {
      rootNodes.push({
        name: ``,
        href: item.href,
        relPath: ``,
        files: [fileInfo],
        children: [],
      })
    }
  }

  // 文件排序（最新的在前）
  function sortNode(node: ArchiveDirNode) {
    node.files.sort((a, b) => {
      if (a.lastModified && b.lastModified) {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      }
      return 0
    })
    node.children.forEach(sortNode)
  }
  rootNodes.forEach(sortNode)

  return rootNodes
}

/**
 * 读取归档文件内容
 */
export async function readArchiveFile(filename: string): Promise<string | null> {
  const config = await loadConfig()
  if (!config)
    return null

  const archivePath = config.archivePath || `/`
  const dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${dir}${filename}`
  const url = urlObj.href

  try {
    const response = await proxyFetch(url, {
      method: `GET`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
      },
    })

    if (!response.ok) {
      console.error(`[WebDAV Archive] 读取失败:`, response.status, response.statusText)
      return null
    }

    return await response.text()
  }
  catch (error) {
    console.error(`[WebDAV Archive] 读取失败:`, error)
    return null
  }
}

/**
 * 读取归档文件内容（指定子目录）
 */
export async function readArchiveFileInDir(filename: string, relDir: string): Promise<string | null> {
  const config = await loadConfig()
  if (!config) return null

  const archivePath = config.archivePath || `/`
  let dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  if (relDir) {
    const cleanDir = relDir.replace(/^\/+|\/+$/g, ``)
    if (cleanDir) dir = `${dir}${cleanDir}/`
  }

  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${dir}${filename}`
  const url = urlObj.href

  try {
    const response = await proxyFetch(url, {
      method: `GET`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
      },
    })
    if (!response.ok) return null
    return await response.text()
  }
  catch {
    return null
  }
}

/**
 * 删除归档文件
 */
export async function deleteArchiveFile(filename: string): Promise<boolean> {
  const config = await loadConfig()
  if (!config)
    return false

  const archivePath = config.archivePath || `/`
  const dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${dir}${filename}`
  const url = urlObj.href

  try {
    const response = await proxyFetch(url, {
      method: `DELETE`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
      },
    })
    return response.ok
  }
  catch (error) {
    console.error(`[WebDAV Archive] 删除失败:`, error)
    return false
  }
}

/**
 * 删除归档文件（指定子目录）
 */
export async function deleteArchiveFileInDir(filename: string, relDir: string): Promise<boolean> {
  const config = await loadConfig()
  if (!config) return false

  const archivePath = config.archivePath || `/`
  let dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  if (relDir) {
    const cleanDir = relDir.replace(/^\/+|\/+$/g, ``)
    if (cleanDir) dir = `${dir}${cleanDir}/`
  }

  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${dir}${filename}`
  const url = urlObj.href

  try {
    const response = await proxyFetch(url, {
      method: `DELETE`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
      },
    })
    return response.ok
  }
  catch {
    return false
  }
}

/**
 * 删除归档目录（递归删除文件夹及其所有内容）
 * @param relDir - 相对于归档根的目录路径
 */
export async function deleteArchiveDir(relDir: string): Promise<boolean> {
  const config = await loadConfig()
  if (!config) return false

  const archivePath = config.archivePath || `/`
  let dir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  const cleanDir = relDir.replace(/^\/+|\/+$/g, ``)
  if (cleanDir) dir = `${dir}${cleanDir}/`

  const urlObj = new URL(config.url)
  urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${dir}`
  const url = urlObj.href

  try {
    const response = await proxyFetch(url, {
      method: `DELETE`,
      headers: {
        'Authorization': getAuthHeader(config.username, config.password),
      },
    })
    return response.ok
  }
  catch (error) {
    console.error(`[WebDAV Archive] 删除目录失败:`, error)
    return false
  }
}

/**
 * 移动/重命名归档中的文件或文件夹
 * 由于 OpenList 的 WebDAV 不支持 COPY/MOVE 方法，使用 GET+PUT+DELETE 实现
 * @param relFrom - 当前相对路径（如 "sub/file.md" 或 "old-folder"）
 * @param relTo - 目标相对路径（如 "new-folder/file.md" 或 "parent/new-folder"）
 */
export async function moveArchiveItem(relFrom: string, relTo: string): Promise<boolean> {
  const config = await loadConfig()
  if (!config) return false

  const archivePath = config.archivePath || `/`
  const baseDir = archivePath.endsWith(`/`) ? archivePath : `${archivePath}/`
  const authHeader = getAuthHeader(config.username, config.password)
  const urlBase = config.url

  const cleanFrom = relFrom.replace(/^\/+|\/+$/g, ``)
  const cleanTo = relTo.replace(/^\/+|\/+$/g, ``)

  function buildUrl(rel: string): string {
    const urlObj = new URL(urlBase)
    urlObj.pathname = `${urlObj.pathname.replace(/\/$/, ``)}${baseDir}${rel}`
    return urlObj.href
  }

  const fromUrl = buildUrl(cleanFrom)

  // 判断是文件还是目录：从文件名看是否以 .md 结尾
  const isFile = cleanFrom.endsWith(`.md`)

  try {
    if (isFile) {
      // ── 文件：GET 内容 → PUT 到目标 → DELETE 源 ──
      return await moveFile(
        fromUrl,
        buildUrl(cleanTo),
        authHeader,
      )
    }
    else {
      // ── 目录：PROPFIND 递归获取所有条目 → 逐个 GET+PUT → DELETE 源 ──
      return await moveDir(
        fromUrl,
        cleanFrom,
        cleanTo,
        authHeader,
        buildUrl,
      )
    }
  }
  catch (error) {
    console.error(`[WebDAV Archive] 移动失败:`, error)
    return false
  }
}

/** 移动单个文件（GET + PUT + DELETE） */
async function moveFile(
  fromUrl: string,
  toUrl: string,
  authHeader: string,
): Promise<boolean> {
  // GET 源文件内容
  const getResp = await proxyFetch(fromUrl, {
    method: `GET`,
    headers: { 'Authorization': authHeader },
  })
  if (!getResp.ok) {
    console.error(`[WebDAV Archive] 移动: GET 源文件失败 ${getResp.status}`)
    return false
  }

  const content = await getResp.text()

  // PUT 到目标
  const putResp = await proxyFetch(toUrl, {
    method: `PUT`,
    headers: {
      'Authorization': authHeader,
      'Content-Type': `text/markdown; charset=utf-8`,
    },
    body: new TextEncoder().encode(content),
  })
  if (!putResp.ok) {
    console.error(`[WebDAV Archive] 移动: PUT 到目标失败 ${putResp.status}`)
    return false
  }

  // DELETE 源
  const delResp = await proxyFetch(fromUrl, {
    method: `DELETE`,
    headers: { 'Authorization': authHeader },
  })
  if (!delResp.ok && delResp.status !== 404) {
    console.warn(`[WebDAV Archive] 移动: PUT 成功但 DELETE 源失败 ${delResp.status}`)
  }

  return true
}

/** 移动目录：PROPFIND 列出所有文件 → 逐个移动 → DELETE 源目录 */
async function moveDir(
  fromUrl: string,
  cleanFrom: string,
  cleanTo: string,
  authHeader: string,
  buildFn: (rel: string) => string,
): Promise<boolean> {
  // 使用 listArchiveTree 获取完整文件树，然后筛选出源目录下的文件
  const tree = await listArchiveTree()
  if (tree.length === 0) {
    console.warn(`[WebDAV Archive] 移动目录: 文件列表为空`)
    return false
  }

  // 递归查找源目录节点
  function findNode(nodes: ArchiveDirNode[], relPath: string): ArchiveDirNode | null {
    for (const node of nodes) {
      if (node.relPath === relPath) return node
      if (node.children.length) {
        const found = findNode(node.children, relPath)
        if (found) return found
      }
    }
    return null
  }

  const srcNode = findNode(tree, cleanFrom)
  if (!srcNode) {
    console.error(`[WebDAV Archive] 移动目录: 未找到源目录 "${cleanFrom}"`)
    return false
  }

  // 收集该目录下所有文件（递归所有子目录）
  function collectFiles(node: ArchiveDirNode): { relDir: string; filename: string }[] {
    const files: { relDir: string; filename: string }[] = []
    for (const f of node.files) {
      files.push({ relDir: f.relDir, filename: f.filename })
    }
    for (const child of node.children) {
      files.push(...collectFiles(child))
    }
    return files
  }

  const allFiles = collectFiles(srcNode)
  if (allFiles.length === 0) {
    // 空目录 → 在目标位置创建同名目录
    const targetDirUrl = buildFn(cleanTo)
    await proxyFetch(targetDirUrl, {
      method: `MKCOL`,
      headers: { 'Authorization': authHeader },
    })
    console.warn(`[WebDAV Archive] 移动目录: 源目录 "${cleanFrom}" 下无文件，已在目标创建`)
    // 无论 MKCOL 成败（可能已存在），都 DELETE 源目录完成移动
    const delResp = await proxyFetch(fromUrl, {
      method: `DELETE`,
      headers: { 'Authorization': authHeader },
    })
    return delResp.ok || delResp.status === 404
  }

  // 逐个移动文件
  for (const file of allFiles) {
    // 源：cleanFrom / relDir / filename
    // 目标：cleanTo / relDir / filename
    const relSuffix = file.relDir ? `${file.relDir}/${file.filename}` : file.filename
    const srcUrl = buildFn(`${cleanFrom}/${relSuffix}`)
    const dstUrl = buildFn(`${cleanTo}/${relSuffix}`)

    const ok = await moveFile(srcUrl, dstUrl, authHeader)
    if (!ok) {
      console.error(`[WebDAV Archive] 移动目录: 文件 ${file.filename} 移动失败`)
      return false
    }
  }

  // 所有文件移动成功后，DELETE 源目录（含所有空子目录）
  const delResp = await proxyFetch(fromUrl, {
    method: `DELETE`,
    headers: { 'Authorization': authHeader },
  })
  if (!delResp.ok && delResp.status !== 404) {
    console.warn(`[WebDAV Archive] 移动目录: 文件移动成功但 DELETE 源目录失败 ${delResp.status}`)
  }

  return true
}
