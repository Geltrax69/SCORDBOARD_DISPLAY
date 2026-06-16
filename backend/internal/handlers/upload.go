package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UploadHandler struct {
	uploadDir string
	publicURL string
}

func NewUploadHandler(uploadDir, publicURL string) *UploadHandler {
	os.MkdirAll(filepath.Join(uploadDir, "players"), 0755)
	os.MkdirAll(filepath.Join(uploadDir, "logos"), 0755)
	os.MkdirAll(filepath.Join(uploadDir, "media"), 0755)
	return &UploadHandler{uploadDir: uploadDir, publicURL: publicURL}
}

// UploadMedia accepts an image OR a video — used for sponsor cards/banners.
func (h *UploadHandler) UploadMedia(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file uploaded (field: file)"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	images := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".svg": true}
	videos := map[string]bool{".mp4": true, ".webm": true, ".mov": true, ".m4v": true, ".ogg": true}
	if !images[ext] && !videos[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only image (jpg/png/webp/gif/svg) or video (mp4/webm/mov) allowed"})
		return
	}
	maxSize := int64(5 << 20) // 5 MB images
	if videos[ext] {
		maxSize = 100 << 20 // 100 MB videos
	}
	if file.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large"})
		return
	}

	filename := uuid.New().String() + ext
	savePath := filepath.Join(h.uploadDir, "media", filename)
	if err := os.MkdirAll(filepath.Dir(savePath), 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create directory"})
		return
	}
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed: " + err.Error()})
		return
	}

	url := h.publicURL + "/media/" + filename
	isVideo := videos[ext]
	c.JSON(http.StatusOK, gin.H{"url": url, "is_video": isVideo})
}

func (h *UploadHandler) UploadPlayerPhoto(c *gin.Context) {
	file, err := c.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file uploaded (field: photo)"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only jpg/png/webp/gif allowed"})
		return
	}
	if file.Size > 5<<20 { // 5 MB
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large (max 5 MB)"})
		return
	}

	filename := uuid.New().String() + ext
	savePath := filepath.Join(h.uploadDir, "players", filename)
	
	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(savePath), 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create directory"})
		return
	}
	
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed: " + err.Error()})
		return
	}

	url := h.publicURL + "/players/" + filename
	c.JSON(http.StatusOK, gin.H{"url": url})
}

func (h *UploadHandler) UploadTeamLogo(c *gin.Context) {
	file, err := c.FormFile("logo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file uploaded (field: logo)"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".svg": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only jpg/png/webp/gif/svg allowed"})
		return
	}
	if file.Size > 5<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large (max 5 MB)"})
		return
	}

	filename := uuid.New().String() + ext
	savePath := filepath.Join(h.uploadDir, "logos", filename)
	
	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(savePath), 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create directory"})
		return
	}
	
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed: " + err.Error()})
		return
	}

	url := h.publicURL + "/logos/" + filename
	c.JSON(http.StatusOK, gin.H{"url": url})
}
