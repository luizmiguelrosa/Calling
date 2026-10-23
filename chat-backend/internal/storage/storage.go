// Package storage owns the on-disk layout of the files the chat serves. The
// root directory is configurable (FILES_DIR) and the layout inside it is fixed:
// room files under rooms/{room_id}/{file_id}.{format} and profile photos under
// users/{user_id}.jpg.
package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// DefaultRoot is where files land when FILES_DIR is not set.
const DefaultRoot = "files"

// Storage reads and writes the served files under a single root directory.
type Storage struct {
	root string
}

// New resolves the root directory and makes sure it exists. A blank root falls
// back to DefaultRoot so an unset environment variable still works.
func New(root string) (*Storage, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		root = DefaultRoot
	}

	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve files directory: %w", err)
	}

	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("create files directory: %w", err)
	}

	return &Storage{root: abs}, nil
}

// Root is the absolute directory files are stored under.
func (s *Storage) Root() string { return s.root }

// RoomFileRelPath is the root-relative location of a room file. It is both the
// on-disk path and the tail of the URL the client fetches it from.
func RoomFileRelPath(roomID, fileID, format string) string {
	return path.Join("rooms", roomID, fileID+"."+format)
}

// ProfilePhotoRelPath is the root-relative location of a user's avatar.
func ProfilePhotoRelPath(userID string) string {
	return path.Join("users", userID+".jpg")
}

// SaveRoomFile writes the raw bytes of a room file and returns its
// root-relative path together with the SHA-256 of the stored bytes.
func (s *Storage) SaveRoomFile(roomID, fileID, format string, data []byte) (string, string, error) {
	rel := RoomFileRelPath(roomID, fileID, format)
	if err := s.write(rel, data); err != nil {
		return "", "", err
	}
	return rel, Hash(data), nil
}

// SaveProfilePhoto converts the upload to a compressed avatar JPEG, writes it to
// users/{userID}.jpg, and returns the root-relative path and stored hash.
func (s *Storage) SaveProfilePhoto(userID string, data []byte) (string, string, error) {
	encoded, err := ToAvatarJPEG(data)
	if err != nil {
		return "", "", err
	}

	rel := ProfilePhotoRelPath(userID)
	if err := s.write(rel, encoded); err != nil {
		return "", "", err
	}
	return rel, Hash(encoded), nil
}

// Open opens a root-relative file for reading. The path is cleaned and rejected
// if it escapes the root, so a crafted id cannot read arbitrary files.
func (s *Storage) Open(rel string) (io.ReadCloser, error) {
	clean := path.Clean("/" + strings.ReplaceAll(rel, "\\", "/"))
	if clean == "/" {
		return nil, errors.New("invalid file path")
	}

	return os.Open(filepath.Join(s.root, filepath.FromSlash(strings.TrimPrefix(clean, "/"))))
}

func (s *Storage) write(rel string, data []byte) error {
	full := filepath.Join(s.root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	return os.WriteFile(full, data, 0o644)
}

// Hash is the SHA-256 of the stored bytes, hex-encoded. The client recomputes it
// to verify the file arrived intact.
func Hash(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
