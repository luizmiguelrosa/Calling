package httputil

import (
	"encoding/json"
	"net/http"

	"github.com/go-playground/validator/v10"
)

type Validator interface {
	Validate() error
}

func ExecValidate[T Validator](dto T) ([]string, bool) {
	err := dto.Validate()
	if err == nil {
		return nil, true
	}

	var errors []string
	if validationErrs, ok := err.(validator.ValidationErrors); ok {
		for _, fieldErr := range validationErrs {
			msg := fieldErr.Field() + ": " + fieldErr.Tag()
			errors = append(errors, msg)
		}
	} else {
		errors = append(errors, "invalid payload structure")
	}
	return errors, false
}

func UnmarshalValidate[T Validator](payload []byte) (T, []string) {
	var data T

	if err := json.Unmarshal(payload, &data); err != nil {
		return data, []string{"invalid json structure"}
	}

	errors, valid := ExecValidate(data)
	if !valid {
		return data, errors
	}

	return data, nil
}

func ReadAndValidate[T Validator](w http.ResponseWriter, r *http.Request) (T, bool) {
	var data T

	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string][]string{
			"message": {"invalid json structure"},
		})
		return data, false
	}

	errors, valid := ExecValidate(data)
	if !valid {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string][]string{
			"message": errors,
		})
		return data, false
	}

	return data, true
}
