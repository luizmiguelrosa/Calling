package permissions

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"chat-backend/internal/auth"
)

type stubService struct {
	granted map[string]bool
}

func (s stubService) Can(_ context.Context, _ string, permission string) (bool, error) {
	return s.granted[permission], nil
}

func (s stubService) List(context.Context, string) ([]string, error) {
	return nil, nil
}

func (s stubService) CanViewRoom(context.Context, string, string) (bool, error) {
	return false, nil
}

func (s stubService) CanSendRoom(context.Context, string, string) (bool, error) {
	return false, nil
}

var testSecret = []byte("middleware-test-secret")

// request runs a handler protected by the actual auth middleware, so the test
// exercises the same identity path as the server.
func request(t *testing.T, wrapper func(http.Handler) http.Handler, authenticated bool) (*httptest.ResponseRecorder, bool) {
	t.Helper()

	called := false
	handler := wrapper(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/admin/rooms", nil)
	if authenticated {
		access, _, err := auth.GenerateTokenPair(testSecret, "user-1", "alice")
		if err != nil {
			t.Fatalf("GenerateTokenPair: %v", err)
		}
		req.Header.Set("Authorization", "Bearer "+access)
	}

	recorder := httptest.NewRecorder()
	auth.Middleware(testSecret)(handler).ServeHTTP(recorder, req)

	return recorder, called
}

func TestRequireDeniesWithoutThePermission(t *testing.T) {
	service := stubService{granted: map[string]bool{RoomsView: true}}

	recorder, called := request(t, Require(service, RoomsCreate), true)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d; want %d", recorder.Code, http.StatusForbidden)
	}
	if called {
		t.Fatal("handler ran without rooms.create")
	}
}

func TestRequireAllowsTheGrantedPermission(t *testing.T) {
	service := stubService{granted: map[string]bool{RoomsCreate: true}}

	recorder, called := request(t, Require(service, RoomsCreate), true)

	if recorder.Code != http.StatusOK || !called {
		t.Fatalf("status = %d, called = %v; want 200 and true", recorder.Code, called)
	}
}

func TestRequireAnyAllowsOneOfThePermissions(t *testing.T) {
	service := stubService{granted: map[string]bool{RoomsCreate: true}}

	recorder, called := request(t, RequireAny(service, RoomsView, RoomsEdit, RoomsCreate), true)

	if recorder.Code != http.StatusOK || !called {
		t.Fatalf("status = %d, called = %v; want 200 and true", recorder.Code, called)
	}
}

func TestRequireAnyDeniesWhenNoPermissionIsHeld(t *testing.T) {
	service := stubService{granted: map[string]bool{UsersManage: true}}

	recorder, called := request(t, RequireAny(service, RoomsView, RoomsEdit, RoomsCreate), true)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d; want %d", recorder.Code, http.StatusForbidden)
	}
	if called {
		t.Fatal("handler ran without any room permission")
	}
}

func TestRequireRejectsAMissingSession(t *testing.T) {
	service := stubService{granted: map[string]bool{RoomsCreate: true}}

	recorder, called := request(t, Require(service, RoomsCreate), false)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d; want %d", recorder.Code, http.StatusUnauthorized)
	}
	if called {
		t.Fatal("handler ran without an authenticated session")
	}
}
