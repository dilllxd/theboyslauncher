//go:build windows

// Package launcher provides the necessary functions to start the game.
package launcher

import (
	"os/exec"
	"syscall"
)

// configureProcessAttributes sets platform-specific process attributes for Windows
func configureProcessAttributes(cmd *exec.Cmd) {
	// Hide the console window on Windows
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}