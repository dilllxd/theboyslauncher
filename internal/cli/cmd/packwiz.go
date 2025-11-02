package cmd

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/alecthomas/kong"
	"github.com/dilllxd/theboyslauncher/internal/cli/output"
	"github.com/dilllxd/theboyslauncher/pkg/launcher"
	"github.com/dilllxd/theboyslauncher/pkg/packwiz"
)

type PackwizCmd struct {
	Install PackwizInstallCmd `cmd:"" help:"${packwiz.install}"`
}

type PackwizInstallCmd struct {
	Name string `arg:"" help:"${packwiz.install.arg.name}"`
	URL  string `arg:"" help:"${packwiz.install.arg.url}"`
}

func (c *PackwizInstallCmd) Run(ctx *kong.Context, verbosity int) error {
	// Validate URL
	parsedURL, err := url.Parse(c.URL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	if !strings.HasSuffix(parsedURL.Path, "/pack.toml") {
		// Try to append pack.toml if it's not present
		if !strings.HasSuffix(parsedURL.Path, "/") {
			parsedURL.Path += "/"
		}
		parsedURL.Path += "pack.toml"
		c.URL = parsedURL.String()
		output.Info("Appending pack.toml to URL: %s", c.URL)
	}

	// Check if instance already exists
	if _, err := launcher.FetchInstance(c.Name); err == nil {
		return fmt.Errorf("instance '%s' already exists", c.Name)
	}

	output.Info("Creating instance '%s' from packwiz modpack", c.Name)
	output.Info("Fetching pack.toml from: %s", c.URL)

	// Create packwiz installer that will parse and create the instance
	installer := packwiz.NewInstaller("", verbosity >= 1)

	// Parse pack data and create instance
	instance, err := installer.CreateInstanceFromPack(c.Name, c.URL)
	if err != nil {
		return fmt.Errorf("failed to create instance from modpack: %w", err)
	}

	output.Success("Successfully created instance '%s' with Minecraft %s", c.Name, instance.GameVersion)
	if instance.LoaderVersion != "" {
		output.Success("Using %s %s", instance.Loader, instance.LoaderVersion)
	}

	output.Info("Running packwiz installer automatically...")
	output.Info("This will download all mods for the modpack. This may take several minutes.")

	// Run packwiz installer directly with the URL in nogui mode
	if err := installer.RunPackwizInstallerWithURL(instance.Dir(), c.URL, true); err != nil {
		return fmt.Errorf("packwiz installer failed: %w", err)
	}

	output.Success("Modpack installation complete! You can now start the game with: start %s --username <player>", c.Name)

	return nil
}