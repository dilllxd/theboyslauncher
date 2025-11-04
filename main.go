//go:build !gui

package main

import (
	"os"

	"github.com/dilllxd/theboyslauncher/internal/cli"
)

func main() {
	// Parse and run the main CLI.
	_, code := cli.Run()
	os.Exit(code)
}