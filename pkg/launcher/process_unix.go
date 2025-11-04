//go:build linux || darwin

// Package launcher provides the necessary functions to start the game.
package launcher

import (
	"os/exec"
	"syscall"
)

// configureProcessAttributes sets platform-specific process attributes for Unix-like systems
func configureProcessAttributes(cmd *exec.Cmd) {
	// On Unix-like systems, we can detach from the terminal
	// by setting the process group ID
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
		Pgid:    0,
	}
}