package main

import (
	"github.com/dilllxd/theboyslauncher/internal/cli"
)

func main() {
	// Parse and run the main CLI.
	exiter, code := cli.Run()
	exiter(code)
}
