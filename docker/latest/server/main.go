package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
)

//go:embed assets
var assets embed.FS

func main() {
	mutex := http.NewServeMux()
	md, _ := fs.Sub(assets, "assets")

	// WebDAV/COS 代理：/api/proxy/?url=...
	mutex.HandleFunc("/api/proxy/", handleProxy)

	// Gitee 图床上传：/api/upload/gitee
	mutex.HandleFunc("/api/upload/gitee", handleGiteeUpload)

	// 静态文件
	mutex.Handle("/", http.FileServer(http.FS(md)))

	err := http.ListenAndServe(":80", mutex)
	if err != nil {
		log.Fatal(err)
	}
}

func handleProxy(w http.ResponseWriter, r *http.Request) {
	targetStr := r.URL.Query().Get("url")
	if targetStr == "" {
		http.Error(w, "missing url parameter", http.StatusBadRequest)
		return
	}

	targetURL, err := url.Parse(targetStr)
	if err != nil {
		http.Error(w, "invalid url: "+err.Error(), http.StatusBadRequest)
		return
	}

	proxyReq, err := http.NewRequest(r.Method, targetURL.String(), r.Body)
	if err != nil {
		http.Error(w, "failed to create request: "+err.Error(), http.StatusInternalServerError)
		return
	}

	for _, key := range []string{"Authorization", "Content-Type"} {
		if v := r.Header.Get(key); v != "" {
			proxyReq.Header.Set(key, v)
		}
	}

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		http.Error(w, "proxy request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		for _, v := range values {
			w.Header().Add(key, v)
		}
	}

	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// GiteeUploadRequest 前端发来的上传请求
type GiteeUploadRequest struct {
	Content     string `json:"content"`
	Filename    string `json:"filename"`
	Username    string `json:"username"`
	Repo        string `json:"repo"`
	Branch      string `json:"branch"`
	AccessToken string `json:"accessToken"`
}

// handleGiteeUpload 处理 Gitee 图片上传
func handleGiteeUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req GiteeUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Content == "" || req.Filename == "" || req.Username == "" || req.Repo == "" || req.AccessToken == "" {
		http.Error(w, "missing required fields: content, filename, username, repo, accessToken", http.StatusBadRequest)
		return
	}

	if req.Branch == "" {
		req.Branch = "master"
	}

	// Gitee API v5 创建文件
	apiURL := fmt.Sprintf("https://gitee.com/api/v5/repos/%s/%s/contents/%s",
		url.PathEscape(req.Username),
		url.PathEscape(req.Repo),
		req.Filename,
	)

	body := map[string]string{
		"content":      req.Content,
		"branch":       req.Branch,
		"access_token": req.AccessToken,
		"message":      "Upload via md",
	}
	bodyJSON, _ := json.Marshal(body)

	resp, err := http.Post(apiURL, "application/json", bytes.NewReader(bodyJSON))
	if err != nil {
		http.Error(w, "gitee api request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// 返回 Gitee API 的原始响应
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}
