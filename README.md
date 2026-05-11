# 本项目是基于原始项目和 PR # 1140 的合并，加入了 webdav 存储功能，可以选择保存数据至云存储而不是浏览器本地，方便不同设备的 markdown 书写。

```sh
git clone https://github.com/JIANMOP/md.git
cd md
docker build \
  -f docker/latest/Dockerfile.standalone.local \
  -t md-standalone:pr-1140 \
  --build-arg BUILDPLATFORM="linux/amd64" \
  --build-arg TARGETPLATFORM="linux/amd64" \
  --build-arg TARGETARCH="amd64" \
  --build-arg TARGETOS="linux" \
  --network=host \
  .

docker run -d --name md-pr-1140 -p 8888:80 md-standalone:pr-1140
```
