package main

import (
	"embed"
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
