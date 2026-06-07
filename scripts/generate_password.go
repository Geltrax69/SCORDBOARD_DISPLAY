//go:build ignore

// Usage: go run scripts/generate_password.go mypassword
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	pass := "Admin@1234"
	if len(os.Args) > 1 {
		pass = os.Args[1]
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Password: %s\nHash:     %s\n", pass, hash)
}
