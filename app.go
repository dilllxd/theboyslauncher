package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	goRuntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/dilllxd/theboyslauncher/internal/meta"
	env "github.com/dilllxd/theboyslauncher/pkg"
	"github.com/dilllxd/theboyslauncher/pkg/auth"
	"github.com/dilllxd/theboyslauncher/pkg/launcher"
	"github.com/dilllxd/theboyslauncher/pkg/migration"
	"github.com/dilllxd/theboyslauncher/pkg/packwiz"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx              context.Context
	runningInstances map[string]*launcher.GuiRunner
	instanceMutex    sync.RWMutex
	launchProgress   LaunchProgress
	progressMutex    sync.RWMutex
}

// LaunchProgress tracks detailed launch progress
type LaunchProgress struct {
	Stage       string `json:"stage"`       // Current stage (e.g., "Downloading", "Preparing", "Launching")
	Progress    int    `json:"progress"`    // Percentage (0-100)
	Message     string `json:"message"`     // Detailed message
	TotalSteps  int    `json:"totalSteps"`  // Total steps in current stage
	CurrentStep int    `json:"currentStep"` // Current step in stage
	FileName    string `json:"fileName"`    // Current file being processed (if applicable)
}

// NewApp creates a new App application struct
func NewApp() *App {
	// Initialize auth client configuration
	auth.ClientID = "d10dfc60-1a42-44a8-b3af-edf4f5ee2c1f"
	auth.RedirectURI, _ = url.Parse("http://localhost:8000/signin")

	return &App{
		runningInstances: make(map[string]*launcher.GuiRunner),
		launchProgress: LaunchProgress{
			Stage:    "Idle",
			Progress: 0,
			Message:  "Ready to launch",
		},
	}
}

// startup is called when the app starts up.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// OnStartup is called when the app starts up.
func (a *App) OnStartup(ctx context.Context) {
	a.ctx = ctx
}

// OnDomReady is called after front-end resources have been loaded
func (a *App) OnDomReady(ctx context.Context) {
	// Here you can make your final initializations
	a.ctx = ctx
}

// OnBeforeClose is called when the application is about to quit,
// either by clicking the window close button or calling runtime.Quit.
// Returning true will cause the application to continue, false will continue shutdown as normal.
func (a *App) OnBeforeClose(ctx context.Context) (prevent bool) {
	return false
}

// OnShutdown is called when the application is shutting down
func (a *App) OnShutdown(ctx context.Context) {
	// Perform your teardown here
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// GetInstances returns a list of all instances
func (a *App) GetInstances() ([]launcher.Instance, error) {
	instances, err := launcher.FetchAllInstances()
	if err != nil {
		return nil, fmt.Errorf("failed to get instances: %w", err)
	}
	// Ensure we never return nil - return empty slice if no instances
	if instances == nil {
		return []launcher.Instance{}, nil
	}
	return instances, nil
}

// CreateInstance creates a new instance
func (a *App) CreateInstance(name, version, loader, loaderVersion string) error {
	var modLoader launcher.Loader
	switch loader {
	case "fabric":
		modLoader = launcher.LoaderFabric
	case "quilt":
		modLoader = launcher.LoaderQuilt
	case "vanilla", "":
		modLoader = launcher.LoaderVanilla
	case "neoforge":
		modLoader = launcher.LoaderNeoForge
	case "forge":
		modLoader = launcher.LoaderForge
	default:
		modLoader = launcher.LoaderVanilla
	}

	// Initialize progress tracking
	a.updateProgress("Creating Instance", "Creating new instance...", 5)

	// Create instance with default configuration
	inst, err := launcher.CreateInstance(launcher.InstanceOptions{
		GameVersion:   version,
		Name:          name,
		Loader:        modLoader,
		LoaderVersion: loaderVersion,
		Config: launcher.InstanceConfig{
			MinMemory: 1024,
			MaxMemory: 4096,
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
		return fmt.Errorf("failed to create instance: %w", err)
	}

	// Save the instance
	if err := inst.WriteConfig(); err != nil {
		return fmt.Errorf("failed to save instance configuration: %w", err)
	}

	// Create event watcher for progress tracking during preparation
	var totalDownloads int
	var completedDownloads int

	watcher := func(event any) {
		switch e := event.(type) {
		case launcher.LaunchStartedEvent:
			a.updateProgress("Preparing", "Preparing Minecraft components...", 10)
		case launcher.MetadataResolvedEvent:
			a.updateProgress("Preparing", "Resolving version metadata...", 15)
		case launcher.LibrariesResolvedEvent:
			a.updateProgress("Preparing", fmt.Sprintf("Resolved %d libraries", e.Total), 25)
		case launcher.AssetsResolvedEvent:
			a.updateProgress("Preparing", fmt.Sprintf("Resolved %d game assets", e.Total), 35)
		case launcher.DownloadingEvent:
			if totalDownloads == 0 {
				totalDownloads = e.Total
			}
			completedDownloads = e.Completed
			if totalDownloads > 0 {
				progress := 35 + int((float64(completedDownloads)/float64(totalDownloads))*60) // 35-95%
				a.updateDetailedProgress("Downloading",
					fmt.Sprintf("Downloading Minecraft files... (%d/%d)", completedDownloads, totalDownloads),
					progress, completedDownloads, totalDownloads, "")
			}
		case launcher.FileDownloadEvent:
			if totalDownloads > 0 {
				a.updateDetailedProgress("Downloading",
					fmt.Sprintf("Downloading %s...", e.Filename),
					35+int((float64(completedDownloads)/float64(totalDownloads))*60),
					completedDownloads, totalDownloads, e.Filename)
			}
		case launcher.PostProcessingEvent:
			a.updateProgress("Processing", "Processing downloaded files...", 95)
		case launcher.LaunchCompletedEvent:
			a.updateProgress("Completed", "Instance prepared successfully!", 100)
		}
	}

	a.updateProgress("Preparing", "Preparing Minecraft environment...", 15)

	// Prepare the launch environment (this downloads all Minecraft components with progress)
	_, err = launcher.Prepare(
		inst,
		launcher.LaunchOptions{
			Session:        auth.Session{Username: "Player"}, // Offline session for preparation
			InstanceConfig: inst.Config,
		},
		watcher,
	)

	if err != nil {
		return fmt.Errorf("failed to prepare Minecraft environment: %w", err)
	}

	// Mark as completed
	a.updateProgress("Completed", fmt.Sprintf("Instance '%s' created and prepared successfully!", name), 100)

	// Reset progress after a delay
	go func() {
		time.Sleep(3 * time.Second)
		a.updateProgress("Idle", "Ready to launch", 0)
	}()

	return nil
}

// DeleteInstance deletes an instance
func (a *App) DeleteInstance(name string) error {
	return launcher.RemoveInstance(name)
}

// RenameInstance renames an existing instance
func (a *App) RenameInstance(oldName string, newName string) error {
	// Validate new name
	if newName == "" {
		return fmt.Errorf("instance name cannot be empty")
	}

	// Check if new name already exists
	if launcher.DoesInstanceExist(newName) {
		return fmt.Errorf("instance with name '%s' already exists", newName)
	}

	// Rename the instance directory
	if err := launcher.RenameInstance(oldName, newName); err != nil {
		return fmt.Errorf("failed to rename instance: %w", err)
	}

	return nil
}

// LaunchInstance launches an instance with optional username
func (a *App) LaunchInstance(name, username string) error {
	// Fetch the instance
	inst, err := launcher.FetchInstance(name)
	if err != nil {
		return fmt.Errorf("failed to fetch instance: %w", err)
	}

	// Set up authentication session
	var session auth.Session
	if username != "" && username != "Player" {
		// Check if this is a Microsoft account by looking for it in the accounts manager
		if auth.GlobalAccountsManager != nil {
			if account, err := auth.GlobalAccountsManager.GetAccount(username); err == nil && account.IsValid() {
				// This is a valid Microsoft account, authenticate with it
				session, err = auth.GlobalAccountsManager.AuthenticateAs(username)
				if err != nil {
					// Failed to authenticate Microsoft account, fall back to offline
					session = auth.Session{
						Username: username,
					}
				}
			} else {
				// Not a valid Microsoft account, use offline mode
				session = auth.Session{
					Username: username,
				}
			}
		} else {
			// Accounts manager not initialized, try offline mode
			session = auth.Session{
				Username: username,
			}
		}
	} else {
		// No username provided or default "Player", try to authenticate with existing active account
		session, err = auth.Authenticate()
		if err != nil {
			// Fall back to offline mode with default username
			session = auth.Session{
				Username: "Player",
			}
		}
	}

	// Initialize launch progress
	a.updateProgress("Initializing", "Starting launch process...", 0)

	// Create event watcher for GUI feedback
	var totalDownloads int
	var completedDownloads int

	watcher := func(event any) {
		switch e := event.(type) {
		case launcher.LaunchStartedEvent:
			a.updateProgress("Preparing", "Initializing launch environment...", 5)
		case launcher.MetadataResolvedEvent:
			a.updateProgress("Preparing", "Resolving version metadata...", 10)
		case launcher.LibrariesResolvedEvent:
			a.updateProgress("Preparing", fmt.Sprintf("Resolved %d libraries", e.Total), 15)
		case launcher.AssetsResolvedEvent:
			a.updateProgress("Preparing", fmt.Sprintf("Resolved %d game assets", e.Total), 20)
		case launcher.DownloadingEvent:
			if totalDownloads == 0 {
				totalDownloads = e.Total
			}
			completedDownloads = e.Completed
			if totalDownloads > 0 {
				progress := 20 + int((float64(completedDownloads)/float64(totalDownloads))*60) // 20-80%
				a.updateDetailedProgress("Downloading",
					fmt.Sprintf("Downloading files... (%d/%d)", completedDownloads, totalDownloads),
					progress, completedDownloads, totalDownloads, "")
			}
		case launcher.FileDownloadEvent:
			if totalDownloads > 0 {
				_ = int((float64(e.Progress) / float64(e.Total)) * 100) // Calculate for potential future use
				a.updateDetailedProgress("Downloading",
					fmt.Sprintf("Downloading %s...", e.Filename),
					20+int((float64(completedDownloads)/float64(totalDownloads))*60),
					completedDownloads, totalDownloads, e.Filename)
			}
		case launcher.PostProcessingEvent:
			a.updateProgress("Processing", "Running post-processing steps...", 85)
		case launcher.LaunchCompletedEvent:
			a.updateProgress("Launching", "Starting Minecraft...", 95)
		}
	}

	// Prepare the launch environment
	launchEnv, err := launcher.Prepare(
		inst,
		launcher.LaunchOptions{
			Session:        session,
			InstanceConfig: inst.Config,
		},
		watcher,
	)

	if err != nil {
		return fmt.Errorf("failed to prepare launch: %w", err)
	}

	// Run packwiz installer if needed
	if launchEnv.NeedsPackwizInstaller {
		if err := packwiz.RunPackwizInstaller(launchEnv.GameDir, launchEnv.Java, false); err != nil {
			return fmt.Errorf("packwiz installer failed: %w", err)
		}
	}

	// Check if instance is already running
	a.instanceMutex.Lock()
	if existingRunner, exists := a.runningInstances[name]; exists && existingRunner.IsRunning() {
		a.instanceMutex.Unlock()
		return fmt.Errorf("instance %s is already running", name)
	}

	// Create and track the GUI runner
	guiRunner := launcher.NewGuiRunner()
	a.runningInstances[name] = guiRunner
	a.instanceMutex.Unlock()

	// Launch the instance silently
	err = launcher.Launch(launchEnv, guiRunner)
	if err != nil {
		// Remove from tracking if launch failed
		a.instanceMutex.Lock()
		delete(a.runningInstances, name)
		a.instanceMutex.Unlock()
		a.updateProgress("Error", fmt.Sprintf("Launch failed: %v", err), 0)
		return fmt.Errorf("failed to launch instance: %w", err)
	}

	// Mark as launched successfully
	a.updateProgress("Launched", fmt.Sprintf("%s is now running!", name), 100)

	// Start a goroutine to monitor the process and clean up when it exits
	go func() {
		guiRunner.Wait()
		a.instanceMutex.Lock()
		delete(a.runningInstances, name)
		a.instanceMutex.Unlock()
		// Reset progress when game exits
		a.updateProgress("Idle", "Ready to launch", 0)
	}()

	return nil
}

// ShowDialog shows a native dialog
func (a *App) ShowDialog(title, message string) {
	runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   title,
		Message: message,
	})
}

// ShowConfirmDialog shows a confirmation dialog
func (a *App) ShowConfirmDialog(title, message string) bool {
	result, _ := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.QuestionDialog,
		Title:   title,
		Message: message,
	})
	return result == "Yes"
}

// GetRunningInstances returns a list of currently running instance names
func (a *App) GetRunningInstances() []string {
	a.instanceMutex.RLock()
	defer a.instanceMutex.RUnlock()

	var running []string
	for name, runner := range a.runningInstances {
		if runner.IsRunning() {
			running = append(running, name)
		}
	}
	return running
}

// IsInstanceRunning returns true if the specified instance is currently running
func (a *App) IsInstanceRunning(name string) bool {
	a.instanceMutex.RLock()
	defer a.instanceMutex.RUnlock()

	if runner, exists := a.runningInstances[name]; exists {
		return runner.IsRunning()
	}
	return false
}

// KillInstance terminates the specified running instance
func (a *App) KillInstance(name string) error {
	a.instanceMutex.Lock()
	defer a.instanceMutex.Unlock()

	if runner, exists := a.runningInstances[name]; exists {
		if !runner.IsRunning() {
			delete(a.runningInstances, name)
			return fmt.Errorf("instance %s is not running", name)
		}

		if err := runner.Kill(); err != nil {
			return fmt.Errorf("failed to kill instance %s: %w", name, err)
		}

		// Remove from tracking
		delete(a.runningInstances, name)
		return nil
	}

	return fmt.Errorf("instance %s is not running", name)
}

// updateProgress updates the launch progress and notifies frontend
func (a *App) updateProgress(stage, message string, progress int) {
	a.progressMutex.Lock()
	defer a.progressMutex.Unlock()

	a.launchProgress.Stage = stage
	a.launchProgress.Message = message
	a.launchProgress.Progress = progress

	// Emit progress event to frontend
	runtime.EventsEmit(a.ctx, "launchProgress", a.launchProgress)
}

// updateDetailedProgress updates progress with step information
func (a *App) updateDetailedProgress(stage, message string, progress, currentStep, totalSteps int, fileName string) {
	a.progressMutex.Lock()
	defer a.progressMutex.Unlock()

	a.launchProgress.Stage = stage
	a.launchProgress.Message = message
	a.launchProgress.Progress = progress
	a.launchProgress.CurrentStep = currentStep
	a.launchProgress.TotalSteps = totalSteps
	a.launchProgress.FileName = fileName

	// Emit progress event to frontend
	runtime.EventsEmit(a.ctx, "launchProgress", a.launchProgress)
}

// GetLaunchProgress returns the current launch progress
func (a *App) GetLaunchProgress() LaunchProgress {
	a.progressMutex.RLock()
	defer a.progressMutex.RUnlock()
	return a.launchProgress
}

// LoaderVersion represents a mod loader version
type LoaderVersion struct {
	ID      string `json:"id"`
	Stable  bool   `json:"stable"`
	Version string `json:"version"`
	Name    string `json:"name"`
}

// GetLoaderVersions returns available versions for a specific mod loader
func (a *App) GetLoaderVersions(loader, minecraftVersion string) ([]LoaderVersion, error) {
	switch loader {
	case "fabric":
		return a.getFabricVersions(minecraftVersion)
	case "quilt":
		return a.getQuiltVersions(minecraftVersion)
	case "forge":
		return a.getForgeVersions(minecraftVersion)
	case "neoforge":
		return a.getNeoforgeVersions(minecraftVersion)
	default:
		return nil, fmt.Errorf("unsupported loader: %s", loader)
	}
}

// Modpack represents a modpack from the remote repository
type Modpack struct {
	ID             string   `json:"id"`
	DisplayName    string   `json:"displayName"`
	PackURL        string   `json:"packUrl"`
	InstanceName   string   `json:"instanceName"`
	Description    string   `json:"description"`
	Author         string   `json:"author"`
	Tags           []string `json:"tags"`
	LastUpdated    string   `json:"lastUpdated"`
	Category       string   `json:"category"`
	Default        bool     `json:"default"`
	MinRAM         int      `json:"minRam"`
	RecommendedRAM int      `json:"recommendedRam"`
	Changelog      string   `json:"changelog"`
}

// GetModpacks fetches the list of available modpacks
func (a *App) GetModpacks() ([]Modpack, error) {
	url := "https://modpacks.dylan.lol/modpacks.json"

	// Use existing network functionality or implement a simple HTTP client
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch modpacks: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch modpacks: HTTP %d", resp.StatusCode)
	}

	var modpacks []Modpack
	if err := json.NewDecoder(resp.Body).Decode(&modpacks); err != nil {
		return nil, fmt.Errorf("failed to parse modpacks JSON: %w", err)
	}

	return modpacks, nil
}

// VersionFilters represents the version type filters sent from the frontend
type VersionFilters struct {
	Release  bool `json:"release"`
	Snapshot bool `json:"snapshot"`
	Beta     bool `json:"beta"`
	Alpha    bool `json:"alpha"`
}

// MinecraftVersion represents a Minecraft version
type MinecraftVersion struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	DisplayName string `json:"displayName"`
	ReleaseTime string `json:"releaseTime"`
}

// GetMinecraftVersions fetches available Minecraft versions from Mojang's API
// filters controls which version types to include in the response
func (a *App) GetMinecraftVersions(filters VersionFilters) ([]MinecraftVersion, error) {
	manifest, err := meta.FetchVersionManifest()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch version manifest: %w", err)
	}

	var versions []MinecraftVersion

	// Filter versions based on user selections
	for _, version := range manifest.Versions {
		var shouldInclude bool
		var displayName string

		switch version.Type {
		case "release":
			shouldInclude = filters.Release
			displayName = version.ID
		case "snapshot":
			shouldInclude = filters.Snapshot
			displayName = version.ID + " (Snapshot)"
		case "old_beta":
			shouldInclude = filters.Beta
			displayName = version.ID + " (Beta)"
		case "old_alpha":
			shouldInclude = filters.Alpha
			displayName = version.ID + " (Alpha)"
		default:
			// Future-proofing: handle any unknown version types that might appear
			shouldInclude = false
			displayName = version.ID + " (" + version.Type + ")"
		}

		if shouldInclude {
			versions = append(versions, MinecraftVersion{
				ID:          version.ID,
				Type:        version.Type,
				DisplayName: displayName,
				ReleaseTime: version.ReleaseTime.Format(time.RFC3339),
			})
		}
	}

	return versions, nil
}

// InstallModpack creates and configures an instance from a modpack using packwiz
func (a *App) InstallModpack(modpack Modpack, customInstanceName string) error {
	instanceName := modpack.InstanceName
	if customInstanceName != "" {
		instanceName = customInstanceName
	}

	// Check if instance already exists
	if launcher.DoesInstanceExist(instanceName) {
		return fmt.Errorf("instance '%s' already exists", instanceName)
	}

	// Initialize progress tracking
	a.updateProgress("Creating Instance", "Creating instance from modpack...", 5)

	// Create packwiz installer
	installer := packwiz.NewInstaller("", false)

	// Create instance from pack data - this will parse the pack.toml and determine
	// the correct Minecraft version, mod loader, and loader version
	instance, err := installer.CreateInstanceFromPack(instanceName, modpack.PackURL)
	if err != nil {
		return fmt.Errorf("failed to create instance from modpack: %w", err)
	}

	// Update the instance with additional metadata from the modpack info
	// Note: instance.Config.Packwiz.Version is already set correctly by CreateInstanceFromPack
	// We only need to update the display name and author from the modpack info
	instance.Config.Packwiz.URL = modpack.PackURL
	instance.Config.Packwiz.Name = modpack.DisplayName
	instance.Config.Packwiz.Author = modpack.Author
	// Keep the existing version from pack.toml - don't overwrite with LoaderVersion

	// Apply memory settings from the modpack if specified
	if modpack.MinRAM > 0 {
		instance.Config.MinMemory = modpack.MinRAM
	}
	if modpack.RecommendedRAM > 0 {
		instance.Config.MaxMemory = modpack.RecommendedRAM
	}

	// Save the updated instance configuration
	if err := instance.WriteConfig(); err != nil {
		return fmt.Errorf("failed to save instance configuration: %w", err)
	}

	// Create event watcher for progress tracking during preparation
	var totalDownloads int
	var completedDownloads int

	watcher := func(event any) {
		switch e := event.(type) {
		case launcher.LaunchStartedEvent:
			a.updateProgress("Preparing", "Preparing Minecraft components...", 10)
		case launcher.MetadataResolvedEvent:
			a.updateProgress("Preparing", "Resolving version metadata...", 15)
		case launcher.LibrariesResolvedEvent:
			a.updateProgress("Preparing", fmt.Sprintf("Resolved %d libraries", e.Total), 25)
		case launcher.AssetsResolvedEvent:
			a.updateProgress("Preparing", fmt.Sprintf("Resolved %d game assets", e.Total), 35)
		case launcher.DownloadingEvent:
			if totalDownloads == 0 {
				totalDownloads = e.Total
			}
			completedDownloads = e.Completed
			if totalDownloads > 0 {
				progress := 35 + int((float64(completedDownloads)/float64(totalDownloads))*50) // 35-85%
				a.updateDetailedProgress("Downloading",
					fmt.Sprintf("Downloading Minecraft files... (%d/%d)", completedDownloads, totalDownloads),
					progress, completedDownloads, totalDownloads, "")
			}
		case launcher.FileDownloadEvent:
			if totalDownloads > 0 {
				a.updateDetailedProgress("Downloading",
					fmt.Sprintf("Downloading %s...", e.Filename),
					35+int((float64(completedDownloads)/float64(totalDownloads))*50),
					completedDownloads, totalDownloads, e.Filename)
			}
		case launcher.PostProcessingEvent:
			a.updateProgress("Processing", "Processing downloaded files...", 90)
		case launcher.LaunchCompletedEvent:
			a.updateProgress("Installing Mods", "Installing modpack mods...", 95)
		}
	}

	a.updateProgress("Preparing", "Preparing Minecraft environment...", 15)

	// Prepare the launch environment (this downloads all Minecraft components with progress)
	_, err = launcher.Prepare(
		*instance,
		launcher.LaunchOptions{
			Session:        auth.Session{Username: "Player"}, // Offline session for preparation
			InstanceConfig: instance.Config,
		},
		watcher,
	)

	if err != nil {
		return fmt.Errorf("failed to prepare Minecraft environment: %w", err)
	}

	// Run packwiz installer in nogui mode to download all mods
	a.updateProgress("Installing Mods", "Installing modpack mods. This may take several minutes...", 90)
	if err := installer.RunPackwizInstallerWithURL(instance.Dir(), modpack.PackURL, true); err != nil {
		return fmt.Errorf("packwiz installer failed: %w", err)
	}

	// Mark as completed
	a.updateProgress("Completed", fmt.Sprintf("Modpack '%s' installed successfully!", instanceName), 100)

	// Reset progress after a delay
	go func() {
		time.Sleep(3 * time.Second)
		a.updateProgress("Idle", "Ready to launch", 0)
	}()

	return nil
}

// getFabricVersions returns available Fabric versions for a Minecraft version
func (a *App) getFabricVersions(minecraftVersion string) ([]LoaderVersion, error) {
	versions, err := meta.Fabric.FetchVersions()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Fabric versions: %w", err)
	}

	var result []LoaderVersion
	for _, version := range versions {
		result = append(result, LoaderVersion{
			ID:      version.Version,
			Stable:  version.Stable,
			Version: version.Version,
			Name:    version.Version,
		})
	}

	return result, nil
}

// getQuiltVersions returns available Quilt versions for a Minecraft version
func (a *App) getQuiltVersions(minecraftVersion string) ([]LoaderVersion, error) {
	versions, err := meta.Quilt.FetchVersions()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Quilt versions: %w", err)
	}

	var result []LoaderVersion
	for _, version := range versions {
		result = append(result, LoaderVersion{
			ID:      version.Version,
			Stable:  version.Stable,
			Version: version.Version,
			Name:    version.Version,
		})
	}

	return result, nil
}

// getForgeVersions returns available Forge versions for a Minecraft version
func (a *App) getForgeVersions(minecraftVersion string) ([]LoaderVersion, error) {
	versions, err := meta.FetchForgeVersions(minecraftVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Forge versions: %w", err)
	}

	var result []LoaderVersion
	for _, version := range versions {
		result = append(result, LoaderVersion{
			ID:      version.Version,
			Stable:  version.Stable,
			Version: version.Version,
			Name:    version.Version,
		})
	}

	return result, nil
}

// getNeoforgeVersions returns available NeoForge versions for a Minecraft version
func (a *App) getNeoforgeVersions(minecraftVersion string) ([]LoaderVersion, error) {
	versions, err := meta.FetchNeoforgeVersions(minecraftVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch NeoForge versions: %w", err)
	}

	var result []LoaderVersion
	for _, version := range versions {
		result = append(result, LoaderVersion{
			ID:      version.Version,
			Stable:  version.Stable,
			Version: version.Version,
			Name:    version.Version,
		})
	}

	return result, nil
}

// AccountInfo represents account information for the frontend
type AccountInfo struct {
	ID         string `json:"id"`          // UUID
	Username   string `json:"username"`    // Minecraft username
	UUID       string `json:"uuid"`        // Minecraft UUID
	LastUsed   string `json:"last_used"`   // Last used timestamp
	IsActive   bool   `json:"is_active"`   // Whether this is the active account
	NeedsLogin bool   `json:"needs_login"` // Whether token needs refresh
}

// GetAccounts returns all accounts for the account manager
func (a *App) GetAccounts() ([]AccountInfo, error) {
	if auth.GlobalAccountsManager == nil {
		if err := auth.InitAccountsManager(); err != nil {
			return []AccountInfo{}, fmt.Errorf("initialize accounts manager: %w", err)
		}
	}

	accounts := auth.GlobalAccountsManager.ListAccounts()
	accountInfos := make([]AccountInfo, 0, len(accounts))

	for username, account := range accounts {
		accountInfos = append(accountInfos, AccountInfo{
			ID:         account.ID,
			Username:   username,
			UUID:       account.UUID,
			LastUsed:   account.LastUsed.Format(time.RFC3339),
			IsActive:   auth.GlobalAccountsManager.ActiveAccount == username,
			NeedsLogin: !account.IsValid(),
		})
	}

	return accountInfos, nil
}

// GetActiveAccount returns the currently active account
func (a *App) GetActiveAccount() (*AccountInfo, error) {
	if auth.GlobalAccountsManager == nil {
		if err := auth.InitAccountsManager(); err != nil {
			return nil, fmt.Errorf("initialize accounts manager: %w", err)
		}
	}

	if auth.GlobalAccountsManager.ActiveAccount == "" {
		return nil, fmt.Errorf("no active account")
	}

	account, err := auth.GlobalAccountsManager.GetActiveAccount()
	if err != nil {
		return nil, err
	}

	return &AccountInfo{
		ID:         account.ID,
		Username:   account.Username,
		UUID:       account.UUID,
		LastUsed:   account.LastUsed.Format(time.RFC3339),
		IsActive:   true,
		NeedsLogin: !account.IsValid(),
	}, nil
}

// SetActiveAccount sets the active account
func (a *App) SetActiveAccount(username string) error {
	if auth.GlobalAccountsManager == nil {
		if err := auth.InitAccountsManager(); err != nil {
			return fmt.Errorf("initialize accounts manager: %w", err)
		}
	}

	return auth.GlobalAccountsManager.SetActiveAccount(username)
}

// RemoveAccount removes an account from the accounts manager
func (a *App) RemoveAccount(username string) error {
	if auth.GlobalAccountsManager == nil {
		if err := auth.InitAccountsManager(); err != nil {
			return fmt.Errorf("initialize accounts manager: %w", err)
		}
	}

	return auth.GlobalAccountsManager.RemoveAccount(username)
}

// GlobalSettings represents launcher-wide configuration
type GlobalSettings struct {
	JavaPath         string `json:"javaPath"`         // Default Java executable path
	DefaultMinMemory int    `json:"defaultMinMemory"` // Default minimum memory in MB
	DefaultMaxMemory int    `json:"defaultMaxMemory"` // Default maximum memory in MB
	WindowWidth      int    `json:"windowWidth"`      // Default window width
	WindowHeight     int    `json:"windowHeight"`     // Default window height
	AutoUpdate       bool   `json:"autoUpdate"`       // Enable automatic updates
	CloseOnLaunch    bool   `json:"closeOnLaunch"`    // Close launcher on game launch
}

// OpenBrowser opens a URL in the user's default browser
func (a *App) OpenBrowser(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}

// OpenDirectory opens a directory in the native file explorer
func (a *App) OpenDirectory(path string) error {
	if path == "" {
		return fmt.Errorf("empty path provided")
	}

	// Check if directory exists, if not, try to create it
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.MkdirAll(path, 0755); err != nil {
			return fmt.Errorf("create directory: %w", err)
		}
	}

	// Open directory using OS-specific methods
	switch goRuntime.GOOS {
	case "windows":
		// On Windows, use "explorer" command
		// Note: explorer often returns exit status 1 even when successful
		cmd := exec.Command("explorer", path)
		err := cmd.Run()
		// Ignore exit status 1 on Windows as explorer often returns this even when successful
		if err != nil && err.Error() != "exit status 1" {
			return err
		}
		return nil
	case "darwin":
		// On macOS, use "open" command
		cmd := exec.Command("open", path)
		return cmd.Run()
	case "linux":
		// On Linux, try xdg-open first (standard desktop environments)
		if _, err := exec.LookPath("xdg-open"); err == nil {
			cmd := exec.Command("xdg-open", path)
			if err := cmd.Run(); err == nil {
				return nil
			}
		}
		// Fallback for Linux: try common file managers
		fileManagers := []string{"nautilus", "dolphin", "thunar", "pcmanfm", "caja"}
		for _, fm := range fileManagers {
			if _, err := exec.LookPath(fm); err == nil {
				cmd := exec.Command(fm, path)
				if err := cmd.Run(); err == nil {
					return nil
				}
			}
		}
		// Last resort: try xdg-open even if we couldn't find it in PATH
		cmd := exec.Command("xdg-open", path)
		return cmd.Run()
	default:
		// For other OS, try xdg-open as a last resort
		cmd := exec.Command("xdg-open", path)
		return cmd.Run()
	}
}

// OpenLauncherDirectory opens the main launcher directory
func (a *App) OpenLauncherDirectory() error {
	return a.OpenDirectory(env.RootDir)
}

// OpenInstanceDirectory opens a specific instance directory
func (a *App) OpenInstanceDirectory(instanceName string) error {
	if instanceName == "" {
		return fmt.Errorf("empty instance name provided")
	}

	instancePath := filepath.Join(env.InstancesDir, instanceName)
	return a.OpenDirectory(instancePath)
}

// GetGlobalSettings returns the global launcher settings
func (a *App) GetGlobalSettings() (GlobalSettings, error) {
	// For now, return default settings
	// TODO: Load from config file in the future
	return GlobalSettings{
		JavaPath:         "",
		DefaultMinMemory: 1024,
		DefaultMaxMemory: 4096,
		WindowWidth:      854,
		WindowHeight:     480,
		AutoUpdate:       true,
		CloseOnLaunch:    false,
	}, nil
}

// SaveGlobalSettings saves the global launcher settings
func (a *App) SaveGlobalSettings(settings GlobalSettings) error {
	// TODO: Save to config file in the future
	// For now, just validate the settings
	if settings.DefaultMinMemory <= 0 || settings.DefaultMaxMemory <= 0 {
		return fmt.Errorf("memory values must be positive")
	}
	if settings.DefaultMaxMemory < settings.DefaultMinMemory {
		return fmt.Errorf("max memory cannot be less than min memory")
	}
	return nil
}

// GetInstanceSettings returns the configuration for a specific instance
func (a *App) GetInstanceSettings(name string) (launcher.InstanceConfig, error) {
	inst, err := launcher.FetchInstance(name)
	if err != nil {
		return launcher.InstanceConfig{}, fmt.Errorf("failed to fetch instance: %w", err)
	}
	return inst.Config, nil
}

// SaveInstanceSettings saves the configuration for a specific instance
func (a *App) SaveInstanceSettings(name string, config launcher.InstanceConfig) error {
	inst, err := launcher.FetchInstance(name)
	if err != nil {
		return fmt.Errorf("failed to fetch instance: %w", err)
	}

	// Validate settings
	if config.MinMemory <= 0 || config.MaxMemory <= 0 {
		return fmt.Errorf("memory values must be positive")
	}
	if config.MaxMemory < config.MinMemory {
		return fmt.Errorf("max memory cannot be less than min memory")
	}

	inst.Config = config
	return inst.WriteConfig()
}

// LoginToDeviceCode initiates device code login flow
func (a *App) LoginToDeviceCode() (map[string]interface{}, error) {
	deviceCode, err := auth.FetchDeviceCode()
	if err != nil {
		return nil, fmt.Errorf("fetch device code: %w", err)
	}

	return map[string]interface{}{
		"user_code":        deviceCode.UserCode,
		"verification_uri": deviceCode.VerificationURI,
		"message":          deviceCode.Message,
		"expires_in":       deviceCode.ExpiresIn,
		"interval":         deviceCode.Interval,
		"device_code":      deviceCode.DeviceCode,
	}, nil
}

// CompleteDeviceCodeLogin completes the device code login flow
func (a *App) CompleteDeviceCodeLogin(deviceCode string) error {
	deviceCodeResp := auth.DeviceCodeResponse{
		DeviceCode: deviceCode,
	}

	_, err := auth.AuthenticateWithCode(deviceCodeResp)
	if err != nil {
		return fmt.Errorf("complete device code authentication: %w", err)
	}

	// Accounts manager will be automatically initialized and account added during authentication
	return nil
}

// ShowOfflineLoginDialog shows a custom offline login dialog
func (a *App) ShowOfflineLoginDialog() (map[string]interface{}, error) {
	// This will be handled in the frontend with a custom modal
	// For now, return a simple response that triggers frontend dialog
	return map[string]interface{}{
		"show_dialog": true,
		"title":       "Offline Mode",
		"message":     "Enter username for offline play",
	}, nil
}

// LoginOffline logs in with offline mode using the provided username
func (a *App) LoginOffline(username string) error {
	if username == "" {
		return fmt.Errorf("username cannot be empty")
	}

	// Create a simple offline account entry
	offlineAccount := &auth.Account{
		ID:       "offline-" + strings.ToLower(username),
		Username: username,
		UUID:     "", // Will be generated by Minecraft launcher
		LastUsed: time.Now(),
	}

	if auth.GlobalAccountsManager == nil {
		if err := auth.InitAccountsManager(); err != nil {
			return fmt.Errorf("initialize accounts manager: %w", err)
		}
	}

	// Store offline account with a special prefix
	auth.GlobalAccountsManager.Accounts[username+" (Offline)"] = offlineAccount
	auth.GlobalAccountsManager.ActiveAccount = username + " (Offline)"

	return auth.GlobalAccountsManager.SaveAccounts()
}

// MigrationInfo contains information about available Prism installations
type MigrationInfo struct {
	CanMigrate    bool     `json:"can_migrate"`
	Installations []string `json:"installations"`
	EstimatedSize int64    `json:"estimated_size"`
	InstanceCount int      `json:"instance_count"`
}

// DetectMigration checks if Prism installations are available for migration
func (a *App) DetectMigration() (MigrationInfo, error) {
	installations, err := migration.DetectPrismInstallations()
	if err != nil {
		return MigrationInfo{}, fmt.Errorf("detect Prism installations: %w", err)
	}

	info := MigrationInfo{
		CanMigrate:    len(installations) > 0,
		Installations: installations,
	}

	if len(installations) > 0 {
		// Use the first installation to estimate size and count instances
		migrator, err := migration.NewMigrator(installations[0])
		if err == nil {
			if size, err := migrator.GetMigrationSize(); err == nil {
				info.EstimatedSize = size
			}

			// Count instances
			if instances, err := os.ReadDir(filepath.Join(installations[0], "instances")); err == nil {
				count := 0
				for _, inst := range instances {
					if inst.IsDir() {
						count++
					}
				}
				info.InstanceCount = count
			}
		}
	}

	return info, nil
}

// StartMigration begins the migration process from the specified Prism path
func (a *App) StartMigration(prismPath string) (*migration.MigrationResult, error) {
	migrator, err := migration.NewMigrator(prismPath)
	if err != nil {
		return nil, fmt.Errorf("create migrator: %w", err)
	}

	return migrator.StartMigration()
}

// InstanceUpdateInfo contains update information for an instance
type InstanceUpdateInfo struct {
	Name           string `json:"name"`
	HasUpdate      bool   `json:"has_update"`
	NewVersion     string `json:"new_version,omitempty"`
	CurrentVersion string `json:"current_version,omitempty"`
}

// CheckInstanceUpdates checks all instances for packwiz updates
func (a *App) CheckInstanceUpdates() ([]InstanceUpdateInfo, error) {
	instances, err := launcher.FetchAllInstances()
	if err != nil {
		return nil, fmt.Errorf("list instances: %w", err)
	}

	var updateInfos []InstanceUpdateInfo

	for _, instance := range instances {

		// Only check packwiz instances
		if instance.Config.Packwiz.URL == "" {
			continue
		}

		hasUpdate, packFile, err := packwiz.CheckForUpdates(instance)
		if err != nil {
			// Log error but continue checking other instances
			fmt.Printf("Failed to check updates for %s: %v\n", instance.Name, err)
			continue
		}

		updateInfo := InstanceUpdateInfo{
			Name:           instance.Name,
			HasUpdate:      hasUpdate,
			CurrentVersion: instance.Config.Packwiz.Version,
		}

		if hasUpdate && packFile != nil {
			updateInfo.NewVersion = packFile.Version
		}

		updateInfos = append(updateInfos, updateInfo)
	}

	return updateInfos, nil
}

// CheckInstanceUpdate checks a specific instance for updates
func (a *App) CheckInstanceUpdate(instanceName string) (InstanceUpdateInfo, error) {
	instance, err := launcher.FetchInstance(instanceName)
	if err != nil {
		return InstanceUpdateInfo{}, fmt.Errorf("fetch instance: %w", err)
	}

	// Only packwiz instances can have updates
	if instance.Config.Packwiz.URL == "" {
		return InstanceUpdateInfo{
			Name:      instanceName,
			HasUpdate: false,
		}, nil
	}

	hasUpdate, packFile, err := packwiz.CheckForUpdates(instance)
	if err != nil {
		return InstanceUpdateInfo{}, fmt.Errorf("check updates: %w", err)
	}

	updateInfo := InstanceUpdateInfo{
		Name:           instanceName,
		HasUpdate:      hasUpdate,
		CurrentVersion: instance.Config.Packwiz.Version,
	}

	if hasUpdate && packFile != nil {
		updateInfo.NewVersion = packFile.Version
	}

	return updateInfo, nil
}

// UpdateInstance updates a packwiz instance to the latest version
func (a *App) UpdateInstance(instanceName string) error {
	instance, err := launcher.FetchInstance(instanceName)
	if err != nil {
		return fmt.Errorf("fetch instance: %w", err)
	}

	// Check for updates first
	hasUpdate, packFile, err := packwiz.CheckForUpdates(instance)
	if err != nil {
		return fmt.Errorf("check for updates: %w", err)
	}

	if !hasUpdate {
		return fmt.Errorf("no updates available")
	}

	// Apply the update (this includes saving the configuration)
	if err := packwiz.UpdateInstance(&instance, packFile); err != nil {
		return fmt.Errorf("update instance: %w", err)
	}

	return nil
}
