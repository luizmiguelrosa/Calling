package files

import (
	"chat-backend/internal/auth"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Handler exposes the file endpoints: uploads for room files and profile
// photos, and the access-checked downloads the client fetches them from.
type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

// UploadRoomFile handles POST /rooms/{room_id}/files. The file arrives as a
// multipart `file` field and is stored under the room's directory; images are
// rendered inline by the client, any other type is offered as a download.
func (h *Handler) UploadRoomFile(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized: missing user identity")
		return
	}

	roomID := chi.URLParam(r, "room_id")
	if roomID == "" {
		writeError(w, http.StatusBadRequest, "invalid: missing room_id")
		return
	}

	data, fileName, ok := readUpload(w, r)
	if !ok {
		return
	}

	response, err := h.service.SaveRoomFile(r.Context(), userID, roomID, fileName, data)
	if err != nil {
		writeServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// ServeRoomFile handles GET /files/rooms/{room_id}/{file}. The file name in the
// URL is `{file_id}.{format}`; only a user with access to the room is served.
func (h *Handler) ServeRoomFile(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized: missing user identity")
		return
	}

	roomID := chi.URLParam(r, "room_id")
	fileID := trimFormat(chi.URLParam(r, "file"))
	if roomID == "" || fileID == "" {
		writeError(w, http.StatusBadRequest, "invalid: missing file")
		return
	}

	reader, format, err := h.service.OpenRoomFile(r.Context(), userID, roomID, fileID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	defer reader.Close()

	writeFile(w, reader, format)
}

// UploadProfilePhoto handles POST /users/me/photo. The upload is converted to a
// compressed, resized JPEG before it is stored.
func (h *Handler) UploadProfilePhoto(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized: missing user identity")
		return
	}

	data, _, ok := readUpload(w, r)
	if !ok {
		return
	}

	response, err := h.service.SaveProfilePhoto(r.Context(), userID, data)
	if err != nil {
		writeServiceError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// ServeProfilePhoto handles GET /files/users/{file}. Avatars are visible to any
// signed-in user, so there is no room check here.
func (h *Handler) ServeProfilePhoto(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.UserIDFromContext(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized: missing user identity")
		return
	}

	userID := trimFormat(chi.URLParam(r, "file"))
	if userID == "" {
		writeError(w, http.StatusBadRequest, "invalid: missing user id")
		return
	}

	reader, err := h.service.OpenProfilePhoto(r.Context(), userID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	defer reader.Close()

	writeFile(w, reader, "jpg")
}

// readUpload parses the multipart body and returns the bytes of the `file`
// field. The body is bounded so an oversized upload is rejected before it is
// buffered.
func readUpload(w http.ResponseWriter, r *http.Request) ([]byte, string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, MaxUploadBytes)

	if err := r.ParseMultipartForm(MaxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid: could not read upload")
		return nil, "", false
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid: missing file field")
		return nil, "", false
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, MaxUploadBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid: could not read upload")
		return nil, "", false
	}

	return data, header.Filename, true
}

// writeFile streams a stored file with the content type its on-disk format maps
// to. Only images are served inline; everything else is an attachment, so a
// user-uploaded .html or .svg can never be rendered as active content by the
// webview.
func writeFile(w http.ResponseWriter, reader io.Reader, format string) {
	w.Header().Set("Content-Type", contentTypeFor(format))
	if !isInlineImage(format) {
		w.Header().Set("Content-Disposition", "attachment")
	}
	// The client keeps its own cache with a user-chosen TTL, so the file is not
	// cached here. A second, uncontrolled cache would keep serving a replaced
	// image after the client invalidated its own copy.
	w.Header().Set("Cache-Control", "no-store")
	if _, err := io.Copy(w, reader); err != nil {
		// The headers are already out; nothing left to do but stop.
		return
	}
}

func isInlineImage(format string) bool {
	_, ok := imageFormats[strings.ToLower(format)]
	return ok
}

// trimFormat drops the `.ext` suffix a file URL carries, leaving the id.
func trimFormat(file string) string {
	if index := strings.LastIndex(file, "."); index > 0 {
		return file[:index]
	}
	return file
}

var contentTypes = map[string]string{
	"png":  "image/png",
	"jpg":  "image/jpeg",
	"jpeg": "image/jpeg",
	"gif":  "image/gif",
	"webp": "image/webp",
	"csv":  "text/csv; charset=utf-8",
	"txt":  "text/plain; charset=utf-8",
	"md":   "text/markdown; charset=utf-8",
	"json": "application/json",
	"pdf":  "application/pdf",
	"zip":  "application/zip",
	"doc":  "application/msword",
	"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"xls":  "application/vnd.ms-excel",
	"xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"mp3":  "audio/mpeg",
	"wav":  "audio/wav",
	"ogg":  "audio/ogg",
	"mp4":  "video/mp4",
	"webm": "video/webm",
	"bin":  "application/octet-stream",
}

func contentTypeFor(format string) string {
	if contentType, ok := contentTypes[strings.ToLower(format)]; ok {
		return contentType
	}
	return "application/octet-stream"
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}

// writeServiceError maps the prefixed service errors onto HTTP statuses.
func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case strings.HasPrefix(err.Error(), "not_found"):
		writeError(w, http.StatusNotFound, err.Error())
	case strings.HasPrefix(err.Error(), "forbidden"):
		writeError(w, http.StatusForbidden, err.Error())
	case strings.HasPrefix(err.Error(), "invalid"):
		writeError(w, http.StatusBadRequest, err.Error())
	case strings.HasPrefix(err.Error(), "unauthorized"):
		writeError(w, http.StatusUnauthorized, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}
