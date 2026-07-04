import "./styles.css";
import "./recovered-main-bundle.js";

const minecraftHeadUrl = (name: string) =>
  `https://minotar.net/helm/${encodeURIComponent(name)}/48.png`;

const findButtonByText = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text,
  );

const enhanceNotificationButton = () => {
  const button = document.querySelector<HTMLButtonElement>(".notify-button");
  if (!button || button.dataset.enhanced === "true") {
    return;
  }
  button.dataset.enhanced = "true";
  button.title = "Open activity and notifications";
  button.addEventListener("click", () => {
    const activityButton = findButtonByText("Activity");
    activityButton?.click();
  });
};

const enhanceMinecraftHeads = () => {
  const avatarTargets = document.querySelectorAll<HTMLElement>(
    ".sidebar-user-card, .settings-account-summary, .account-button",
  );
  avatarTargets.forEach((target) => {
    const avatar = target.querySelector<HTMLElement>(".player-avatar");
    const label =
      target.querySelector("strong")?.textContent?.trim() ||
      target.getAttribute("aria-label")?.replace(/^Minecraft account\s+/i, "").replace(/\s+signed in$/i, "");
    if (!avatar || !label || label === "Player" || avatar.dataset.headFor === label) {
      return;
    }
    avatar.dataset.headFor = label;
    avatar.classList.add("minecraft-head-avatar");
    avatar.innerHTML = "";
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";
    image.src = minecraftHeadUrl(label);
    image.onerror = () => {
      avatar.classList.remove("minecraft-head-avatar");
      avatar.textContent = "";
      const fallback = document.createElement("span");
      fallback.textContent = label.slice(0, 1);
      avatar.append(fallback);
    };
    avatar.append(image);
  });
};

const enhanceDiscoverCopy = () => {
  document
    .querySelectorAll<HTMLElement>(".discover-provider-card .status-pill, .discover-search-heading .status-pill")
    .forEach((pill) => {
      if (pill.textContent?.trim() === "Compatible packs") {
        pill.textContent = "Install support";
      }
  });
  document.querySelectorAll<HTMLElement>(".discover-provider-card p").forEach((summary) => {
    const current = summary.textContent ?? "";
    const next = current.replace("Installs compatible", "Searches and installs supported");
    if (next !== current) {
      summary.textContent = next;
    }
  });
};

const enhanceRecoveredUi = () => {
  enhanceNotificationButton();
  enhanceMinecraftHeads();
  enhanceDiscoverCopy();
};

enhanceRecoveredUi();
new MutationObserver(enhanceRecoveredUi).observe(document.body, {
  childList: true,
  subtree: true,
});
