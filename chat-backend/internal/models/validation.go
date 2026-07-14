package models

import "github.com/go-playground/validator/v10"

var validate = validator.New()

func (i IncomingMessage) Validate() error {
	return validate.Struct(i)
}
