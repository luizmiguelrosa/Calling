package permissions

import (
	"context"
	"testing"
)

type fakeRepository struct {
	admin    bool
	explicit bool
	granted  map[string]bool
}

func (f *fakeRepository) HasPermission(context.Context, string, string) (bool, error) {
	return f.admin, nil
}

func (f *fakeRepository) ListPermissions(context.Context, string) ([]string, error) {
	return nil, nil
}

func (f *fakeRepository) RoomHasExplicitPermissions(context.Context, string) (bool, error) {
	return f.explicit, nil
}

func (f *fakeRepository) HasRoomPermission(_ context.Context, _ string, _ string, permission string) (bool, error) {
	return f.granted[permission], nil
}

func TestOpenRoomAllowsEveryone(t *testing.T) {
	service := NewService(&fakeRepository{explicit: false})

	allowed, err := service.CanViewRoom(context.Background(), "user-1", "room-1")
	if err != nil || !allowed {
		t.Fatalf("CanViewRoom on an open room = %v, %v; want true", allowed, err)
	}

	allowed, err = service.CanSendRoom(context.Background(), "user-1", "room-1")
	if err != nil || !allowed {
		t.Fatalf("CanSendRoom on an open room = %v, %v; want true", allowed, err)
	}
}

func TestRestrictedRoomOnlyAllowsGrantedUsers(t *testing.T) {
	service := NewService(&fakeRepository{
		explicit: true,
		granted:  map[string]bool{RoomView: true},
	})

	allowed, err := service.CanViewRoom(context.Background(), "user-1", "room-1")
	if err != nil || !allowed {
		t.Fatalf("CanViewRoom with room.view = %v, %v; want true", allowed, err)
	}

	allowed, err = service.CanSendRoom(context.Background(), "user-1", "room-1")
	if err != nil || allowed {
		t.Fatalf("CanSendRoom without room.send = %v, %v; want false", allowed, err)
	}
}

func TestAdminAllBypassesRoomRestriction(t *testing.T) {
	service := NewService(&fakeRepository{admin: true, explicit: true, granted: map[string]bool{}})

	allowed, err := service.CanViewRoom(context.Background(), "admin", "room-1")
	if err != nil || !allowed {
		t.Fatalf("CanViewRoom for admin.all = %v, %v; want true", allowed, err)
	}
}
