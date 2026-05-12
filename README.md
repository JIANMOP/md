# Markdown Editor（定制版）

基于 [doocs/md](https://github.com/doocs/md) 项目深度定制，新增 WebDAV 文档存储与归档、Gitee 图床、配置导入导出加密等企业级功能。

## 🗂️ WebDAV 归档管理（核心新功能）

侧边栏上下分栏，上半部分维持原有的内容管理，下半部分接入 WebDAV 归档目录，实现文档的归档与回溯工作流。

### 上下分栏

- **拖拽分隔条**：按住分隔条上下拖动，可自由分配上下区域的比例
- **记忆**：分栏比例仅本次会话有效

### 归档操作

| 入口 | 说明 |
|------|------|
| **文档右键菜单** | 单篇文档右键 → 归档到 WebDAV |
| **文件菜单** | 编辑器上方「文件」→ 导出到归档目录（当前编辑的文档） |
| **拖拽归档** | 从内容管理区域直接将文档拖拽到下方 WebDAV 浏览器区域，松开即可归档 |

归档成功后：
- 文档自动从「内容管理」中删除（已归档）
- WebDAV 浏览器区域自动刷新，显示新文件
- 归档目标目录跟随当前 WebDAV 浏览器的浏览位置（即点进哪个子目录就归到哪个子目录）

### WebDAV 归档浏览器

侧边栏下半部分是一个完整的 WebDAV 文件浏览器：

- **树形目录**：展开/折叠文件夹，实时显示 .md 文件列表
- **点击查看**：点击归档文件，内容加载到编辑器（同名文档覆盖内容，不同名新建）
- **拖拽编辑**：从归档区域将文件拖到上半部分的内容管理区，自动加载到编辑器
- **右键菜单**：重命名、删除归档文件

### 配置

在「文档存储」对话框中配置：

- **存储路径** — 文档同步目录（与之前一致）
- **归档目录** — 新增字段，指定 WebDAV 上的归档根目录（如 `/markdown`）
- 归档目录与存储路径相互独立，不冲突

## 📂 WebDAV 文档同步

支持将编辑器文档数据保存到 WebDAV，实现多设备数据同步：

- **自动同步**：配置 WebDAV 后，文档和配置自动与云端双向同步
- **配置同步**：`config.json` 采用远端优先策略——远端有配置则拉取覆盖本地，远端为空则上传本地配置
- **多端共享**：浏览器 A 写完，浏览器 B 自动拉取最新数据
- **配置轻量化**：`config.json` 仅存储 UI/主题/编辑器偏好，不包含账号密码和图床 Token

## 🖼️ Gitee 图床

由于 Gitee 对图片存在防盗链限制，本项目通过 Go 服务端代理绕过：

- **上传流程**：前端 → Go 服务端 `/api/upload/gitee` → Gitee API v5
- **展示流程**：markdown 中存储原始 Gitee 链接，前端渲染时自动替换为本地代理地址 `/api/image/?url=...`
- **导出兼容**：markdown 源文本保存原始 Gitee URL，导出后可在 Typora、VS Code 等编辑器中正常显示

**配置方法：**

1. 前往 [Gitee 个人访问令牌](https://gitee.com/profile/personal_access_tokens) 创建 Token
2. 打开编辑器 → 图床设置 → 选择 **Gitee**
3. 填写 `gitee.com/用户名/仓库`、分支（默认 master）、Token
4. 上传图片即可自动存入 Gitee 仓库

## 🔐 配置导出加密

编辑器配置导出为 JSON 时，敏感字段自动加密：

- **加密算法**：AES-256-GCM + PBKDF2（Web Crypto API）
- **加密范围**：所有图床的 Token/密码/SecretKey、WebDAV 用户名密码、Telegram Bot Token 等
- **导入解密**：导入配置时自动解密，直接应用
- **安全说明**：密钥派生自应用内置盐值，防止明文泄露。这不是军用级加密，但能避免 config.json 或导出文件中直接暴露密码

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
