// Package migration provides functionality to migrate from Prism Launcher to TheBoysLauncher
package migration

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pelletier/go-toml"

	env "github.com/dilllxd/theboyslauncher/pkg"
	"github.com/dilllxd/theboyslauncher/pkg/launcher"
	"github.com/dilllxd/theboyslauncher/pkg/packwiz"
)

// Note: We do not define Prism account structures since we don't migrate account data
// for security reasons. Users will log in fresh.

// PrismInstance represents an instance configuration from Prism
type PrismInstance struct {
	Name         string `json:"name"`
	InstanceType string `json:"instanceType"`
	GameVersion  string `json:"gameVersion"`
	ModpackType  string `json:"modpackType"`
	// Additional instance settings
	Components struct {
		GameType    string `json:"gameType"`
		ProfileType string `json:"profileType"`
		GameVersion string `json:"gameVersion"`
	} `json:"components"`
}

// MigrationProgress tracks the progress of migration operations
type MigrationProgress struct {
	TotalItems     int           `json:"total_items"`
	CompletedItems int           `json:"completed_items"`
	CurrentItem    string        `json:"current_item"`
	StartTime      time.Time     `json:"start_time"`
	EstimatedTime  time.Duration `json:"estimated_time"`
	IsComplete     bool          `json:"is_complete"`
	Errors         []string      `json:"errors"`
}

// MigrationResult contains the results of a migration operation
type MigrationResult struct {
	Success       bool              `json:"success"`
	MigratedItems map[string]string `json:"migrated_items"`
	SkippedItems  []string          `json:"skipped_items"`
	Errors        []string          `json:"errors"`
	BackupPath    string            `json:"backup_path"`
	TotalSize     int64             `json:"total_size"`
	Duration      time.Duration     `json:"duration"`
}

// Migrator handles the migration from Prism to TheBoysLauncher
type Migrator struct {
	PrismPath      string
	LauncherPath   string
	BackupPath     string
	Progress       *MigrationProgress
	ProgressChan   chan *MigrationProgress
	TerminateChan  chan bool
}

// NewMigrator creates a new migrator instance
func NewMigrator(prismPath string) (*Migrator, error) {
	if _, err := os.Stat(prismPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("Prism directory does not exist: %s", prismPath)
	}

	launcherPath := env.RootDir
	backupPath := filepath.Join(filepath.Dir(prismPath), fmt.Sprintf("prism_backup_%s", time.Now().Format("20060102_150405")))

	return &Migrator{
		PrismPath:     prismPath,
		LauncherPath:  launcherPath,
		BackupPath:    backupPath,
		Progress:      &MigrationProgress{},
		ProgressChan:  make(chan *MigrationProgress, 100),
		TerminateChan: make(chan bool, 1),
	}, nil
}

// DetectPrismInstallations finds potential Prism installations
func DetectPrismInstallations() ([]string, error) {
	var installations []string

	// For testing: Look for Prism in the specific demo directory
	rootPath := "C:\\Users\\Dylan\\Desktop\\Prism Demo"

	// Check if root directory exists
	if _, err := os.Stat(rootPath); os.IsNotExist(err) {
		return installations, nil
	}

	// Look for prism subdirectory in the root
	prismPath := filepath.Join(rootPath, "prism")

	if isPrismInstallation(prismPath) {
		installations = append(installations, prismPath)
	}

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

// CreateBackup creates a backup of the Prism installation (game data only)
func (m *Migrator) CreateBackup() error {
	m.updateProgress("Creating backup of Prism game data...", 0, 1)

	if err := os.MkdirAll(filepath.Dir(m.BackupPath), 0755); err != nil {
		return fmt.Errorf("create backup directory: %w", err)
	}

	// Backup only essential game data files (exclude account data for security)
	essentialItems := []string{
		"instances",
		"prismlauncher.cfg", // Keep launcher config for reference
	}

	for _, item := range essentialItems {
		src := filepath.Join(m.PrismPath, item)
		dst := filepath.Join(m.BackupPath, item)

		if _, err := os.Stat(src); err == nil {
			if err := copyItem(src, dst); err != nil {
				return fmt.Errorf("backup item %s: %w", item, err)
			}
		}
	}

	m.updateProgress("Backup created successfully", 1, 1)
	return nil
}

// Note: We do not migrate account data for security reasons.
// Users will need to log in fresh with their Microsoft accounts.
// This ensures fresh tokens and better security.

// MigrateInstances migrates Minecraft instances from Prism
func (m *Migrator) MigrateInstances() error {
	instancesDir := filepath.Join(m.PrismPath, "instances")
	if _, err := os.Stat(instancesDir); os.IsNotExist(err) {
		return fmt.Errorf("no instances directory found in Prism installation")
	}

	// List all instances
	instances, err := os.ReadDir(instancesDir)
	if err != nil {
		return fmt.Errorf("list instances: %w", err)
	}

	if len(instances) == 0 {
		return nil
	}

	m.updateProgress("Scanning instances...", 0, len(instances))

	// Create instances directory in launcher
	launcherInstancesDir := env.InstancesDir
	if err := os.MkdirAll(launcherInstancesDir, 0755); err != nil {
		return fmt.Errorf("create launcher instances directory: %w", err)
	}

	completed := 0
	failedInstances := []string{}

	for _, instance := range instances {
		select {
		case <-m.TerminateChan:
			return fmt.Errorf("migration terminated by user")
		default:
		}

		if !instance.IsDir() {
			continue
		}

		instanceName := instance.Name()
		instancePath := filepath.Join(instancesDir, instanceName)
		launcherInstancePath := filepath.Join(launcherInstancesDir, instanceName)

		m.updateProgress(fmt.Sprintf("Migrating instance: %s", instanceName), completed, len(instances))

		// Migrate the instance
		if err := m.migrateInstance(instancePath, launcherInstancePath); err != nil {
			// Store error but continue with other instances
			errorMsg := fmt.Sprintf("Failed to migrate instance %s: %v", instanceName, err)
			fmt.Printf("Warning: %s\n", errorMsg)
			failedInstances = append(failedInstances, errorMsg)
			continue
		}

		completed++
	}

	m.updateProgress("Instances migration completed", len(instances), len(instances))

	// Return error if any instances failed
	if len(failedInstances) > 0 {
		return fmt.Errorf("migration completed with errors:\n%s", strings.Join(failedInstances, "\n"))
	}

	return nil
}

// migrateInstance migrates a single instance from Prism to our launcher
func (m *Migrator) migrateInstance(srcPath, dstPath string) error {
	// Parse Prism's configuration files to get all instance info
	gameVersion, modLoader, modLoaderVersion, minMemory, maxMemory := m.parsePrismInstanceConfig(srcPath)

	// Try to create instance with detected mod loader, fall back to vanilla if it fails
	var inst launcher.Instance
	var err error

	// First attempt: Use detected mod loader
	inst, err = launcher.CreateInstance(launcher.InstanceOptions{
		GameVersion:   gameVersion,
		Name:          filepath.Base(dstPath),
		Loader:        modLoader,
		LoaderVersion: modLoaderVersion,
		Config: launcher.InstanceConfig{
			MinMemory: minMemory,
			MaxMemory: maxMemory,
			WindowResolution: struct {
				Width  int `toml:"width" json:"width"`
				Height int `toml:"height" json:"height"`
			}{
				Width:  1708,
				Height: 960,
			},
		},
	})

	if err != nil {
		fmt.Printf("Warning: Failed to create instance with %s %s: %v. Falling back to vanilla.\n", modLoader, modLoaderVersion, err)

		// Fallback: Create vanilla instance
		inst, err = launcher.CreateInstance(launcher.InstanceOptions{
			GameVersion:   gameVersion,
			Name:          filepath.Base(dstPath),
			Loader:        launcher.LoaderVanilla,
			LoaderVersion: "",
			Config: launcher.InstanceConfig{
				MinMemory: minMemory,
				MaxMemory: maxMemory,
				WindowResolution: struct {
					Width  int `toml:"width" json:"width"`
					Height int `toml:"height" json:"height"`
				}{
					Width:  1708,
					Height: 960,
				},
			},
		})

		if err != nil {
			return fmt.Errorf("create instance (vanilla fallback also failed): %w", err)
		}

		fmt.Printf("Successfully created vanilla instance as fallback for %s\n", filepath.Base(dstPath))
	}

	// Create the instance directory and save our config
	if err := os.MkdirAll(dstPath, 0755); err != nil {
		return fmt.Errorf("create instance directory: %w", err)
	}

	// Copy essential Minecraft data from minecraft/ subfolder to root level
	minecraftData := []string{
		"minecraft/saves",
		"minecraft/resourcepacks",
		"minecraft/shaderpacks",
		"minecraft/screenshots",
		"minecraft/config",
		"minecraft/options.txt",
		"minecraft/mods",
	}

	for _, item := range minecraftData {
		src := filepath.Join(srcPath, item)

		// Remove "minecraft/" prefix for destination (move to root level)
		dstItem := strings.TrimPrefix(item, "minecraft/")
		dst := filepath.Join(dstPath, dstItem)

		if _, err := os.Stat(src); err == nil {
			if err := copyItem(src, dst); err != nil {
				fmt.Printf("Warning: Failed to copy %s: %v\n", item, err)
			}
		}
	}

	// Save our instance configuration
	inst.Name = filepath.Base(dstPath)
	if err := inst.WriteConfig(); err != nil {
		return fmt.Errorf("save instance config: %w", err)
	}

	// Special handling for WinterPack - set up packwiz configuration after migration is complete
	instanceName := filepath.Base(dstPath)
	if instanceName == "WinterPack" {
		fmt.Printf("Setting up packwiz configuration for WinterPack...\n")

		// Update the instance configuration with packwiz info
		if err := m.setupWinterPackPackwiz(dstPath, &inst); err != nil {
			fmt.Printf("Warning: Failed to setup packwiz for WinterPack: %v\n", err)
			// Don't fail the entire migration for packwiz setup issues
		} else {
			fmt.Printf("Successfully configured WinterPack with packwiz\n")

			// Run packwiz installer in a separate goroutine to avoid blocking migration
			go func() {
				fmt.Printf("Running packwiz installer for WinterPack updates...\n")
				fmt.Printf("Instance path: %s\n", dstPath)
				fmt.Printf("Pack URL: %s\n", inst.Config.Packwiz.URL)

				// First, manually download the packwiz installer with detailed logging
				installerURL := "https://github.com/packwiz/packwiz-installer-bootstrap/releases/download/v0.0.3/packwiz-installer-bootstrap.jar"
				installerPath := filepath.Join(dstPath, "packwiz-installer-bootstrap.jar")

				fmt.Printf("Downloading packwiz installer from: %s\n", installerURL)
				fmt.Printf("Target path: %s\n", installerPath)

				resp, err := http.Get(installerURL)
				if err != nil {
					fmt.Printf("Failed to download installer: %v\n", err)
					return
				}
				defer resp.Body.Close()

				fmt.Printf("Download response status: %d\n", resp.StatusCode)
				if resp.StatusCode != http.StatusOK {
					fmt.Printf("Download failed with HTTP status: %d\n", resp.StatusCode)
					return
				}

				// Create the file
				file, err := os.Create(installerPath)
				if err != nil {
					fmt.Printf("Failed to create installer file: %v\n", err)
					return
				}
				defer file.Close()

				bytesWritten, err := io.Copy(file, resp.Body)
				if err != nil {
					fmt.Printf("Failed to write installer file: %v\n", err)
					return
				}

				fmt.Printf("Successfully downloaded %d bytes to %s\n", bytesWritten, installerPath)

				// Now run the packwiz installer
				installer := packwiz.NewInstaller("", false)
				if err := installer.RunPackwizInstallerWithURL(dstPath, inst.Config.Packwiz.URL, true); err != nil {
					fmt.Printf("Warning: Packwiz installer failed, but instance is configured: %v\n", err)
				} else {
					fmt.Printf("Packwiz installer completed successfully for WinterPack\n")

					// After successful installation, update the instance.toml with the new version
					// Read the current pack.toml to get the version
					packTomlPath := filepath.Join(dstPath, "pack.toml")
					if packData, err := os.ReadFile(packTomlPath); err == nil {
						// Parse pack.toml to get version
						type PackToml struct {
							Version string `toml:"version"`
						}
						var packToml PackToml
						if err := toml.Unmarshal(packData, &packToml); err == nil && packToml.Version != "" {
							fmt.Printf("Updating instance.toml with new version: %s\n", packToml.Version)

							// Update the instance with the new version
							inst.Config.Packwiz.Version = packToml.Version
							if err := inst.WriteConfig(); err != nil {
								fmt.Printf("Warning: Failed to save updated instance config: %v\n", err)
							} else {
								fmt.Printf("Successfully updated WinterPack version to %s\n", packToml.Version)
							}
						} else {
							fmt.Printf("Warning: Could not parse pack.toml version: %v\n", err)
						}
					} else {
						fmt.Printf("Warning: Could not read pack.toml: %v\n", err)
					}
				}
			}()
		}
	}

	return nil
}

// Cleanup removes the old Prism installation (user's choice)
func (m *Migrator) Cleanup() error {
	m.updateProgress("Cleaning up Prism installation...", 0, 1)

	// Remove only non-essential files to be safe
	removeItems := []string{
		"assets",
		"libraries",
		"java",
		"platforms",
		"iconengines",
		"imageformats",
		"logs",
		"unins000.exe",
		"unins000.dat",
	}

	for _, item := range removeItems {
		itemPath := filepath.Join(m.PrismPath, item)
		if _, err := os.Stat(itemPath); err == nil {
			if err := os.RemoveAll(itemPath); err != nil {
				fmt.Printf("Warning: Failed to remove %s: %v\n", item, err)
			}
		}
	}

	m.updateProgress("Cleanup completed", 1, 1)
	return nil
}

// StartMigration begins the complete migration process (game data only)
func (m *Migrator) StartMigration() (*MigrationResult, error) {
	startTime := time.Now()
	result := &MigrationResult{
		MigratedItems: make(map[string]string),
		Errors:        []string{},
	}

	// Progress update
	m.Progress.StartTime = startTime
	m.Progress.TotalItems = 3 // Backup, Instances, Cleanup

	// Step 1: Create backup
	if err := m.CreateBackup(); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Backup failed: %v", err))
		result.Success = false
		result.Duration = time.Since(startTime)
		return result, nil
	}
	result.MigratedItems["backup"] = m.BackupPath
	m.Progress.CompletedItems++

	// Step 2: Migrate instances (game data only)
	if err := m.MigrateInstances(); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Instances migration failed: %v", err))
		result.Success = false
		result.Duration = time.Since(startTime)
		return result, nil
	}
	result.MigratedItems["instances"] = env.InstancesDir
	m.Progress.CompletedItems++

	m.Progress.IsComplete = true
	result.Duration = time.Since(startTime)
	result.Success = len(result.Errors) == 0

	return result, nil
}

// Terminate stops the migration process
func (m *Migrator) Terminate() {
	select {
	case m.TerminateChan <- true:
	default:
	}
}

// Helper functions

func copyItem(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return copyDir(src, dst)
	}
	return copyFile(src, dst)
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}

	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}

func copyDir(src, dst string) error {
	items, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}

	for _, item := range items {
		srcPath := filepath.Join(src, item.Name())
		dstPath := filepath.Join(dst, item.Name())

		if item.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}

	return nil
}

func (m *Migrator) updateProgress(currentItem string, completed, total int) {
	m.Progress.CurrentItem = currentItem
	m.Progress.CompletedItems = completed
	m.Progress.TotalItems = total
	m.Progress.IsComplete = completed >= total

	if m.ProgressChan != nil {
		select {
		case m.ProgressChan <- m.Progress:
		default:
			// Channel is full, skip this update
		}
	}
}

// SanitizeFilename removes invalid characters from filenames
func SanitizeFilename(filename string) string {
	// Replace invalid characters with underscores
	reg := regexp.MustCompile(`[<>:"/\\|?*]`)
	return reg.ReplaceAllString(filename, "_")
}

// GetMigrationSize calculates the total size of game data to be migrated
func (m *Migrator) GetMigrationSize() (int64, error) {
	var totalSize int64

	// Calculate size of essential game data items only (no account data)
	essentialItems := []string{
		"instances",
		"prismlauncher.cfg",
	}

	for _, item := range essentialItems {
		itemPath := filepath.Join(m.PrismPath, item)
		size, err := getDirSize(itemPath)
		if err == nil {
			totalSize += size
		}
	}

	return totalSize, nil
}

func getDirSize(path string) (int64, error) {
	var size int64

	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})

	return size, err
}

// parsePrismInstanceConfig reads Prism's configuration files and extracts game version, mod loader, and memory settings
func (m *Migrator) parsePrismInstanceConfig(instanceDir string) (gameVersion string, modLoader launcher.Loader, modLoaderVersion string, minMemory int, maxMemory int) {
	// Set defaults
	gameVersion = "1.20.1"
	modLoader = launcher.LoaderVanilla
	modLoaderVersion = ""
	minMemory = 1024 // Default 1GB
	maxMemory = 4096 // Default 4GB

	// First, try to parse mmc-pack.json or pack.json for mod loader info
	gameVersion, modLoader, modLoaderVersion = m.parsePackFile(instanceDir)

	// Then parse instance.cfg for memory settings and other config
	instanceCfgPath := filepath.Join(instanceDir, "instance.cfg")
	if data, err := os.ReadFile(instanceCfgPath); err == nil {
		config := parseInstanceConfig(string(data))

		// Extract memory settings
		if overrideMem, exists := config["OverrideMemory"]; exists && overrideMem == "true" {
			if minMem, exists := config["MinMemAlloc"]; exists {
				if parsed, err := strconv.Atoi(minMem); err == nil {
					minMemory = parsed
				}
			}
			if maxMem, exists := config["MaxMemAlloc"]; exists {
				if parsed, err := strconv.Atoi(maxMem); err == nil {
					maxMemory = parsed
				}
			}
		}
	}

	return gameVersion, modLoader, modLoaderVersion, minMemory, maxMemory
}

// parsePackFile reads mmc-pack.json or pack.json to extract mod loader information
func (m *Migrator) parsePackFile(instanceDir string) (gameVersion string, modLoader launcher.Loader, modLoaderVersion string) {
	gameVersion = "1.20.1"
	modLoader = launcher.LoaderVanilla
	modLoaderVersion = ""

	// Try pack.json first (newer format)
	packPath := filepath.Join(instanceDir, "pack.json")
	if data, err := os.ReadFile(packPath); err == nil {
		return m.parsePackJSON(data)
	}

	// Fall back to mmc-pack.json (older format)
	mmcPackPath := filepath.Join(instanceDir, "mmc-pack.json")
	if data, err := os.ReadFile(mmcPackPath); err == nil {
		return m.parsePackJSON(data)
	}

	return gameVersion, modLoader, modLoaderVersion
}

// parsePackJSON parses the JSON pack file to extract mod loader info
func (m *Migrator) parsePackJSON(data []byte) (gameVersion string, modLoader launcher.Loader, modLoaderVersion string) {
	var pack struct {
		Components []struct {
			UID           string `json:"uid"`
			Version       string `json:"version"`
			CachedName    string `json:"cachedName"`
			CachedVersion string `json:"cachedVersion"`
		} `json:"components"`
	}

	if err := json.Unmarshal(data, &pack); err != nil {
		return "1.20.1", launcher.LoaderVanilla, ""
	}

	// First pass: extract game version
	for _, component := range pack.Components {
		if component.UID == "net.minecraft" {
			gameVersion = component.Version
			break
		}
	}

	// Second pass: extract mod loader info and format versions properly
	for _, component := range pack.Components {
		switch component.UID {
		case "net.minecraftforge":
			modLoader = launcher.LoaderForge
			// Format Forge version as "gameVersion-forgeVersion"
			if gameVersion != "" && component.Version != "" {
				modLoaderVersion = fmt.Sprintf("%s-%s", gameVersion, component.Version)
			} else {
				modLoaderVersion = component.Version
			}
		case "net.fabricmc.fabric-loader":
			modLoader = launcher.LoaderFabric
			modLoaderVersion = component.Version
		case "org.quiltmc.quilt-loader":
			modLoader = launcher.LoaderQuilt
			modLoaderVersion = component.Version
		case "net.neoforged":
			modLoader = launcher.LoaderNeoForge
			modLoaderVersion = component.Version
		}
	}

	return gameVersion, modLoader, modLoaderVersion
}

// setupWinterPackPackwiz configures WinterPack with packwiz settings
func (m *Migrator) setupWinterPackPackwiz(instancePath string, inst *launcher.Instance) error {
	// Fetch the latest WinterPack modpack info from modpacks.dylan.lol
	modpacksURL := "https://modpacks.dylan.lol/modpacks.json"

	resp, err := http.Get(modpacksURL)
	if err != nil {
		return fmt.Errorf("fetch modpacks info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch modpacks info: HTTP %d", resp.StatusCode)
	}

	var modpacks []struct {
		ID             string `json:"id"`
		DisplayName    string `json:"displayName"`
		PackURL        string `json:"packUrl"`
		InstanceName   string `json:"instanceName"`
		Description    string `json:"description"`
		Author         string `json:"author"`
		Version        string `json:"version"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&modpacks); err != nil {
		return fmt.Errorf("parse modpacks JSON: %w", err)
	}

	// Find WinterPack in the modpacks
	var winterPack *struct {
		ID             string `json:"id"`
		DisplayName    string `json:"displayName"`
		PackURL        string `json:"packUrl"`
		InstanceName   string `json:"instanceName"`
		Description    string `json:"description"`
		Author         string `json:"author"`
		Version        string `json:"version"`
	}

	for _, modpack := range modpacks {
		if modpack.ID == "winterpack" || modpack.DisplayName == "WinterPack" {
			winterPack = &modpack
			break
		}
	}

	if winterPack == nil {
		return fmt.Errorf("WinterPack not found in modpacks list")
	}

	// Set up packwiz configuration for the instance
	inst.Config.Packwiz = launcher.PackwizInfo{
		URL:     winterPack.PackURL,
		Name:    winterPack.DisplayName,
		Author:  winterPack.Author,
		Version: winterPack.Version,
	}

	// Save the updated instance configuration
	if err := inst.WriteConfig(); err != nil {
		return fmt.Errorf("save updated instance config: %w", err)
	}

	return nil
}
