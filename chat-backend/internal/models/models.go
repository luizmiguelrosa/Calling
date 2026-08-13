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

type CreateRoomInput struct {
	Name string `json:"name" validate:"required,min=3,max=32"`
	IsDM bool   `json:"is_dm"`
}

type CreateDMInput struct {
	ReceiverID string `json:"receiver_id" validate:"required"`
}

type RoomResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	IsDM bool   `json:"is_dm"`
}
