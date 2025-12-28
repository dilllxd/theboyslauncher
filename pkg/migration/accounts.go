package migration

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dilllxd/theboyslauncher/pkg/auth"
)

// PrismAccountData represents the account format from Prism launcher
type PrismAccountData struct {
	Accounts []struct {
		Username    string    `json:"username"`
		UUID        string    `json:"uuid"`
		AccessToken string    `json:"accessToken"`
		UserType    string    `json:"userType"`
		MojangUser  bool      `json:"mojangUser"`
		Expires     time.Time `json:"expires"`
		Profile     struct {
			Name  string `json:"name"`
			ID    string `json:"id"`
			Legacy bool   `json:"legacy"`
		} `json:"profile"`
	} `json:"accounts"`
	ActiveAccount string `json:"activeAccount"`
}

// MigratePrismAccounts migrates account data from Prism format to our format
func MigratePrismAccounts(prismAccountsPath string) error {
	if _, err := os.Stat(prismAccountsPath); os.IsNotExist(err) {
		return fmt.Errorf("Prism accounts file not found: %s", prismAccountsPath)
	}

	// Read Prism accounts
	data, err := os.ReadFile(prismAccountsPath)
	if err != nil {
		return fmt.Errorf("read Prism accounts: %w", err)
	}

	var prismData PrismAccountData
	if err := json.Unmarshal(data, &prismData); err != nil {
		return fmt.Errorf("parse Prism accounts: %w", err)
	}

	if len(prismData.Accounts) == 0 {
		return fmt.Errorf("no accounts found in Prism data")
	}

	// Initialize accounts manager
	if err := auth.InitAccountsManager(); err != nil {
		return fmt.Errorf("initialize accounts manager: %w", err)
	}

	// Migrate each account
	for _, prismAccount := range prismData.Accounts {
		if err := migrateSingleAccount(prismAccount); err != nil {
			fmt.Printf("Warning: Failed to migrate account %s: %v\n", prismAccount.Username, err)
			continue
		}
		fmt.Printf("Successfully migrated account: %s\n", prismAccount.Username)
	}

	// Set active account if available
	if prismData.ActiveAccount != "" {
		if err := auth.GlobalAccountsManager.SetActiveAccount(prismData.ActiveAccount); err != nil {
			fmt.Printf("Warning: Failed to set active account %s: %v\n", prismData.ActiveAccount, err)
		}
	}

	// Save migrated accounts
	if err := auth.GlobalAccountsManager.SaveAccounts(); err != nil {
		return fmt.Errorf("save migrated accounts: %w", err)
	}

	// Remove temporary Prism accounts file
	os.Remove(prismAccountsPath)

	return nil
}

// migrateSingleAccount migrates a single Prism account to our format
func migrateSingleAccount(prismAccount struct {
	Username    string    `json:"username"`
	UUID        string    `json:"uuid"`
	AccessToken string    `json:"accessToken"`
	UserType    string    `json:"userType"`
	MojangUser  bool      `json:"mojangUser"`
	Expires     time.Time `json:"expires"`
	Profile     struct {
		Name  string `json:"name"`
		ID    string `json:"id"`
		Legacy bool   `json:"legacy"`
	} `json:"profile"`
}) error {

	// Create a temporary auth store to hold the migrated data
	var authStore auth.AuthStore

	// Populate the auth store with Prism data
	// Note: Prism stores tokens differently, so we need to adapt the format
	authStore.Minecraft.AccessToken = prismAccount.AccessToken
	authStore.Minecraft.Username = prismAccount.Username
	authStore.Minecraft.UUID = prismAccount.UUID
	authStore.Minecraft.Expires = prismAccount.Expires

	// Create a session
	session := auth.Session{
		Username:    prismAccount.Username,
		UUID:        prismAccount.UUID,
		AccessToken: prismAccount.AccessToken,
	}

	// Add account to manager
	if err := auth.GlobalAccountsManager.AddAccount(session, authStore); err != nil {
		return fmt.Errorf("add migrated account: %w", err)
	}

	return nil
}

// ValidatePrismAccount checks if a Prism account is still valid
func ValidatePrismAccount(prismAccount PrismAccountData) bool {
	// Basic validation
	if len(prismAccount.Accounts) == 0 {
		return false
	}

	for _, account := range prismAccount.Accounts {
		// Check if essential fields are present
		if account.Username == "" || account.UUID == "" || account.AccessToken == "" {
			return false
		}

		// Check if token is not expired (with some buffer time)
		if time.Until(account.Expires) < 0 {
			return false
		}
	}

	return true
}

// BackupExistingAccounts creates a backup of existing accounts before migration
func BackupExistingAccounts() (string, error) {
	accountsPath := filepath.Join(auth.GlobalAccountsManager.AccountsPath)
	if _, err := os.Stat(accountsPath); os.IsNotExist(err) {
		// No existing accounts to backup
		return "", nil
	}

	backupDir := filepath.Join(filepath.Dir(accountsPath), fmt.Sprintf("accounts_backup_%s", time.Now().Format("20060102_150405")))

	if err := copyFile(accountsPath, filepath.Join(backupDir, "accounts.json")); err != nil {
		return "", fmt.Errorf("backup existing accounts: %w", err)
	}

	return backupDir, nil
}

// ImportInstanceConfig imports Prism instance configuration to our format
func ImportInstanceConfig(prismInstancePath string) error {
	instanceConfigFile := filepath.Join(prismInstancePath, "instance.cfg")
	if _, err := os.Stat(instanceConfigFile); os.IsNotExist(err) {
		// No instance config to import
		return nil
	}

	// Read instance config
	data, err := os.ReadFile(instanceConfigFile)
	if err != nil {
		return fmt.Errorf("read instance config: %w", err)
	}

	// Parse the ini-like configuration (this is a simplified parser)
	config := parseInstanceConfig(string(data))

	// Create our instance configuration in the same directory
	ourConfigPath := filepath.Join(prismInstancePath, "instance.json")
	ourConfig := map[string]interface{}{
		"name":         config["name"],
		"gameVersion":  config["IntendedVersion"],
		"modpack":      config["Modpack"],
		"javaPath":     config["JavaPath"],
		"jvmArgs":      config["JvmArgs"],
		"maxMemory":    config["MaxMemAlloc"],
		"minMemory":    config["MinMemAlloc"],
		"windowWidth":  config["WindowWidth"],
		"windowHeight": config["WindowHeight"],
		"fullscreen":   config["Fullscreen"],
	}

	configData, err := json.MarshalIndent(ourConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal instance config: %w", err)
	}

	if err := os.WriteFile(ourConfigPath, configData, 0644); err != nil {
		return fmt.Errorf("write instance config: %w", err)
	}

	return nil
}

// parseInstanceConfig is a simple parser for Prism's instance.cfg format
func parseInstanceConfig(configContent string) map[string]string {
	config := make(map[string]string)
	lines := strings.Split(configContent, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if parts := strings.SplitN(line, "=", 2); len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			config[key] = value
		}
	}

	return config
}