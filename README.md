# Markdown Editor（定制版）

基于 [doocs/md](https://github.com/doocs/md) 项目，合并了 [PR #1140](https://github.com/doocs/md/pull/1140) 的 WebDAV 文档存储配置同步功能，并新增了 Gitee 图床支持（通过服务端代理绕过防盗链）。

## ✨ 新增功能

### 📁 WebDAV 云存储同步（PR #1140）

支持将文档数据保存到 WebDAV 或腾讯云 COS，实现多设备间数据同步：

- **自动同步**：可选择将编辑器数据（文档、设置）存储到云端
- **配置持久化**：通过 `文档存储` 对话框配置 WebDAV 地址、用户名、密码
- **多端共享**：在浏览器 A 写完文档，浏览器 B 自动拉取最新数据
- **安全优先**：保存配置时优先从云端拉取数据，云端为空时才推送本地数据，避免覆盖已有配置

### 🖼️ Gitee 图床

由于 Gitee 对图片存在防盗链限制（参见 [issue #1201](https://github.com/doocs/md/issues/1201)），本项目通过 Go 服务端代理绕过了此限制：

- **上传流程**：前端 → Go 服务端 `/api/upload/gitee` → Gitee API v5
- **展示流程**：markdown 中存储原始 Gitee 链接，前端渲染时自动替换为本地代理地址 `/api/image/?url=...`
- **导出兼容**：markdown 源文本保存原始 Gitee URL，导出后可在 Typora、VS Code 等其他编辑器中正常显示
- **配置项**：Gitee 仓库地址、分支、Personal Access Token

**配置方法**：

1. 前往 [Gitee 个人访问令牌](https://gitee.com/profile/personal_access_tokens) 创建 Token
2. 打开编辑器 → 图床设置 → 选择 **Gitee**
3. 填写 `gitee.com/用户名/仓库`、分支（默认 master）、Token
4. 上传图片即可自动存入 Gitee 仓库

### 🛡️ CORS 代理

- `/api/proxy/?url=...` — WebDAV/COS 请求代理，解决前端跨域问题
- `/api/image/?url=...` — 图片代理，绕过防盗链

## 🚀 本地构建与部署

### 前置条件

- Docker
- 代理（可选，用于加速构建下载）

### 构建镜像

```sh
git clone https://github.com/JIANMOP/md.git
cd md

docker build \
  -f docker/latest/Dockerfile.standalone.local \
  -t md-standalone:latest \
  --network=host \
  .
```

> 如需使用代理加速构建，添加环境变量：
>
> ```sh
> export http_proxy="http://127.0.0.1:7890"
> export https_proxy="http://127.0.0.1:7890"
> ```

### 启动容器

```sh
docker run -d \
  --name md \
  -p 8888:80 \
  md-standalone:latest
```

访问 `http://localhost:8888` 即可使用。

### 更新镜像

```sh
cd md
git pull
docker build -f docker/latest/Dockerfile.standalone.local -t md-standalone:latest --network=host .
docker stop md && docker rm md
docker run -d --name md -p 8888:80 md-standalone:latest
```

## 🔧 技术栈

- **前端**：Vue 3 + TypeScript + CodeMirror
- **后端**：Go（嵌入式静态文件服务器）
- **存储**：浏览器 localStorage + WebDAV / 腾讯云 COS
- **图床**：GitHub / Gitee（服务端代理）/ 阿里云 / 腾讯云 / 七牛云 / 又拍云 / MinIO / S3 / Cloudflare R2 / Cloudinary / Telegram / 公众号
- **部署**：Docker 单镜像（standalone）
