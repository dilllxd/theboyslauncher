package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	env "github.com/dilllxd/theboyslauncher/pkg"
	"github.com/dilllxd/theboyslauncher/internal/cli/output"
)

// Account represents a single Minecraft account with all authentication data
type Account struct {
	ID          string    `json:"id"`          // UUID for account identification
	Username    string    `json:"username"`    // Minecraft username
	UUID        string    `json:"uuid"`        // Minecraft UUID
	AccessToken string    `json:"access_token"` // Minecraft access token
	Expires     time.Time `json:"expires"`     // Token expiration time
	LastUsed    time.Time `json:"last_used"`   // When this account was last used

	// Full authentication data for token refresh
	MSA       msaAuthStore       `json:"msa"`
	XBL       xblAuthStore       `json:"xbl"`
	XSTS      xstsAuthStore      `json:"xsts"`
	Minecraft minecraftAuthStore `json:"minecraft"`
}

// isValid checks if the account's access token is still valid
func (a *Account) isValid() bool {
	return a.AccessToken != "" && a.Expires.After(time.Now())
}

// IsValid checks if the account's access token is still valid (public method)
func (a *Account) IsValid() bool {
	return a.isValid()
}

// refresh refreshes the account's authentication tokens
func (a *Account) refresh() error {
	if !a.MSA.isValid() {
		if err := a.MSA.refresh(); err != nil {
			return fmt.Errorf("refresh MSA token: %w", err)
		}
	}
	if !a.XBL.isValid() {
		if err := a.XBL.refresh(); err != nil {
			return fmt.Errorf("refresh XBL token: %w", err)
		}
	}
	if !a.XSTS.isValid() {
		if err := a.XSTS.refresh(); err != nil {
			return fmt.Errorf("refresh XSTS token: %w", err)
		}
	}
	if !a.Minecraft.isValid() {
		if err := a.Minecraft.refresh(); err != nil {
			return fmt.Errorf("refresh Minecraft token: %w", err)
		}
	}

	// Update account info
	a.AccessToken = a.Minecraft.AccessToken
	a.UUID = a.Minecraft.UUID
	a.Expires = time.Now().Add(time.Second * time.Duration(3600)) // Default 1 hour

	return nil
}

// AccountsManager manages multiple accounts
type AccountsManager struct {
	Accounts       map[string]*Account `json:"accounts"`       // Key: username, Value: Account
	ActiveAccount  string             `json:"active_account"` // Username of active account
	AccountsPath   string             `json:"-"`              // Path to accounts file
}

// NewAccountsManager creates a new accounts manager
func NewAccountsManager() *AccountsManager {
	return &AccountsManager{
		Accounts:     make(map[string]*Account),
		AccountsPath: env.AccountsPath,
	}
}

// LoadAccounts loads accounts from the accounts file
func (am *AccountsManager) LoadAccounts() error {
	data, err := os.ReadFile(am.AccountsPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Check if accounts exist in old location (instances folder) and migrate them
			oldPath := filepath.Join(env.InstancesDir, "accounts.json")
			if oldData, oldErr := os.ReadFile(oldPath); oldErr == nil {
				if err := json.Unmarshal(oldData, am); err == nil {
					// Successfully loaded from old location, now save to new location
					output.Info("Migrating accounts from instances folder to launcher directory...")
					if err := am.SaveAccounts(); err == nil {
						// Remove old file after successful migration
						os.Remove(oldPath)
					}
					return nil
				}
			}

			// File doesn't exist, create empty manager
			return am.SaveAccounts()
		}
		return fmt.Errorf("read accounts file: %w", err)
	}

	if err := json.Unmarshal(data, am); err != nil {
		return fmt.Errorf("parse accounts file: %w", err)
	}

	// If no active account is set, try to migrate from old auth store
	if am.ActiveAccount == "" && len(am.Accounts) == 0 {
		return am.migrateFromOldAuth()
	}

	return nil
}

// SaveAccounts saves accounts to the accounts file
func (am *AccountsManager) SaveAccounts() error {
	data, err := json.MarshalIndent(am, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal accounts: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(am.AccountsPath), 0755); err != nil {
		return fmt.Errorf("create accounts directory: %w", err)
	}

	return os.WriteFile(am.AccountsPath, data, 0644)
}

// AddAccount adds a new account from authentication session
func (am *AccountsManager) AddAccount(session Session, authStore AuthStore) error {
	account := &Account{
		ID:          session.UUID,
		Username:    session.Username,
		UUID:        session.UUID,
		AccessToken: session.AccessToken,
		Expires:     time.Now().Add(time.Hour), // Default 1 hour
		LastUsed:    time.Now(),
		MSA:         authStore.MSA,
		XBL:         authStore.XBL,
		XSTS:        authStore.XSTS,
		Minecraft:   authStore.Minecraft,
	}

	am.Accounts[session.Username] = account
	am.ActiveAccount = session.Username

	return am.SaveAccounts()
}

// GetAccount gets an account by username
func (am *AccountsManager) GetAccount(username string) (*Account, error) {
	account, exists := am.Accounts[username]
	if !exists {
		return nil, fmt.Errorf("account '%s' not found", username)
	}
	return account, nil
}

// GetActiveAccount gets the currently active account
func (am *AccountsManager) GetActiveAccount() (*Account, error) {
	if am.ActiveAccount == "" {
		return nil, fmt.Errorf("no active account")
	}
	return am.GetAccount(am.ActiveAccount)
}

// SetActiveAccount sets the active account
func (am *AccountsManager) SetActiveAccount(username string) error {
	account, exists := am.Accounts[username]
	if !exists {
		return fmt.Errorf("account '%s' not found", username)
	}

	am.ActiveAccount = username
	account.LastUsed = time.Now()
	return am.SaveAccounts()
}

// RemoveAccount removes an account
func (am *AccountsManager) RemoveAccount(username string) error {
	if _, exists := am.Accounts[username]; !exists {
		return fmt.Errorf("account '%s' not found", username)
	}

	delete(am.Accounts, username)

	// If we removed the active account, set a new one if available
	if am.ActiveAccount == username {
		if len(am.Accounts) > 0 {
			// Set the most recently used account as active
			var newestAccount string
			var newestTime time.Time
			for username, account := range am.Accounts {
				if account.LastUsed.After(newestTime) {
					newestTime = account.LastUsed
					newestAccount = username
				}
			}
			am.ActiveAccount = newestAccount
		} else {
			am.ActiveAccount = ""
		}
	}

	return am.SaveAccounts()
}

// ListAccounts returns all accounts
func (am *AccountsManager) ListAccounts() map[string]*Account {
	return am.Accounts
}

// AuthenticateAs authenticates as a specific account
func (am *AccountsManager) AuthenticateAs(username string) (Session, error) {
	account, err := am.GetAccount(username)
	if err != nil {
		return Session{}, err
	}

	// Check if token is valid, refresh if needed
	if !account.IsValid() {
		if err := account.refresh(); err != nil {
			return Session{}, fmt.Errorf("refresh account '%s': %w", username, err)
		}
		// Save updated account data
		if err := am.SaveAccounts(); err != nil {
			return Session{}, fmt.Errorf("save refreshed account: %w", err)
		}
	}

	// Update last used time
	account.LastUsed = time.Now()
	am.SaveAccounts()

	return Session{
		Username:    account.Username,
		UUID:        account.UUID,
		AccessToken: account.AccessToken,
	}, nil
}

// migrateFromOldAuth migrates data from the old single-account auth store
func (am *AccountsManager) migrateFromOldAuth() error {
	// Try to read the old auth store file
	data, err := os.ReadFile(env.AuthStorePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // No old auth file to migrate
		}
		return fmt.Errorf("check old auth file: %w", err)
	}

	var oldStore AuthStore
	if err := json.Unmarshal(data, &oldStore); err != nil {
		return fmt.Errorf("parse old auth store: %w", err)
	}

	if oldStore.Minecraft.Username != "" && oldStore.Minecraft.UUID != "" {
		session := Session{
			Username:    oldStore.Minecraft.Username,
			UUID:        oldStore.Minecraft.UUID,
			AccessToken: oldStore.Minecraft.AccessToken,
		}

		if err := am.AddAccount(session, oldStore); err != nil {
			return fmt.Errorf("migrate old auth data: %w", err)
		}

		// Remove old auth store after successful migration
		os.Remove(env.AuthStorePath)
		output.Info("Migrated old authentication data to multiaccount system")
	}
	return nil
}

// Global accounts manager
var GlobalAccountsManager *AccountsManager

// InitAccountsManager initializes the global accounts manager
func InitAccountsManager() error {
	GlobalAccountsManager = NewAccountsManager()
	return GlobalAccountsManager.LoadAccounts()
}