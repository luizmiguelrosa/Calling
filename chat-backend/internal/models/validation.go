package models

import "github.com/go-playground/validator/v10"

var validate = validator.New()

func (i IncomingMessage) Validate() error {
	return validate.Struct(i)
}

func (c CreateRoomInput) Validate() error {
	return validate.Struct(c)
}

func (d CreateDMInput) Validate() error {
	return validate.Struct(d)
}
