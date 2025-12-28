package constants

import "time"

const (
	// Time durations
	StatusRefreshInterval  = 3 * time.Second
	OperationCheckInterval = 2 * time.Second
	TokenRefreshBuffer     = 5 * time.Minute
	TokenExpiryBuffer      = -5 * time.Minute

	// Downloads
	MaxConcurrentDownloads = 6

	// Memory defaults (MB)
	DefaultMinMemory = 1024
	DefaultMaxMemory = 4096

	// Window defaults
	DefaultWindowWidth  = 1708
	DefaultWindowHeight = 960

	// File permissions
	DirectoryPermissions = 0755
	FilePermissions      = 0644

	// OAuth
	DefaultRedirectURI = "http://localhost:8000/signin"

	// Migration
	MigrationTimeout = 30 * time.Second

	// Progress overlay
	ProgressHideDelay = 2 * time.Second
)
