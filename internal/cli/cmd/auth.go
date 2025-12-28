package cmd

import (
	"fmt"
	"net/url"

	"github.com/alecthomas/kong"
	"github.com/dilllxd/theboyslauncher/internal/cli/output"
	"github.com/dilllxd/theboyslauncher/pkg/auth"
	"github.com/fatih/color"
	"github.com/pkg/browser"
)

const (
	clientID    = "d10dfc60-1a42-44a8-b3af-edf4f5ee2c1f"
	redirectURI = "http://localhost:8000/signin"
)

func init() {
	auth.ClientID = clientID
	auth.RedirectURI, _ = url.Parse(redirectURI)
}

// LoginCmd authenticates and logs into an account.
type LoginCmd struct {
	NoBrowser bool `help:"${login_arg_nobrowser}"`
}

func (c *LoginCmd) Run(ctx *kong.Context) error {
	var session auth.Session

	// Always proceed with new account authentication for multiaccount support
	// Users can add multiple accounts by running auth login multiple times
	if c.NoBrowser {
		output.Info(output.Translate("login.code.fetching"))
		resp, err := auth.FetchDeviceCode()
		if err != nil {
			return fmt.Errorf("fetch device code: %w", err)
		}
		output.Info(output.Translate("login.code"), color.BlueString(resp.UserCode), color.BlueString(resp.VerificationURI))
		session, err = auth.AuthenticateWithCode(resp)
		if err != nil {
			return fmt.Errorf("add account: %w", err)
		}
	} else {
		output.Info(output.Translate("login.browser"))
		url := auth.AuthCodeURL()
		output.Info(output.Translate("login.url"), url.String())

		browser.OpenURL(url.String())
		var err error
		session, err = auth.AuthenticateWithRedirect(output.Translate("login.redirect"), output.Translate("login.redirectfail"))
		if err != nil {
			return fmt.Errorf("add account: %w", err)
		}
	}
	output.Success(output.Translate("login.complete"), color.New(color.Bold).Sprint(session.Username))
	return nil
}

// LogoutCmd logs out of the current account.
type LogoutCmd struct {
	Account string `arg:"" optional:"" help:"${logout_arg_account}"`
}

func (c *LogoutCmd) Run(ctx *kong.Context) error {
	if err := auth.InitAccountsManager(); err != nil {
		return fmt.Errorf("initialize accounts manager: %w", err)
	}

	if c.Account != "" {
		// Logout specific account
		if err := auth.GlobalAccountsManager.RemoveAccount(c.Account); err != nil {
			return fmt.Errorf("remove account '%s': %w", c.Account, err)
		}
		output.Success("Successfully logged out account '%s'", c.Account)
	} else {
		// Clear all accounts (legacy behavior)
		if err := auth.GlobalAccountsManager.SaveAccounts(); err != nil {
			return fmt.Errorf("clear accounts: %w", err)
		}
		auth.GlobalAccountsManager.Accounts = make(map[string]*auth.Account)
		auth.GlobalAccountsManager.ActiveAccount = ""
		if err := auth.GlobalAccountsManager.SaveAccounts(); err != nil {
			return fmt.Errorf("save cleared accounts: %w", err)
		}
		output.Info(output.Translate("logout.complete"))
	}
	return nil
}

// ListAccountsCmd lists all available accounts.
type ListAccountsCmd struct{}

func (c *ListAccountsCmd) Run(ctx *kong.Context) error {
	if err := auth.InitAccountsManager(); err != nil {
		return fmt.Errorf("initialize accounts manager: %w", err)
	}

	accounts := auth.GlobalAccountsManager.ListAccounts()
	if len(accounts) == 0 {
		output.Info("No accounts found. Use 'theboyslauncher auth login' to add an account.")
		return nil
	}

	output.Info("Available accounts:")
	for username, account := range accounts {
		if username == auth.GlobalAccountsManager.ActiveAccount {
			output.Info("  * %s (%s) - Active", color.New(color.Bold, color.FgGreen).Sprint(username), account.UUID)
		} else {
			output.Info("    %s (%s)", username, account.UUID)
		}
	}
	return nil
}

// SwitchAccountCmd switches the active account.
type SwitchAccountCmd struct {
	Account string `arg:"" help:"${switch_arg_account}"`
}

func (c *SwitchAccountCmd) Run(ctx *kong.Context) error {
	if err := auth.InitAccountsManager(); err != nil {
		return fmt.Errorf("initialize accounts manager: %w", err)
	}

	if err := auth.GlobalAccountsManager.SetActiveAccount(c.Account); err != nil {
		return fmt.Errorf("switch to account '%s': %w", c.Account, err)
	}

	output.Success("Switched to account: %s", color.New(color.Bold).Sprint(c.Account))
	return nil
}

// WhoamiCmd shows the currently active account.
type WhoamiCmd struct{}

func (c *WhoamiCmd) Run(ctx *kong.Context) error {
	if err := auth.InitAccountsManager(); err != nil {
		return fmt.Errorf("initialize accounts manager: %w", err)
	}

	if auth.GlobalAccountsManager.ActiveAccount == "" {
		output.Info("No active account set.")
		return nil
	}

	account, err := auth.GlobalAccountsManager.GetActiveAccount()
	if err != nil {
		return fmt.Errorf("get active account: %w", err)
	}

	output.Info("Active account: %s", color.New(color.Bold).Sprint(account.Username))
	output.Info("UUID: %s", account.UUID)

	// Show detailed status
	if account.IsValid() {
		if account.ShouldRefresh() {
			output.Info("Status: %s", color.New(color.FgYellow).Sprint("Valid (needs refresh soon)"))
		} else {
			output.Info("Status: %s", color.New(color.FgGreen).Sprint("Valid"))
		}
	} else {
		output.Info("Status: %s", color.New(color.FgRed).Sprint("Expired/Invalid"))
	}

	output.Info("Expires: %s", account.Expires.Format("2006-01-02 15:04:05"))
	output.Info("Time until expiry: %s", account.GetTimeUntilExpiry().String())

	return nil
}

// StatusCmd shows detailed authentication status for all accounts.
type StatusCmd struct{}

func (c *StatusCmd) Run(ctx *kong.Context) error {
	if err := auth.InitAccountsManager(); err != nil {
		return fmt.Errorf("initialize accounts manager: %w", err)
	}

	accounts := auth.GlobalAccountsManager.ListAccounts()
	if len(accounts) == 0 {
		output.Info("No accounts found. Use 'theboyslauncher auth login' to add an account.")
		return nil
	}

	output.Info("Authentication Status:")
	output.Info("===================")

	for username, account := range accounts {
		isActive := username == auth.GlobalAccountsManager.ActiveAccount

		// Account name
		if isActive {
			output.Info("  * %s (%s) - Active", color.New(color.Bold, color.FgGreen).Sprint(username), account.UUID)
		} else {
			output.Info("    %s (%s)", username, account.UUID)
		}

		// Status
		statusColor := color.FgRed
		statusText := "Expired/Invalid"
		if account.IsValid() {
			if account.ShouldRefresh() {
				statusColor = color.FgYellow
				statusText = "Valid (needs refresh soon)"
			} else {
				statusColor = color.FgGreen
				statusText = "Valid"
			}
		}
		output.Info("      Status: %s", color.New(statusColor).Sprint(statusText))
		output.Info("      Expires: %s", account.Expires.Format("2006-01-02 15:04:05"))
		output.Info("      Time until expiry: %s", account.GetTimeUntilExpiry().String())
		output.Info("      Last used: %s", account.LastUsed.Format("2006-01-02 15:04:05"))
		output.Info("")
	}

	return nil
}

// RefreshCmd manually refreshes authentication tokens.
type RefreshCmd struct {
	Account string `arg:"" optional:"" help:"Account to refresh (default: all accounts that need it)"`
}

func (c *RefreshCmd) Run(ctx *kong.Context) error {
	if err := auth.InitAccountsManager(); err != nil {
		return fmt.Errorf("initialize accounts manager: %w", err)
	}

	if c.Account != "" {
		// Refresh specific account
		account, err := auth.GlobalAccountsManager.GetAccount(c.Account)
		if err != nil {
			return fmt.Errorf("get account '%s': %w", c.Account, err)
		}

		output.Info("Refreshing tokens for account '%s'...", c.Account)
		if err := account.Refresh(); err != nil {
			return fmt.Errorf("refresh account '%s': %w", c.Account, err)
		}

		// Save updated account
		if err := auth.GlobalAccountsManager.SaveAccounts(); err != nil {
			return fmt.Errorf("save refreshed account: %w", err)
		}

		output.Success("Successfully refreshed account '%s'", c.Account)
		output.Info("New expiry: %s", account.Expires.Format("2006-01-02 15:04:05"))
	} else {
		// Proactively refresh all accounts that need it
		output.Info("Checking for accounts that need refresh...")
		if err := auth.GlobalAccountsManager.ProactivelyRefreshAccounts(); err != nil {
			return fmt.Errorf("proactively refresh accounts: %w", err)
		}
		output.Success("Token refresh check completed")
	}

	return nil
}

// AuthCmd enables management of an account.
type AuthCmd struct {
	Login   LoginCmd         `cmd:"" help:"${login}"`
	Logout  LogoutCmd        `cmd:"" help:"${logout}"`
	List    ListAccountsCmd  `cmd:"" help:"List all accounts"`
	Switch  SwitchAccountCmd `cmd:"" help:"Switch active account"`
	Whoami  WhoamiCmd        `cmd:"" help:"Show current account"`
	Status  StatusCmd        `cmd:"" help:"Show detailed authentication status"`
	Refresh RefreshCmd       `cmd:"" help:"Refresh authentication tokens"`
}
