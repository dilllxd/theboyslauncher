package packwiz

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/dilllxd/theboyslauncher/internal/cli/output"
)

// downloadPackwizInstaller downloads the packwiz-installer-bootstrap.jar
func (i *Installer) downloadPackwizInstaller(instanceDir string) error {
	installerURL := "https://github.com/packwiz/packwiz-installer-bootstrap/releases/download/v0.0.3/packwiz-installer-bootstrap.jar"
	installerPath := filepath.Join(instanceDir, "packwiz-installer-bootstrap.jar")

	// Check if installer already exists
	if _, err := os.Stat(installerPath); err == nil {
		if i.verbose {
			output.Debug("Packwiz installer bootstrap already exists")
		}
		return nil
	}

	if i.verbose {
		output.Info("Downloading packwiz installer bootstrap...")
	}

	return i.downloadFileWithoutHash(installerURL, installerPath)
}

// StorePackURL stores the pack URL for the installer bootstrap
func (i *Installer) StorePackURL(instanceDir, packURL string) error {
	packURLPath := filepath.Join(instanceDir, "packwiz-url.txt")

	return os.WriteFile(packURLPath, []byte(packURL), 0644)
}

// RunPackwizInstaller runs the packwiz installer bootstrap
func RunPackwizInstaller(instanceDir, javaPath string, nogui bool) error {
	installerPath := filepath.Join(instanceDir, "packwiz-installer-bootstrap.jar")
	packURLPath := filepath.Join(instanceDir, "packwiz-url.txt")

	// Check if installer exists
	if _, err := os.Stat(installerPath); os.IsNotExist(err) {
		return fmt.Errorf("packwiz installer bootstrap not found")
	}

	// Read pack URL
	packURLData, err := os.ReadFile(packURLPath)
	if err != nil {
		return fmt.Errorf("failed to read pack URL: %w", err)
	}
	packURL := strings.TrimSpace(string(packURLData))

	// Change to instance directory
	originalDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}
	defer os.Chdir(originalDir)

	if err := os.Chdir(instanceDir); err != nil {
		return fmt.Errorf("failed to change to instance directory: %w", err)
	}

	// Prepare packwiz installer arguments
	args := []string{"-jar", "packwiz-installer-bootstrap.jar"}
	args = append(args, packURL)
	if nogui {
		args = append(args, "--no-gui")
	}

	// Run packwiz installer
	cmd := exec.Command(javaPath, args...)

	if nogui {
		// In nogui mode, capture output to show progress
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		output.Info("Running packwiz installer bootstrap in nogui mode...")
		output.Info("This will download all mods for the modpack. This may take several minutes.")
	} else {
		// In interactive mode, allow user input
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		output.Info("Running packwiz installer bootstrap...")
		output.Info("This will download all mods for the modpack. This may take several minutes.")
	}

	return cmd.Run()
}

// RunPackwizInstallerWithURL runs the packwiz installer bootstrap with a direct URL
func (i *Installer) RunPackwizInstallerWithURL(instanceDir, packURL string, nogui bool) error {
	installerPath := filepath.Join(instanceDir, "packwiz-installer-bootstrap.jar")

	// Check if installer exists
	if _, err := os.Stat(installerPath); os.IsNotExist(err) {
		return fmt.Errorf("packwiz installer bootstrap not found")
	}

	// Change to instance directory
	originalDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}
	defer os.Chdir(originalDir)

	if err := os.Chdir(instanceDir); err != nil {
		return fmt.Errorf("failed to change to instance directory: %w", err)
	}

	// Find Java executable
	javaPath := "java" // Assume Java is in PATH

	// Prepare packwiz installer arguments
	args := []string{"-jar", "packwiz-installer-bootstrap.jar"}
	args = append(args, packURL)
	if nogui {
		args = append(args, "--no-gui")
	}

	// Run packwiz installer
	cmd := exec.Command(javaPath, args...)

	if nogui {
		// In nogui mode, capture output to show progress
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		output.Info("Running packwiz installer bootstrap in nogui mode...")
		output.Info("This will download all mods for the modpack. This may take several minutes.")
	} else {
		// In interactive mode, allow user input
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		output.Info("Running packwiz installer bootstrap...")
		output.Info("This will download all mods for the modpack. This may take several minutes.")
	}

	return cmd.Run()
}

// downloadFileWithoutHash downloads a file without hash verification
func (i *Installer) downloadFileWithoutHash(url, targetPath string) error {
	resp, err := i.httpClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download file: HTTP %d", resp.StatusCode)
	}

	// Create directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Create temporary file
	tempPath := targetPath + ".tmp"
	file, err := os.Create(tempPath)
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}
	defer file.Close()

	// Download the file
	if _, err := io.Copy(file, resp.Body); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to download file content: %w", err)
	}

	// Move temp file to target
	if err := os.Rename(tempPath, targetPath); err != nil {
		// If rename fails, try to copy and then remove
		if err := i.copyFile(tempPath, targetPath); err != nil {
			os.Remove(tempPath)
			return fmt.Errorf("failed to copy temporary file: %w", err)
		}
		os.Remove(tempPath)
	}

	return nil
}

// copyFile copies a file from src to dst
func (i *Installer) copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}