package files

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExtensionFor(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

	tests := []struct {
		name     string
		fileName string
		data     []byte
		want     string
	}{
		{name: "csv keeps its extension", fileName: "report.csv", data: []byte("a,b\n1,2\n"), want: "csv"},
		{name: "uppercase extension is lowered", fileName: "REPORT.CSV", data: []byte("a,b\n"), want: "csv"},
		{name: "jpeg is canonicalised to jpg", fileName: "photo.jpeg", data: nil, want: "jpg"},
		{name: "png is canonicalised to png", fileName: "photo.PNG", data: nil, want: "png"},
		{name: "no extension sniffs the bytes", fileName: "photo", data: png, want: "png"},
		{name: "text without an extension becomes txt", fileName: "notes", data: []byte("hello"), want: "txt"},
		{name: "unknown bytes become bin", fileName: "", data: []byte{0x00, 0x01, 0x02, 0x03}, want: "bin"},
		{name: "unsafe extension falls back to sniffing", fileName: "payload.p!ng", data: []byte("a,b\n"), want: "txt"},
		{name: "too-long extension is not trusted", fileName: "file.abcdefghijklm", data: []byte{0x00, 0x01}, want: "bin"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := extensionFor(test.fileName, test.data); got != test.want {
				t.Fatalf("extensionFor(%q) = %q, want %q", test.fileName, got, test.want)
			}
		})
	}
}

func TestIsSafeExtension(t *testing.T) {
	for _, ext := range []string{"csv", "xlsx", "7z", ""} {
		if got, want := isSafeExtension(ext), ext != ""; got != want {
			t.Errorf("isSafeExtension(%q) = %v, want %v", ext, got, want)
		}
	}

	for _, ext := range []string{"c-sv", "a/b", "..", "abcdefghijklm"} {
		if isSafeExtension(ext) {
			t.Errorf("isSafeExtension(%q) = true, want false", ext)
		}
	}
}

func TestWriteFileDisposition(t *testing.T) {
	tests := []struct {
		name            string
		format          string
		wantType        string
		wantDisposition string
	}{
		{"png is inline", "png", "image/png", ""},
		{"csv downloads", "csv", "text/csv; charset=utf-8", "attachment"},
		{"unknown downloads as bytes", "bin", "application/octet-stream", "attachment"},
		{"unsupported extension is not rendered inline", "html", "application/octet-stream", "attachment"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()

			writeFile(recorder, strings.NewReader("payload"), test.format)

			if got := recorder.Header().Get("Content-Type"); got != test.wantType {
				t.Errorf("Content-Type = %q, want %q", got, test.wantType)
			}
			if got := recorder.Header().Get("Content-Disposition"); got != test.wantDisposition {
				t.Errorf("Content-Disposition = %q, want %q", got, test.wantDisposition)
			}
			if got := recorder.Body.String(); got != "payload" {
				t.Errorf("body = %q, want %q", got, "payload")
			}
		})
	}
}
