// Package launcher provides the necessary functions to start the game.
package launcher

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/dilllxd/theboyslauncher/internal/meta"
	"github.com/dilllxd/theboyslauncher/internal/network"
	env "github.com/dilllxd/theboyslauncher/pkg"
	"github.com/dilllxd/theboyslauncher/pkg/auth"
)

// Loader represents a game mod loader.
type Loader string

const (
	LoaderVanilla  Loader = "vanilla"
	LoaderFabric   Loader = "fabric"
	LoaderQuilt    Loader = "quilt"
	LoaderNeoForge Loader = "neoforge"
	LoaderForge    Loader = "forge"
)

// LaunchOptions represents configuration options when preparing an instance to be launched.
type LaunchOptions struct {
	Session auth.Session

	InstanceConfig
	QuickPlayServer    string
	QuickPlayWorld     string
	Demo               bool
	DisableMultiplayer bool
	DisableChat        bool

	skipAssets    bool
	skipLibraries bool
}

// An EventWatcher is a controller that can handle multiple types of events.
type EventWatcher func(event any)

// MetadataResolvedEvent is called when all metadata has been retrieved
type MetadataResolvedEvent struct{}

// LibrariesResolvedEvent is called when all game libraries have been identified and filtered.
type LibrariesResolvedEvent struct {
	Total int
}

// AssetsResolvedEvent is called when all game assets have been identified and filtered.
type AssetsResolvedEvent struct {
	Total int
}

// DownloadingEvent is called when a download has progressed.
type DownloadingEvent struct {
	Completed int
	Total     int
}

// PostProcessingEvent is called when, usually Forge, pre-processing begins.
type PostProcessingEvent struct{}

// LaunchStartedEvent is called when the game launch process begins
type LaunchStartedEvent struct{}

// JavaDownloadEvent is called when Java is being downloaded
type JavaDownloadEvent struct {
	Progress int
	Total    int
}

// FileDownloadEvent is called for individual file downloads
type FileDownloadEvent struct {
	Filename string
	Progress int
	Total    int
}

// LaunchCompletedEvent is called when the game successfully launches
type LaunchCompletedEvent struct{}

// A Runner is a controller which manages the starting of the game.
type Runner interface {
	Run(cmd *exec.Cmd) error
}

// ConsoleRunner is an implementation of Runner which logs game output to the console.
type ConsoleRunner struct{}

// NewConsoleRunner creates a new ConsoleRunner.
func NewConsoleRunner() *ConsoleRunner {
	return &ConsoleRunner{}
}

// Run implements the Runner interface for console execution.
func (cr *ConsoleRunner) Run(cmd *exec.Cmd) error {
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// GuiRunner runs a command silently without showing a console window and tracks the process.
type GuiRunner struct {
	Process *exec.Cmd
}

// NewGuiRunner creates a new GuiRunner.
func NewGuiRunner() *GuiRunner {
	return &GuiRunner{}
}

// Run implements the Runner interface for silent execution without console window.
func (gr *GuiRunner) Run(cmd *exec.Cmd) error {
	gr.Process = cmd

	// Platform-specific process configuration
	configureProcessAttributes(cmd)

	// Redirect stdout/stderr to prevent console output
	// On Unix systems, this helps detach from terminal
	// On Windows, this is handled by CREATE_NO_WINDOW
	if runtime.GOOS != "windows" {
		// Redirect output to null device to hide console output
		devNull, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
		if err == nil {
			cmd.Stdout = devNull
			cmd.Stderr = devNull
			// Don't set stdin as it might be needed for game input
		}
	}

	// Start the process without waiting for it to complete
	return cmd.Start()
}

// IsRunning returns true if the process is still running.
func (gr *GuiRunner) IsRunning() bool {
	if gr.Process == nil || gr.Process.Process == nil {
		return false
	}

	// Cross-platform process status check
	switch runtime.GOOS {
	case "windows":
		// On Windows, we can use the process exit code
		// If the process has exited, ProcessState will be non-nil
		return gr.Process.ProcessState == nil
	case "linux", "darwin":
		// On Unix-like systems, use signal 0 to check if process is alive
		err := gr.Process.Process.Signal(syscall.Signal(0))
		return err == nil
	default:
		// Default fallback - assume process is running if we can't determine status
		return gr.Process.ProcessState == nil
	}
}

// Kill terminates the running process.
func (gr *GuiRunner) Kill() error {
	if gr.Process == nil || gr.Process.Process == nil {
		return nil
	}

	return gr.Process.Process.Kill()
}

// Wait waits for the process to complete.
func (gr *GuiRunner) Wait() error {
	if gr.Process == nil {
		return nil
	}

	return gr.Process.Wait()
}

// Pid returns the process ID.
func (gr *GuiRunner) Pid() int {
	if gr.Process == nil || gr.Process.Process == nil {
		return 0
	}

	return gr.Process.Process.Pid
}

// A LaunchEnvironment represents the information needed to start the game.
type LaunchEnvironment struct {
	GameDir              string
	Java                 string
	MainClass            string
	Classpath            []string
	JavaArgs             []string
	GameArgs             []string
	NeedsPackwizInstaller bool
}

// Launch starts a LaunchEnvironment with the specified runner.
//
// The Java executable is checked and the classpath and command arguments are finalized.
func Launch(launchEnv LaunchEnvironment, runner Runner) error {
	info, err := os.Stat(launchEnv.Java)
	if err != nil {
		return fmt.Errorf("Java executable does not exist") //lint:ignore ST1005 should be capitalized
	}
	if info.IsDir() {
		return fmt.Errorf("Java binary is not executable") //lint:ignore ST1005 should be capitalized
	}

	// On Windows, check if the file has .exe extension
	// On Unix-like systems, check for executable permissions
	if runtime.GOOS == "windows" {
		if !strings.HasSuffix(strings.ToLower(launchEnv.Java), ".exe") {
			return fmt.Errorf("Java binary is not executable") //lint:ignore ST1005 should be capitalized
		}
	} else {
		// Unix-like systems: check executable permissions
		if info.Mode()&0111 == 0 {
			return fmt.Errorf("Java binary is not executable") //lint:ignore ST1005 should be capitalized
		}
	}

	javaArgs := append(launchEnv.JavaArgs, "-cp", strings.Join(launchEnv.Classpath, string(os.PathListSeparator)), launchEnv.MainClass)
	cmd := exec.Command(launchEnv.Java, append(javaArgs, launchEnv.GameArgs...)...)
	cmd.Dir = launchEnv.GameDir
	return runner.Run(cmd)
}

// Prepare prepares the instance to be launched, returning a LaunchEnvironment, with the provided options and sends events to watcher.
func Prepare(inst Instance, options LaunchOptions, watcher EventWatcher) (LaunchEnvironment, error) {
	var downloads []network.DownloadEntry

	version, err := fetchVersion(inst.Loader, inst.GameVersion, inst.LoaderVersion)
	if err != nil {
		return LaunchEnvironment{}, fmt.Errorf("retrieve metadata: %w", err)
	}

	launchEnv := LaunchEnvironment{
		GameDir:   inst.Dir(),
		Java:      options.Java,
		MainClass: version.MainClass,
	}
	watcher(MetadataResolvedEvent{})

	// Filter libraries, and add necessary artifact download entries
	if options.CustomJar == "" {
		version.Libraries = append(version.Libraries, version.Client())
	}

	installedLibs, requiredLibs := filterLibraries(version.Libraries)
	if !options.skipLibraries {
		for _, library := range requiredLibs {
			downloads = append(downloads, library.Artifact.DownloadEntry())
		}
	}
	watcher(LibrariesResolvedEvent{
		Total: len(installedLibs) + len(requiredLibs),
	})

	// Download asset index and add all necessary asset download entries
	assetIndex, err := meta.DownloadAssetIndex(version)
	if err != nil {
		return LaunchEnvironment{}, fmt.Errorf("retrieve asset index: %w", err)
	}
	if !options.skipAssets {
		downloads = append(downloads, assetIndex.DownloadEntries()...)
	}
	watcher(AssetsResolvedEvent{Total: len(assetIndex.Objects)})

	// If no Java path is present, fetch Mojang Java downloads
	var symlinks map[string]string
	javaDownloaded := false
	if launchEnv.Java == "" {
		manifest, err := meta.FetchJavaManifest(version.JavaVersion.Component)
		if err != nil {
			return LaunchEnvironment{}, fmt.Errorf("fetch Java manifest: %w", err)
		}
		var entries []network.DownloadEntry
		entries, symlinks = manifest.DownloadEntries(version.JavaVersion.Component)
		downloads = append(downloads, entries...)

		javaPath := filepath.Join(env.JavaDir, version.JavaVersion.Component, "bin", "java")
		if runtime.GOOS == "windows" {
			javaPath += ".exe"
		}
		launchEnv.Java = javaPath
		javaDownloaded = true
	}

	if err := download(downloads, symlinks, watcher); err != nil {
		return LaunchEnvironment{}, fmt.Errorf("download files: %w", err)
	}

	// Fetch Forge post processors, if any

	var processors []meta.ForgeProcessor
	switch inst.Loader {
	case LoaderForge:
		processors, err = meta.Forge.FetchPostProcessors(version.ID, version.LoaderID)
		if err != nil {
			return LaunchEnvironment{}, fmt.Errorf("fetch Forge post processors: %w", err)
		}
	case LoaderNeoForge:
		processors, err = meta.Neoforge.FetchPostProcessors(version.ID, version.LoaderID)
		if err != nil {
			return LaunchEnvironment{}, fmt.Errorf("fetch NeoForge post processors: %w", err)
		}
	}

	if len(processors) > 0 {
		watcher(PostProcessingEvent{})
		// Run any available processors
		if err := postProcess(launchEnv, processors); err != nil {
			return LaunchEnvironment{}, fmt.Errorf("run post processors: %w", err)
		}
	}

	launchEnv.JavaArgs, launchEnv.GameArgs = createArgs(launchEnv, version, options)

	// Finalize classpath
	for _, library := range append(installedLibs, requiredLibs...) {
		if library.SkipOnClasspath {
			continue
		}
		launchEnv.Classpath = append(launchEnv.Classpath, library.Artifact.RuntimePath())
	}
	if options.CustomJar != "" {
		launchEnv.Classpath = append(launchEnv.Classpath, options.CustomJar)
	}

	// Check if this is a packwiz instance and flag that installer should be run
	if shouldRunPackwizInstaller(inst) {
		launchEnv.NeedsPackwizInstaller = true
	}

	// Persist Java path if it was downloaded during preparation
	if javaDownloaded && launchEnv.Java != "" {
		inst.Config.Java = launchEnv.Java
		if err := inst.WriteConfig(); err != nil {
			return LaunchEnvironment{}, fmt.Errorf("failed to save instance configuration: %w", err)
		}
	}

	return launchEnv, nil
}

// download takes a list of download entries and executes them, reporting download events to watcher.
//
// It also creates all symlinks specified.
func download(entries []network.DownloadEntry, symlinks map[string]string, watcher EventWatcher) error {
	for link, target := range symlinks {
		if err := os.MkdirAll(filepath.Dir(link), 0755); err != nil {
			return fmt.Errorf("create directory for symlink %q: %w", link, err)
		}
		if err := os.Symlink(target, link); err != nil {
			// On Windows, symlink creation may fail due to permissions.
			// Fall back to copying the file if symlink creation fails.
			if runtime.GOOS == "windows" {
				if copyErr := copyFile(target, link); copyErr != nil {
					return fmt.Errorf("create symlink %q failed (fallback copy also failed): %w", link, copyErr)
				}
			} else {
				return fmt.Errorf("create symlink %q: %w", link, err)
			}
		}
	}
	if len(entries) > 0 {
		results := network.StartDownloadEntries(entries)
		i := 0
		for err := range results {
			if err != nil {
				return err
			}
			watcher(DownloadingEvent{
				Completed: i,
				Total:     len(entries),
			})
			i++
		}
	}
	return nil
}

// createArgs takes data from a launch environment, version metadata, and environment options to
// create a set of game and Java arguments to pass when starting the game.
func createArgs(launchEnv LaunchEnvironment, version meta.VersionMeta, options LaunchOptions) (java, game []string) {
	// Game arguments
	game = []string{
		"--username", options.Session.Username,
		"--accessToken", options.Session.AccessToken,
		"--userType", "msa",
		"--gameDir", launchEnv.GameDir,
		"--assetsDir", env.AssetsDir,
		"--assetIndex", version.AssetIndex.ID,
		"--version", version.ID,
		"--versionType", version.Type,
	}

	gameOptions, _ := os.ReadFile(filepath.Join(launchEnv.GameDir, "options.txt"))
	if !strings.Contains(string(gameOptions), "fullscreen:true") {
		game = append(game, "--width", strconv.Itoa(options.WindowResolution.Width))
		game = append(game, "--height", strconv.Itoa(options.WindowResolution.Height))
	}

	switch {
	case options.QuickPlayServer != "":
		game = append(game, "--quickPlayMultiplayer", options.QuickPlayServer)
	case options.QuickPlayWorld != "":
		game = append(game, "--quickPlaySingleplayer", options.QuickPlayWorld)
	}
	if options.Session.UUID != "" {
		game = append(game, "--uuid", options.Session.UUID)
	}
	if options.Demo {
		game = append(game, "--demo")
	}
	if options.DisableChat {
		game = append(game, "--disableChat")
	}
	if options.DisableMultiplayer {
		game = append(game, "--disableMultiplayer")
	}

	// Java arguments
	if runtime.GOOS == "darwin" {
		java = append(java, "-XstartOnFirstThread")
	}
	if options.MinMemory != 0 {
		java = append(java, fmt.Sprintf("-Xms%dm", options.MinMemory))
	}
	if options.MaxMemory != 0 {
		java = append(java, fmt.Sprintf("-Xmx%dm", options.MaxMemory))
	}
	if options.JavaArgs != "" {
		java = append(java, strings.Split(options.JavaArgs, " ")...)
	}
	for _, arg := range version.Arguments.Game {
		if arg, ok := arg.(string); ok {
			game = append(game, arg)
		}
	}
	for _, arg := range version.Arguments.Jvm {
		// Replace any templates
		if arg, ok := arg.(string); ok {
			arg = strings.ReplaceAll(arg, "${version_name}", version.ID)
			arg = strings.ReplaceAll(arg, "${library_directory}", env.LibrariesDir)
			arg = strings.ReplaceAll(arg, "${classpath_separator}", string(os.PathListSeparator))
			java = append(java, arg)
		}
	}
	return java, game
}

// postProcess takes all Forge post processors and runs them with specified launch environment.
func postProcess(launchEnv LaunchEnvironment, processors []meta.ForgeProcessor) error {
	for _, processor := range processors {
		cmd := exec.Command(launchEnv.Java, processor.JavaArgs...)
		cmd.Dir = launchEnv.GameDir
		cmd.Stderr = os.Stdout
		if err := cmd.Run(); err != nil {
			return err
		}
	}
	return nil
}

// fetchVersion returns a VersionMeta containing both information for the base game, and specified mod loader.
func fetchVersion(loader Loader, gameVersion string, loaderVersion string) (meta.VersionMeta, error) {
	var loaderMeta meta.VersionMeta
	var err error

	version, err := meta.FetchVersionMeta(gameVersion)
	if err != nil {
		return meta.VersionMeta{}, fmt.Errorf("retrieve version metadata: %w", err)
	}

	switch loader {
	case LoaderFabric, LoaderQuilt:
		api := meta.Fabric
		if loader == LoaderQuilt {
			api = meta.Quilt
		}
		loaderMeta, err = api.FetchMeta(version.ID, loaderVersion)
		if err != nil {
			return meta.VersionMeta{}, fmt.Errorf("retrieve Fabric/Quilt metadata: %w", err)
		}
	case LoaderNeoForge:
		if loaderVersion == "latest" {
			loaderVersion, err = meta.FetchNeoforgeVersion(version.ID)
			if err != nil {
				return meta.VersionMeta{}, fmt.Errorf("retrieve NeoForge version: %w", err)
			}
		}
		loaderMeta, _, err = meta.Neoforge.FetchMeta(loaderVersion)
		if err != nil {
			return meta.VersionMeta{}, fmt.Errorf("retrieve NeoForge metadata: %w", err)
		}
	case LoaderForge:
		if loaderVersion == "latest" {
			loaderVersion, err = meta.FetchForgeVersion(version.ID)
			if err != nil {
				return meta.VersionMeta{}, fmt.Errorf("retrieve Forge version: %w", err)
			}
		}
		loaderMeta, _, err = meta.Forge.FetchMeta(loaderVersion)
		if err != nil {
			return meta.VersionMeta{}, fmt.Errorf("retrieve Forge metadata: %w", err)
		}
	}

	return meta.MergeVersionMeta(version, loaderMeta), nil
}

// shouldRunPackwizInstaller checks if this is a packwiz instance that needs the installer run
func shouldRunPackwizInstaller(inst Instance) bool {
	// Check if packwiz installer exists in the instance directory
	installerPath := filepath.Join(inst.Dir(), "packwiz-installer-bootstrap.jar")
	if _, err := os.Stat(installerPath); os.IsNotExist(err) {
		// Not a packwiz instance, nothing to do
		return false
	}

	// Check if mods are already installed (non-empty mods directory)
	modsPath := filepath.Join(inst.Dir(), "mods")
	if modsInfo, err := os.Stat(modsPath); err == nil && modsInfo.IsDir() {
		if entries, err := os.ReadDir(modsPath); err == nil && len(entries) > 0 {
			// Mods already installed, skip installer
			return false
		}
	}

	// Needs packwiz installer
	return true
}

// copyFile copies a file from src to dst with proper error handling
func copyFile(src, dst string) error {
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
	if err != nil {
		return err
	}

	// Get source file info and copy permissions
	sourceInfo, err := os.Stat(src)
	if err != nil {
		return err
	}

	return os.Chmod(dst, sourceInfo.Mode())
}

