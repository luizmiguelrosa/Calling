package storage

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"

	// Registered for their decoders: a profile photo can arrive in any of these
	// formats and is always re-encoded as JPEG.
	_ "image/gif"
	_ "image/png"

	xdraw "golang.org/x/image/draw"
)

// AvatarSize is the square edge, in pixels, every profile photo is resized to.
const AvatarSize = 256

// avatarJPEGQuality trades a little fidelity for a much smaller file; 82 is
// visually lossless at avatar size.
const avatarJPEGQuality = 82

// ToAvatarJPEG decodes any supported image, center-crops it to a square, scales
// it to AvatarSize and re-encodes it as a compressed JPEG. The result is a fixed
// size regardless of the upload, which is what keeps avatars cheap to store and
// to transfer.
func ToAvatarJPEG(data []byte) ([]byte, error) {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("invalid: unsupported image format")
	}

	square := centerSquare(src.Bounds())
	dst := image.NewRGBA(image.Rect(0, 0, AvatarSize, AvatarSize))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, square, xdraw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: avatarJPEGQuality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// centerSquare is the largest centered square inside the image, so a non-square
// upload is cropped rather than squashed.
func centerSquare(bounds image.Rectangle) image.Rectangle {
	width, height := bounds.Dx(), bounds.Dy()
	side := width
	if height < side {
		side = height
	}

	x0 := bounds.Min.X + (width-side)/2
	y0 := bounds.Min.Y + (height-side)/2
	return image.Rect(x0, y0, x0+side, y0+side)
}
