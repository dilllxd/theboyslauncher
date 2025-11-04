package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/alecthomas/kong"
	"github.com/fatih/color"
	"github.com/schollz/progressbar/v3"
	"github.com/dilllxd/theboyslauncher/internal/cli/output"
	"github.com/dilllxd/theboyslauncher/pkg/auth"
	"github.com/dilllxd/theboyslauncher/pkg/launcher"
	"github.com/dilllxd/theboyslauncher/pkg/packwiz"
)

func watcher(verbosity int) launcher.EventWatcher {
	var bar = progressbar.NewOptions(0,
		progressbar.OptionSetDescription(output.Translate("start.launch.downloading")),
		progressbar.OptionSetWriter(os.Stdout),
		progressbar.OptionThrottle(65*time.Millisecond),
		progressbar.OptionShowCount(),
		progressbar.OptionShowIts(),
		progressbar.OptionOnCompletion(func() {
			fmt.Print("\n")
		}),
		progressbar.OptionFullWidth())
	return func(event any) {
		switch e := event.(type) {
		case launcher.DownloadingEvent:
			bar.ChangeMax(e.Total)
			bar.Add(1)
		case launcher.AssetsResolvedEvent:
			if verbosity > 0 {
				output.Info(output.Translate("start.launch.assets"), e.Total)
			}
		case launcher.LibrariesResolvedEvent:
			if verbosity > 0 {
				output.Info(output.Translate("start.launch.libraries"), e.Total)
			}
		case launcher.MetadataResolvedEvent:
			if verbosity > 0 {
				output.Info(output.Translate("start.launch.metadata"))
			}
		case launcher.PostProcessingEvent:
			output.Info(output.Translate("start.processing"))
		}
	}
}

// StartCmd runs an instance with the specified options.
type StartCmd struct {
	ID string `arg:"" help:"${start_arg_id}"`

	Prepare bool `help:"${start_arg_prepare}"`
	NoGUI   bool `help:"${start_arg_nogui}"`

	Options struct {
		Username    string `help:"${start_arg_username}" short:"u"`
		Account     string `help:"${start_arg_account}" short:"a"`
		Server      string `help:"${start_arg_server}" short:"s" placeholder:"IP" xor:"quickplay"`
		World       string `help:"${start_arg_world}" short:"w" placeholder:"NAME" xor:"quickplay"`
		Demo        bool   `help:"${start_arg_demo}"`
		DisableMP   bool   `help:"${start_arg_disablemp}"`
		DisableChat bool   `help:"${start_arg_disablechat}"`
	} `embed:"" group:"opts"`
	Overrides struct {
		Width     int    `help:"${start_arg_width}" and:"size"`
		Height    int    `help:"${start_arg_height}" and:"size"`
		JVM       string `help:"${start_arg_jvm}" type:"path" placeholder:"PATH"`
		JVMArgs   string `help:"${start_arg_jvmargs}"`
		MinMemory int    `help:"${start_arg_minmemory}" placeholder:"MB" and:"memory"`
		MaxMemory int    `help:"${start_arg_maxmemory}" placeholder:"MB" and:"memory"`
	} `embed:"" group:"overrides"`
}

func (c *StartCmd) Run(ctx *kong.Context, verbosity int) error {
	inst, err := launcher.FetchInstance(c.ID)
	if err != nil {
		return err
	}

	// Check for packwiz updates if this is a packwiz instance
	if inst.Config.Packwiz.URL != "" {
		if verbosity > 0 {
			output.Info("Checking for updates for %s (current version: %s)...",
				inst.Config.Packwiz.Name, inst.Config.Packwiz.Version)
		}

		hasUpdate, packFile, err := packwiz.CheckForUpdates(inst)
		if err != nil {
			if verbosity > 0 {
				output.Debug("Failed to check for packwiz updates: %v", err)
			}
		} else if hasUpdate && packFile != nil {
			output.Info("🔄 Update available for %s: %s -> %s",
				inst.Config.Packwiz.Name,
				inst.Config.Packwiz.Version,
				packFile.Version)

			// Run the packwiz installer to update
			output.Info("Updating modpack...")
			installer := packwiz.NewInstaller("", verbosity > 0)
			if err := installer.RunPackwizInstallerWithURL(inst.Dir(), inst.Config.Packwiz.URL, c.NoGUI); err != nil {
				return fmt.Errorf("packwiz update failed: %w", err)
			}

			// Update the version information in the instance config
			if err := packwiz.UpdateInstance(&inst, packFile); err != nil && verbosity > 0 {
				output.Debug("Failed to update instance version info: %v", err)
			}

			output.Success("✅ Modpack updated successfully to version %s", packFile.Version)
		} else {
			if verbosity > 0 {
				output.Info("✅ %s is up to date (version %s)",
					inst.Config.Packwiz.Name, inst.Config.Packwiz.Version)
			}
		}
	}

	config := inst.Config
	override := launcher.InstanceConfig{
		WindowResolution: struct {
			Width  int "toml:\"width\" json:\"width\""
			Height int "toml:\"height\" json:\"height\""
		}{
			Width:  c.Overrides.Width,
			Height: c.Overrides.Height,
		},
		Java:      c.Overrides.JVM,
		JavaArgs:  c.Overrides.JVMArgs,
		MinMemory: c.Overrides.MinMemory,
		MaxMemory: c.Overrides.MaxMemory,
	}
	if override.WindowResolution.Width != 0 && override.WindowResolution.Height != 0 {
		config.WindowResolution = override.WindowResolution
	}
	if override.Java != "" {
		config.Java = override.Java
	}
	if override.JavaArgs != "" {
		config.JavaArgs = override.JavaArgs
	}
	if override.MinMemory != 0 && override.MaxMemory != 0 {
		config.MinMemory = override.MinMemory
		config.MaxMemory = override.MaxMemory
	}

	var session auth.Session
	if c.Options.Account != "" {
		// Authenticate with specific account
		if auth.GlobalAccountsManager == nil {
			if err := auth.InitAccountsManager(); err != nil {
				return fmt.Errorf("initialize accounts manager: %w", err)
			}
		}
		session, err = auth.GlobalAccountsManager.AuthenticateAs(c.Options.Account)
		if err != nil {
			return fmt.Errorf("authenticate as account '%s': %w", c.Options.Account, err)
		}
	} else if c.Options.Username != "" {
		// Use username for offline mode (legacy behavior)
		session = auth.Session{
			Username: c.Options.Username,
		}
	} else {
		// Auto-authenticate with active account
		session, err = auth.Authenticate()
		if err != nil {
			return fmt.Errorf("authenticate session: %w", err)
		}
	}

	launchEnv, err := launcher.Prepare(
		inst,
		launcher.LaunchOptions{
			Session: session,

			InstanceConfig:     config,
			QuickPlayServer:    c.Options.Server,
			QuickPlayWorld:     c.Options.World,
			Demo:               c.Options.Demo,
			DisableMultiplayer: c.Options.DisableMP,
			DisableChat:        c.Options.DisableChat,
		},
		watcher(verbosity))

	if err != nil {
		return err
	}

	if c.Prepare {
		output.Success(output.Translate("start.prepared"))
		return nil
	}

	if verbosity > 1 {
		output.Debug(output.Translate("start.launch.jvmargs"), launchEnv.JavaArgs)

		var gameArgs []string
		var hideNext bool
		for _, arg := range launchEnv.GameArgs {
			if hideNext {
				gameArgs = append(gameArgs, "***")
			} else {
				gameArgs = append(gameArgs, arg)
			}
			if arg == "--accessToken" || arg == "--uuid" {
				hideNext = true
			} else {
				hideNext = false
			}
		}
		output.Debug(output.Translate("start.launch.gameargs"), gameArgs)
		output.Debug(output.Translate("start.launch.info"), launchEnv.MainClass, launchEnv.GameDir)
	}
	output.Success(output.Translate("start.launch"), color.New(color.Bold).Sprint(session.Username))

	// Run packwiz installer if needed
	if launchEnv.NeedsPackwizInstaller {
		if err := packwiz.RunPackwizInstaller(launchEnv.GameDir, launchEnv.Java, c.NoGUI); err != nil {
			return fmt.Errorf("packwiz installer failed: %w", err)
		}
	}

	return launcher.Launch(launchEnv, launcher.NewConsoleRunner())
}
