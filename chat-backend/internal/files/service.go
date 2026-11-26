package files

import (
	"chat-backend/internal/models"
	"chat-backend/internal/permissions"
	"chat-backend/internal/storage"
	"context"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// MaxUploadBytes caps a single upload. It bounds both the multipart parse and
// what is ever handed to the image decoder or written to disk.
const MaxUploadBytes = 10 << 20 // 10 MiB

// Service is the file side of the chat: it stores uploads, resolves the metadata
// a file message carries, and serves files back under an access check.
type Service interface {
	SaveRoomFile(ctx context.Context, userID, roomID, fileName string, data []byte) (models.FileResponse, error)
	ResolveAttachment(ctx context.Context, fileID string) (models.FileAttachment, error)
	OpenRoomFile(ctx context.Context, userID, roomID, fileID string) (io.ReadCloser, string, error)
	SaveProfilePhoto(ctx context.Context, userID string, data []byte) (models.FileResponse, error)
	OpenProfilePhoto(ctx context.Context, userID string) (io.ReadCloser, error)
}

type fileService struct {
	repo        Repository
	store       *storage.Storage
	permissions permissions.Service
}

func NewService(repo Repository, store *storage.Storage, permissionService permissions.Service) Service {
	return &fileService{repo: repo, store: store, permissions: permissionService}
}

func (s *fileService) SaveRoomFile(ctx context.Context, userID, roomID, fileName string, data []byte) (models.FileResponse, error) {
	isDM, err := s.ensureRoomAccess(ctx, userID, roomID)
	if err != nil {
		return models.FileResponse{}, err
	}

	if !isDM {
		allowed, err := s.permissions.CanSendRoom(ctx, userID, roomID)
		if err != nil {
			return models.FileResponse{}, err
		}
		if !allowed {
			return models.FileResponse{}, errors.New("forbidden: you cannot send messages in this room")
		}
	}

	format := extensionFor(fileName, data)

	fileID := strconv.FormatInt(time.Now().UnixNano(), 10)
	relPath, hash, err := s.store.SaveRoomFile(roomID, fileID, format, data)
	if err != nil {
		return models.FileResponse{}, err
	}

	name := sanitizeName(fileName, fileID, format)
	if err := s.repo.Save(ctx, StoredFile{
		ID:       fileID,
		RoomID:   roomID,
		Uploader: userID,
		FileName: name,
		Path:     relPath,
		Hash:     hash,
		Format:   format,
		Size:     int64(len(data)),
	}); err != nil {
		return models.FileResponse{}, err
	}

	return models.FileResponse{
		ID:       fileID,
		FileName: name,
		Path:     urlPath(relPath),
		Hash:     hash,
		Format:   format,
	}, nil
}

func (s *fileService) ResolveAttachment(ctx context.Context, fileID string) (models.FileAttachment, error) {
	file, err := s.repo.Get(ctx, fileID)
	if err != nil {
		return models.FileAttachment{}, err
	}

	return models.FileAttachment{
		FileName: file.FileName,
		Path:     urlPath(file.Path),
		Hash:     file.Hash,
		Format:   file.Format,
	}, nil
}

func (s *fileService) OpenRoomFile(ctx context.Context, userID, roomID, fileID string) (io.ReadCloser, string, error) {
	if _, err := s.ensureRoomAccess(ctx, userID, roomID); err != nil {
		return nil, "", err
	}

	file, err := s.repo.Get(ctx, fileID)
	if err != nil {
		return nil, "", err
	}

	// The id has to belong to the room in the URL, or a participant of one room
	// could read a file from another by guessing its id.
	if file.RoomID != roomID {
		return nil, "", ErrFileNotFound
	}

	reader, err := s.store.Open(file.Path)
	if err != nil {
		return nil, "", err
	}

	return reader, file.Format, nil
}

func (s *fileService) SaveProfilePhoto(ctx context.Context, userID string, data []byte) (models.FileResponse, error) {
	relPath, hash, err := s.store.SaveProfilePhoto(userID, data)
	if err != nil {
		return models.FileResponse{}, err
	}

	return models.FileResponse{
		ID:       userID,
		FileName: userID + ".jpg",
		Path:     urlPath(relPath),
		Hash:     hash,
	}, nil
}

func (s *fileService) OpenProfilePhoto(ctx context.Context, userID string) (io.ReadCloser, error) {
	return s.store.Open(storage.ProfilePhotoRelPath(userID))
}

// ensureRoomAccess allows any authenticated user into an open public room or
// one they hold `room.view` for, but only a participant into a direct message.
// It returns whether the room is a DM, which decides if send access applies.
func (s *fileService) ensureRoomAccess(ctx context.Context, userID, roomID string) (bool, error) {
	isDM, exists, err := s.repo.RoomIsDM(ctx, roomID)
	if err != nil {
		return false, err
	}
	if !exists {
		return false, errors.New("not_found: target room does not exist")
	}

	if !isDM {
		allowed, err := s.permissions.CanViewRoom(ctx, userID, roomID)
		if err != nil {
			return false, err
		}
		if !allowed {
			return false, errors.New("forbidden: you cannot view this room")
		}
		return false, nil
	}

	isParticipant, err := s.repo.IsRoomParticipant(ctx, roomID, userID)
	if err != nil {
		return true, err
	}
	if !isParticipant {
		return true, errors.New("forbidden: you are not a participant of this direct message room")
	}

	return true, nil
}

// urlPath is the server-relative URL a stored file is served from. The client
// resolves it against whichever backend address it is currently pointed at.
func urlPath(relPath string) string {
	return "/files/" + strings.TrimPrefix(filepath.ToSlash(relPath), "/")
}

// imageFormats maps a file extension to the canonical format stored on disk.
var imageFormats = map[string]string{
	"png":  "png",
	"jpg":  "jpg",
	"jpeg": "jpg",
	"gif":  "gif",
	"webp": "webp",
}

// extensionFor picks the on-disk extension: the upload's own extension when it is
// a known image type, its own safe extension otherwise (so a CSV stays a CSV), or
// the sniffed content type when the name carries no usable extension.
func extensionFor(fileName string, data []byte) string {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(fileName)), ".")
	if format, ok := imageFormats[ext]; ok {
		return format
	}
	if isSafeExtension(ext) {
		return ext
	}

	contentType := http.DetectContentType(data)
	switch {
	case contentType == "image/png":
		return "png"
	case contentType == "image/jpeg":
		return "jpg"
	case contentType == "image/gif":
		return "gif"
	case strings.HasPrefix(contentType, "text/plain"):
		return "txt"
	case contentType == "application/pdf":
		return "pdf"
	default:
		return "bin"
	}
}

// isSafeExtension keeps a user-supplied extension from reaching the on-disk path
// unless it is a short alphanumeric token.
func isSafeExtension(ext string) bool {
	if len(ext) == 0 || len(ext) > 12 {
		return false
	}
	for _, r := range ext {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

// sanitizeName keeps the original name for display, falling back to the stored
// id when the upload carried none.
func sanitizeName(fileName, fileID, format string) string {
	name := filepath.Base(strings.TrimSpace(fileName))
	if name == "" || name == "." {
		return fileID + "." + format
	}
	return name
}
