package models

import (
	"time"
)

type TypeRoom string

const (
	PublicRoom TypeRoom = "public"
	DirectRoom TypeRoom = "direct"
)

type MessageBroadcast struct {
	RoomID   string    `json:"room_id"`
	Author   string    `json:"author"`
	Content  string    `json:"content"`
	SendedAt time.Time `json:"sendedAt"`
}

type IncomingMessage struct {
	RoomID  string `json:"room_id" validate:"required,min=3"`
	Content string `json:"content" validate:"required,max=500"`
}
