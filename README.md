# Markdown Editor（定制版）

基于 [doocs/md](https://github.com/doocs/md) 项目深度定制，合并了[PR # 1140](https://github.com/doocs/md/pull/1140),
并恢复了[gitee 图床](https://github.com/doocs/md/issues/1201)。

新增 WebDAV 文档存储与归档、Gitee 图床、配置导入导出加密等功能。

## 📂 WebDAV 文档同步

支持将编辑器文档数据保存到 WebDAV，实现多设备数据同步：

- **自动同步**：配置 WebDAV 后，文档和配置自动与云端双向同步
- **配置同步**：`config.json` 采用远端优先策略——远端有配置则拉取覆盖本地，远端为空则上传本地配置
- **多端共享**：浏览器 A 写完，浏览器 B 自动拉取最新数据

## 🗂️ WebDAV 归档管理

**该功能在 openlist webdav 上表现良好，坚果云等其它 webdav 服务请自行测试。**

侧边栏上下分栏，上半部分维持原有的内容管理，下半部分接入 WebDAV 归档目录，实现文档的归档。

### 上下分栏

- **拖拽分隔条**：按住分隔条上下拖动，可自由分配上下区域的比例
- **记忆**：分栏比例仅本次会话有效

### 归档操作

| 入口         | 说明                                                 |
| ------------ | ---------------------------------------------------- |
| **文档菜单** | 单篇文档菜单 → 归档到 WebDAV                         |
| **文件菜单** | 编辑器上方「文件」→ 导出到归档目录（当前编辑的文档） |

#### 归档目录说明

- 新建的文档归档时自动弹出归档文件夹选择窗口
- 从归档文件夹打开的文档再次归档会自动归档到原始文件夹

归档成功后：

- 文档自动从「内容管理」中删除（已归档）
- WebDAV 浏览器区域自动刷新，显示新文件

### WebDAV 归档浏览器

侧边栏下半部分是一个完整的 WebDAV 文件浏览器：

- **树形目录**：展开/折叠文件夹，实时显示 .md 文件列表
- **点击查看**：点击归档文件，内容加载到编辑器（同名文档覆盖内容，不同名新建）
- **拖拽支持**: 支持拖拽文件夹和文件到指定位置，方便调整归档整体结构
- **新建支持**：支持直接新建文件夹，并自动同步到 webdav

### 配置

在「文档存储」对话框中配置：

- **存储路径** — 文档同步目录
- **归档目录** — 指定 WebDAV 上的归档根目录
- 归档目录与存储路径相互独立，不冲突

## 🖼️ Gitee 图床

由于 Gitee 对图片存在防盗链限制，本项目通过 Go 服务端代理绕过：

- **上传流程**：前端 → Go 服务端 `/api/upload/gitee` → Gitee API v5
- **展示流程**：markdown 中存储原始 Gitee 链接，前端渲染时自动替换为本地代理地址 `/api/image/?url=...`
- **导出兼容**：markdown 源文本保存原始 Gitee URL，导出后可在 Typora、VS Code 等编辑器中正常显示

## 🔐 配置导出加密

编辑器配置导出为 JSON 时，敏感字段自动加密：

- **加密范围**：所有图床的 Token/密码/SecretKey、WebDAV 用户名密码、Telegram Bot Token 等
- **导入解密**：导入配置时自动解密，直接应用
- **安全说明**：密钥派生自应用内置盐值，防止明文泄露。能避免导出文件中直接暴露密码。

**适用场景**：将编辑器配置（图床、WebDAV、主题偏好）从浏览器 A 迁移到浏览器 B。

## 🛡️ CORS 代理

- `/api/proxy/?url=...` — WebDAV/COS 请求代理，解决前端跨域问题
- `/api/image/?url=...` — 图片代理，绕过防盗链

## 🚀 本地构建与部署

### 前置条件

- Docker

### 构建镜像

```sh
git clone https://github.com/JIANMOP/md.git
cd md

docker build \
  -f docker/latest/Dockerfile.standalone.local \
  -t md-standalone:latest \
  .

```

### 启动容器

```sh
docker run -d --name md -p 8888:80 md-standalone:latest
```

访问 `http://localhost:8888` 即可使用。

## 🔧 技术栈

- **前端**：Vue 3 + TypeScript + CodeMirror
- **后端**：Go（嵌入式静态文件服务器）
- **存储**：浏览器 localStorage + WebDAV / 腾讯云 COS
- **图床**：GitHub / Gitee（服务端代理）/ 阿里云 / 腾讯云 / 七牛云 / 又拍云 / MinIO / S3 / Cloudflare R2 / Cloudinary / Telegram / 公众号
- **加密**：Web Crypto API (AES-256-GCM + PBKDF2)
- **部署**：Docker 单镜像（standalone）
