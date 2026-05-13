import type { Post } from '@/types/post'
import type { DocumentData } from '@/utils/documentStorage'
import { v4 as uuidv4 } from 'uuid'
import DEFAULT_CONTENT from '@/assets/example/markdown.md?raw'
import { documentStorage } from '@/utils/documentStorage'

export type { Post } from '@/types/post'

/**
 * 文章管理 Store
 * 负责管理文章列表、当前文章、文章 CRUD 操作
 */
export const usePostStore = defineStore(`post`, () => {
  // 内容列表 - 使用 ref，通过 documentStorage 持久化
  const posts = ref<Post[]>([
    {
      id: uuidv4(),
      title: `内容1`,
      content: DEFAULT_CONTENT,
      history: [
        { datetime: new Date().toLocaleString(`zh-cn`), content: DEFAULT_CONTENT },
      ],
      createDatetime: new Date(),
      updateDatetime: new Date(),
    },
  ])

  // 当前文章 ID
  const currentPostId = ref<string>(``)

  // 加载状态
  const isLoaded = ref(false)
  const isLoading = ref(false)

  // 保存到存储
  const saveToStorage = async () => {
    // 只有在数据加载完成后才保存，避免覆盖云端数据
    if (!isLoaded.value) {
      return
    }

    try {
      await documentStorage.saveDocuments(posts.value as DocumentData[])
      await documentStorage.saveCurrentDocumentId(currentPostId.value)
    }
    catch (error) {
      console.error(`Failed to save to storage:`, error)
    }
  }

  // 从存储加载数据
  const loadFromStorage = async () => {
    // 避免重复加载
    if (isLoaded.value || isLoading.value) {
      return
    }

    isLoading.value = true

    try {
      await documentStorage.init()

      const storedDocuments = await documentStorage.getDocuments()
      const storedCurrentId = await documentStorage.getCurrentDocumentId()

      if (storedDocuments && storedDocuments.length > 0) {
        posts.value = storedDocuments.map((doc: DocumentData, index: number) => {
          const now = Date.now()
          return {
            ...doc,
            id: doc.id ?? uuidv4(),
            createDatetime: doc.createDatetime ? new Date(doc.createDatetime) : new Date(now + index),
            updateDatetime: doc.updateDatetime ? new Date(doc.updateDatetime) : new Date(now + index),
          }
        })

        if (storedCurrentId && posts.value.some(p => p.id === storedCurrentId)) {
          currentPostId.value = storedCurrentId
        }
        else {
          currentPostId.value = posts.value[0]?.id ?? ``
        }
      }
      else {
        // 首次使用，使用默认数据
        currentPostId.value = posts.value[0]?.id ?? ``
        await saveToStorage()
      }

      isLoaded.value = true
    }
    catch (error) {
      console.error(`Failed to load from storage:`, error)
      // 加载失败，使用默认数据
      currentPostId.value = posts.value[0]?.id ?? ``
      isLoaded.value = true
    }
    finally {
      isLoading.value = false
    }
  }

  // 监听数据变化，自动保存
  watch(posts, () => {
    saveToStorage()
  }, { deep: true })

  watch(currentPostId, () => {
    saveToStorage()
  })

  // 根据 id 找索引
  const findIndexById = (id: string) => posts.value.findIndex(p => p.id === id)

  // computed: 让旧代码还能用 index，但底层映射 id
  const currentPostIndex = computed<number>({
    get: () => findIndexById(currentPostId.value),
    set: (idx) => {
      if (idx >= 0 && idx < posts.value.length) {
        currentPostId.value = posts.value[idx].id
      }
    },
  })

  // 获取 Post
  const getPostById = (id: string) => posts.value.find(p => p.id === id)

  // 获取当前文章
  const currentPost = computed(() => getPostById(currentPostId.value))

  // 添加文章
  const addPost = (title: string, parentId: string | null = null) => {
    const newPost: Post = {
      id: uuidv4(),
      title,
      content: `# ${title}`,
      history: [
        { datetime: new Date().toLocaleString(`zh-cn`), content: `# ${title}` },
      ],
      createDatetime: new Date(),
      updateDatetime: new Date(),
      parentId,
    }
    posts.value.push(newPost)
    currentPostId.value = newPost.id
  }

  // 重命名文章
  const renamePost = (id: string, title: string) => {
    const post = getPostById(id)
    if (post) {
      post.title = title
      post.updateDatetime = new Date()
    }
  }

  // 删除文章
  const delPost = (id: string, recursive: boolean = false) => {
    const post = getPostById(id)
    if (!post)
      return

    if (recursive) {
      const getChildIds = (parentId: string): string[] => {
        const children = posts.value.filter(p => p.parentId === parentId)
        return children.reduce((acc, child) => {
          return acc.concat(child.id, getChildIds(child.id))
        }, [] as string[])
      }

      const allIdsToDelete = [id, ...getChildIds(id)]
      allIdsToDelete.forEach((toDelId) => {
        const idx = findIndexById(toDelId)
        if (idx !== -1) {
          posts.value.splice(idx, 1)
        }
      })

      if (!posts.value.some(p => p.id === currentPostId.value)) {
        currentPostId.value = posts.value[Math.max(0, posts.value.length - 1)]?.id ?? ``
      }
      return
    }

    // 子内容挂靠到父级的父级
    const newParentId = post.parentId ?? null
    posts.value.forEach((p) => {
      if (p.parentId === id) {
        p.parentId = newParentId
        p.updateDatetime = new Date()
      }
    })

    const idx = findIndexById(id)
    if (idx === -1)
      return

    posts.value.splice(idx, 1)
    currentPostId.value = posts.value[Math.min(idx, posts.value.length - 1)]?.id ?? ``
  }

  // 更新文章父 ID
  const updatePostParentId = (postId: string, parentId: string | null) => {
    const post = getPostById(postId)
    if (post) {
      post.parentId = parentId
      post.updateDatetime = new Date()
    }
  }

  // 更新文章内容
  const updatePostContent = (id: string, content: string) => {
    const post = getPostById(id)
    if (post) {
      post.content = content
      post.updateDatetime = new Date()
    }
  }

  // 收起所有文章
  const collapseAllPosts = () => {
    posts.value.forEach((post) => {
      post.collapsed = true
    })
  }

  // 展开所有文章
  const expandAllPosts = () => {
    posts.value.forEach((post) => {
      post.collapsed = false
    })
  }

  return {
    // State
    posts,
    currentPostId,
    currentPostIndex,
    currentPost,
    isLoaded,
    isLoading,

    // Getters
    getPostById,
    findIndexById,
    // Actions
    addPost,
    renamePost,
    delPost,
    updatePostParentId,
    updatePostContent,
    collapseAllPosts,
    expandAllPosts,

    // Storage
    loadFromStorage,
    saveToStorage,
  }
})
