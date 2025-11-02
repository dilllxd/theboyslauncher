package packwiz

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/pelletier/go-toml/v2"
	"github.com/dilllxd/theboyslauncher/internal/cli/output"
	"github.com/dilllxd/theboyslauncher/pkg/launcher"
)

// PackFile represents the main pack.toml file
type PackFile struct {
	Name       string            `toml:"name"`
	Author     string            `toml:"author"`
	Version    string            `toml:"version"`
	PackFormat string            `toml:"pack-format"`
	Index      IndexRef          `toml:"index"`
	Versions   map[string]string `toml:"versions"`
}

// IndexRef represents the reference to the index file
type IndexRef struct {
	File string `toml:"file"`
	Hash string `toml:"hash"`
}

// IndexFile represents the index.toml file
type IndexFile struct {
	HashFormat string `toml:"hash-format"`
	Files      []FileEntry `toml:"files"`
}

// FileEntry represents a file entry in the index
type FileEntry struct {
	File     string `toml:"file"`
	Hash     string `toml:"hash"`
	Metafile bool   `toml:"metafile"`
	Preserve bool   `toml:"preserve,omitempty"`
}

// ModFile represents a .pw.toml mod metadata file
type ModFile struct {
	Name     string   `toml:"name"`
	Filename string   `toml:"filename"`
	Side     string   `toml:"side"`
	Download Download `toml:"download"`
	Update   Update   `toml:"update"`
}

// Download represents download information
type Download struct {
	URL        string `toml:"url"`
	HashFormat string `toml:"hash-format"`
	Hash       string `toml:"hash"`
}

// Update represents update information
type Update struct {
	Modrinth ModrinthUpdate `toml:"modrinth,omitempty"`
	CurseForge CurseForgeUpdate `toml:"curseforge,omitempty"`
}

// ModrinthUpdate represents Modrinth update info
type ModrinthUpdate struct {
	ModID      string   `toml:"mod-id"`
	Version    string   `toml:"version"`
}

// CurseForgeUpdate represents CurseForge update info
type CurseForgeUpdate struct {
	FileID    int `toml:"file-id"`
	ProjectID int `toml:"project-id"`
}

// Installer handles packwiz modpack installation
type Installer struct {
	instanceDir string
	verbose     bool
	httpClient  *http.Client
}

// NewInstaller creates a new packwiz installer
func NewInstaller(instanceDir string, verbose bool) *Installer {
	return &Installer{
		instanceDir: instanceDir,
		verbose:     verbose,
		httpClient:  &http.Client{},
	}
}


// downloadPackFile downloads and parses the pack.toml file
func (i *Installer) downloadPackFile(url string) (*PackFile, error) {
	resp, err := i.httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to download pack.toml: HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var packFile PackFile
	if err := toml.Unmarshal(data, &packFile); err != nil {
		return nil, fmt.Errorf("failed to parse pack.toml: %w", err)
	}

	return &packFile, nil
}



// CreateInstanceFromPack creates a new instance from a packwiz pack.toml URL
func (i *Installer) CreateInstanceFromPack(instanceName, packURL string) (*launcher.Instance, error) {
	// Parse the base URL
	baseURL, err := url.Parse(packURL)
	if err != nil {
		return nil, fmt.Errorf("invalid pack URL: %w", err)
	}

	// Remove pack.toml from path to get base directory
	// Use string manipulation instead of filepath.Dir to avoid OS-specific path separators
	path := baseURL.Path
	lastSlash := strings.LastIndex(path, "/")
	if lastSlash != -1 {
		baseURL.Path = path[:lastSlash] + "/"
	} else {
		baseURL.Path = "/"
	}

	// Download pack.toml
	packFile, err := i.downloadPackFile(packURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download pack.toml: %w", err)
	}

	if i.verbose {
		output.Info("Installing modpack: %s %s by %s", packFile.Name, packFile.Version, packFile.Author)
		output.Info("Minecraft version: %s", packFile.Versions["minecraft"])
		if loaderVersion, ok := packFile.Versions["fabric"]; ok {
			output.Info("Fabric version: %s", loaderVersion)
		} else if loaderVersion, ok := packFile.Versions["quilt"]; ok {
			output.Info("Quilt version: %s", loaderVersion)
		} else if loaderVersion, ok := packFile.Versions["forge"]; ok {
			output.Info("Forge version: %s", loaderVersion)
		} else if loaderVersion, ok := packFile.Versions["neoforge"]; ok {
			output.Info("NeoForge version: %s", loaderVersion)
		}
	}

	// Determine mod loader from pack file
	var modLoader launcher.Loader
	var loaderVersion string

	if version, ok := packFile.Versions["fabric"]; ok {
		modLoader = launcher.LoaderFabric
		loaderVersion = version
	} else if version, ok := packFile.Versions["quilt"]; ok {
		modLoader = launcher.LoaderQuilt
		loaderVersion = version
	} else if version, ok := packFile.Versions["forge"]; ok {
		modLoader = launcher.LoaderForge
		// For Forge, we need to use "latest" and let the launcher figure out the correct version
		// because packwiz uses simple version numbers while the launcher expects full versions
		loaderVersion = "latest"
		if i.verbose {
			output.Info("Note: Using latest Forge version for %s due to version format differences", version)
		}
	} else if version, ok := packFile.Versions["neoforge"]; ok {
		modLoader = launcher.LoaderNeoForge
		// Same for NeoForge
		loaderVersion = "latest"
		if i.verbose {
			output.Info("Note: Using latest NeoForge version for %s due to version format differences", version)
		}
	} else {
		modLoader = launcher.LoaderVanilla
		loaderVersion = ""
	}

	// Get Minecraft version
	mcVersion, ok := packFile.Versions["minecraft"]
	if !ok {
		return nil, fmt.Errorf("pack.toml does not specify minecraft version")
	}

	// Create instance with pack settings
	instance, err := launcher.CreateInstance(launcher.InstanceOptions{
		GameVersion:   mcVersion,
		Name:          instanceName,
		Loader:        modLoader,
		LoaderVersion: loaderVersion,
		Config: launcher.InstanceConfig{
			Packwiz: launcher.PackwizInfo{
				URL:     packURL,
				Version: packFile.Version,
				Name:    packFile.Name,
				Author:  packFile.Author,
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create instance: %w", err)
	}

	// Download packwiz installer bootstrap
	err = i.downloadPackwizInstaller(instance.Dir())
	if err != nil {
		return nil, fmt.Errorf("failed to download packwiz installer: %w", err)
	}

	if i.verbose {
		output.Info("Instance created. You can now run 'start %s --no-gui' to install the modpack.", instanceName)
	}

	return &instance, nil
}

// CheckForUpdates checks if a packwiz modpack has updates available
func CheckForUpdates(instance launcher.Instance) (bool, *PackFile, error) {
	// Skip if this is not a packwiz instance
	if instance.Config.Packwiz.URL == "" {
		return false, nil, nil
	}

	// Download the current pack.toml to check for updates
	installer := NewInstaller("", false)
	packFile, err := installer.downloadPackFile(instance.Config.Packwiz.URL)
	if err != nil {
		return false, nil, fmt.Errorf("failed to download pack.toml to check for updates: %w", err)
	}

	// Compare versions
	hasUpdate := packFile.Version != instance.Config.Packwiz.Version

	return hasUpdate, packFile, nil
}

// UpdateInstance updates a packwiz instance to the latest version
func UpdateInstance(instance *launcher.Instance, packFile *PackFile) error {
	// Update the packwiz information
	instance.Config.Packwiz.Version = packFile.Version
	instance.Config.Packwiz.Name = packFile.Name
	instance.Config.Packwiz.Author = packFile.Author

	// Save the updated configuration
	if err := instance.WriteConfig(); err != nil {
		return fmt.Errorf("failed to save updated instance configuration: %w", err)
	}

	return nil
}

