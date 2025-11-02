package cmd

import (
	"fmt"
	"net/url"

	"github.com/alecthomas/kong"
	"github.com/fatih/color"
	"github.com/pkg/browser"
	"github.com/dilllxd/theboyslauncher/internal/cli/output"
	"github.com/dilllxd/theboyslauncher/pkg/auth"
)

const (
	clientID    = "6a533aa3-afbf-45a4-91bc-8c35a37e35c7"
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
	output.Info("Status: %s", color.New(color.FgGreen).Sprint("Authenticated"))
	return nil
}

// AuthCmd enables management of an account.
type AuthCmd struct {
	Login         LoginCmd         `cmd:"" help:"${login}"`
	Logout        LogoutCmd        `cmd:"" help:"${logout}"`
	List          ListAccountsCmd  `cmd:"" help:"List all accounts"`
	Switch        SwitchAccountCmd `cmd:"" help:"Switch active account"`
	Whoami        WhoamiCmd        `cmd:"" help:"Show current account"`
}
