package user

import "github.com/go-playground/validator/v10"

var validate = validator.New()

func (c CreateUserInput) Validate() error {
	return validate.Struct(c)
}

func (l LoginInput) Validate() error {
	return validate.Struct(l)
}

func (c ChangePasswordInput) Validate() error {
	return validate.Struct(c)
}
