package migration

import (
	"os"
	"path/filepath"
)

// DetectPrismInstallations finds potential Prism installations
func DetectPrismInstallations() ([]string, error) {
	var installations []string

	// For testing: Allow override via TEST_PRISM_PATH env var
	if testPath := os.Getenv("THEBOYSLAUNCHER_TEST_PRISM_PATH"); testPath != "" {
		if _, err := os.Stat(testPath); err == nil {
			installations = append(installations, testPath)
		}
		return installations, nil
	}

	// TODO: Implement standard Prism installation detection for production
	// This would check standard directories like:
	// - Windows: %APPDATA%/Prism Launcher
	// - macOS: ~/Library/Application Support/Prism Launcher
	// - Linux: ~/.prism

	return installations, nil
}

// isPrismInstallation checks if a directory is a valid Prism installation
func isPrismInstallation(path string) bool {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return false
	}

	// Look for key Prism files/directories
	indicators := []string{
		"accounts.json",
		"prismlauncher.cfg",
		"instances",
		"assets",
		"libraries",
	}

	found := 0
	for _, indicator := range indicators {
		indicatorPath := filepath.Join(path, indicator)
		if _, err := os.Stat(indicatorPath); err == nil {
			found++
		}
	}

	// Consider it a Prism installation if we find at least 3 indicators
	return found >= 3
}
