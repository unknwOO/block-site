import storage, {
  Schema, Resolution, CounterPeriod, RESOLUTIONS, BLOCKED_EXAMPLE, SCHEDULE_EXAMPLE,
} from "./storage";
import {
  hasInvalidScheduleRules,
  isScheduleLineInvalid,
} from "./helpers/is-schedule-active";
import {
  createPasscode,
  getPasscodeRetryDelay,
  type PasscodeState,
  verifyPasscode,
} from "./helpers/passcode";

const UI = (() => {
  const elements = {
    enabled: document.getElementById("enabled") as HTMLSelectElement,
    contextMenu: document.getElementById("context-menu") as HTMLSelectElement,
    blockedList: document.getElementById("blocked-list") as HTMLTextAreaElement,
    scheduleRules: document.getElementById("schedule-rules") as HTMLTextAreaElement,
    scheduleHighlight: document.querySelector("#schedule-highlight code") as HTMLElement,
    blockedContainer: document.getElementById("blocked-container") as HTMLDivElement,
    schedulesContainer: document.getElementById("schedules-container") as HTMLDivElement,
    contentTabs: document.querySelectorAll<HTMLButtonElement>(".content-tab"),
    resolution: document.getElementById("resolution") as HTMLSelectElement,
    counterShow: document.getElementById("counter-show") as HTMLSelectElement,
    counterPeriod: document.getElementById("counter-period") as HTMLSelectElement,
    settingsLock: document.getElementById("passcode-button") as HTMLButtonElement,
    passcodeDialog: document.getElementById("passcode-dialog") as HTMLDialogElement,
    passcodeInputs: Array.from(document.querySelectorAll<HTMLInputElement>("#passcode-inputs input")),
    passcodePrompt: document.getElementById("passcode-prompt") as HTMLParagraphElement,
    passcodeError: document.getElementById("passcode-error") as HTMLParagraphElement,
    passcodeClose: document.getElementById("passcode-close") as HTMLButtonElement,
  };

  const editableElements: (HTMLSelectElement | HTMLTextAreaElement)[] = [
    elements.enabled,
    elements.contextMenu,
    elements.blockedList,
    elements.scheduleRules,
  ];
  let passcode: PasscodeState = {
    hash: "",
    salt: "",
    failedAttempts: 0,
    lockedUntil: 0,
  };
  let settingsUnlocked = false;
  let passcodeMode: "setup" | "unlock" = "setup";
  let setupPasscode = "";
  let setupStep = 1;
  let retryTimer: number | undefined;
  let checkingPasscode = false;

  elements.blockedList.placeholder = BLOCKED_EXAMPLE.join("\n");
  elements.scheduleRules.placeholder = SCHEDULE_EXAMPLE.join("\n");

  const booleanToString = (b: boolean) => b ? "YES" : "NO";
  const stringToBoolean = (s: string) => s === "YES";
  const hasPasscode = () => Boolean(passcode.hash && passcode.salt);
  const isSettingsLocked = () => hasPasscode() && !settingsUnlocked;

  const renderLockState = () => {
    const locked = isSettingsLocked();
    document.body.classList.toggle("settings-locked", locked);
    editableElements.forEach((element) => {
      element.disabled = locked;
    });
    const action = locked ? "Unlock settings" : "Set passcode";
    elements.settingsLock.setAttribute("aria-label", action);
    elements.settingsLock.title = action;
  };

  const setPasscodeInputsDisabled = (disabled: boolean) => {
    elements.passcodeInputs.forEach((input) => {
      input.disabled = disabled;
    });
  };

  const clearPasscodeInputs = () => {
    elements.passcodeInputs.forEach((input) => {
      input.value = "";
    });
    if (!elements.passcodeInputs[0].disabled) {
      elements.passcodeInputs[0].focus();
    }
  };

  const formatRetryTime = (milliseconds: number) => {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const showFailedAttempts = () => {
    window.clearInterval(retryTimer);
    const update = () => {
      const remaining = Math.max(0, passcode.lockedUntil - Date.now());
      setPasscodeInputsDisabled(remaining > 0 || checkingPasscode);
      if (remaining > 0) {
        elements.passcodeError.textContent = `${passcode.failedAttempts} failed attempts. Try again in ${formatRetryTime(remaining)}.`;
        return;
      }

      window.clearInterval(retryTimer);
      elements.passcodeError.textContent = passcode.failedAttempts
        ? `${passcode.failedAttempts} failed attempt${passcode.failedAttempts === 1 ? "" : "s"}.`
        : "";
      clearPasscodeInputs();
    };

    update();
    if (passcode.lockedUntil > Date.now()) {
      retryTimer = window.setInterval(update, 250);
    }
  };

  const closePasscodeDialog = () => {
    window.clearInterval(retryTimer);
    elements.passcodeDialog.close();
  };

  const openPasscodeDialog = () => {
    passcodeMode = isSettingsLocked() ? "unlock" : "setup";
    setupStep = 1;
    setupPasscode = "";
    elements.passcodePrompt.textContent = passcodeMode === "unlock"
      ? "Enter Screen Time passcode"
      : "Enter new Screen Time passcode";
    elements.passcodeError.textContent = "";
    elements.passcodeDialog.showModal();
    setPasscodeInputsDisabled(false);
    clearPasscodeInputs();
    if (passcodeMode === "unlock") {
      showFailedAttempts();
    }
  };

  const getEventTargetValue = (event: Event) => (event.target as HTMLTextAreaElement | HTMLSelectElement).value;
  const stringToBlocked = (string: string) => string.split("\n").map((s) => s.trim()).filter(Boolean);
  const updateScheduleValidity = (value: string) => {
    const isInvalid = hasInvalidScheduleRules(value);
    elements.scheduleRules.setAttribute("aria-invalid", String(isInvalid));

    const lines = value.split("\n");
    const fragments = lines.flatMap((line, index) => {
      const span = document.createElement("span");
      span.classList.toggle("invalid", isScheduleLineInvalid(line));
      span.textContent = line;
      return index < lines.length - 1 ? [span, document.createTextNode("\n")] : [span];
    });
    elements.scheduleHighlight.replaceChildren(...fragments);
  };
  const syncScheduleScroll = () => {
    elements.scheduleHighlight.style.transform = `translate(${-elements.scheduleRules.scrollLeft}px, ${-elements.scheduleRules.scrollTop}px)`;
  };

  const showContent = (content: string) => {
    elements.contentTabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.content === content);
    });
    elements.blockedContainer.hidden = content !== "blocked";
    elements.schedulesContainer.hidden = content !== "schedules";
  };

  elements.contentTabs.forEach((tab) => {
    tab.addEventListener("click", () => showContent(tab.dataset.content || "blocked"));
  });

  elements.enabled.addEventListener("change", (event) => {
    if (isSettingsLocked()) return;
    const enabled = stringToBoolean(getEventTargetValue(event));
    storage.set({ enabled });
  });

  elements.contextMenu.addEventListener("change", (event) => {
    if (isSettingsLocked()) return;
    const contextMenu = stringToBoolean(getEventTargetValue(event));
    storage.set({ contextMenu });
  });

  elements.blockedList.addEventListener("input", (event) => {
    if (isSettingsLocked()) return;
    const blocked = stringToBlocked(getEventTargetValue(event));
    storage.set({ blocked });
  });

  elements.scheduleRules.addEventListener("input", (event) => {
    if (isSettingsLocked()) return;
    const schedule = getEventTargetValue(event);
    updateScheduleValidity(schedule);
    storage.set({ schedule });
  });
  elements.scheduleRules.addEventListener("scroll", syncScheduleScroll);

  elements.resolution.addEventListener("change", (event) => {
    const resolution = getEventTargetValue(event) as Resolution;
    storage.set({ resolution });
  });

  elements.counterShow.addEventListener("change", (event) => {
    const counterShow = stringToBoolean(getEventTargetValue(event));
    storage.set({ counterShow });
  });

  elements.counterPeriod.addEventListener("change", (event) => {
    const counterPeriod = getEventTargetValue(event) as CounterPeriod;
    storage.set({ counterPeriod });
  });

  const init = <T extends Partial<Schema>>(items: T) => {
    if (items.enabled !== undefined) {
      elements.enabled.value = booleanToString(items.enabled);
    }

    if (items.contextMenu !== undefined) {
      elements.contextMenu.value = booleanToString(items.contextMenu);
    }

    if (items.blocked !== undefined) {
      const valueAsBlocked = stringToBlocked(elements.blockedList.value);
      if (JSON.stringify(valueAsBlocked) !== JSON.stringify(items.blocked)) {
        elements.blockedList.value = items.blocked.join("\r\n");
      }
    }

    if (
      items.schedule !== undefined
      && document.activeElement !== elements.scheduleRules
      && elements.scheduleRules.value !== items.schedule
    ) {
      elements.scheduleRules.value = items.schedule;
    }
    if (items.schedule !== undefined) {
      updateScheduleValidity(items.schedule);
    }

    if (items.resolution !== undefined) {
      elements.resolution.value = items.resolution;
      RESOLUTIONS.forEach((oneResolution) => {
        document.body.classList.remove(`resolution-${oneResolution}`);
      });
      document.body.classList.add(`resolution-${items.resolution}`);
    }

    if (items.counterShow !== undefined) {
      elements.counterShow.value = booleanToString(items.counterShow);
      document.body.classList.toggle("counter-show", items.counterShow);
    }

    if (items.counterPeriod !== undefined) {
      elements.counterPeriod.value = items.counterPeriod;
    }

    if (items.passcode !== undefined) {
      passcode = items.passcode;
      renderLockState();
    }
  };

  const submitPasscode = async () => {
    if (checkingPasscode || passcode.lockedUntil > Date.now()) return;
    const value = elements.passcodeInputs.map((input) => input.value).join("");
    if (!/^\d{4}$/.test(value)) return;

    if (passcodeMode === "setup") {
      if (setupStep === 1) {
        setupPasscode = value;
        setupStep = 2;
        elements.passcodePrompt.textContent = "Re-enter new Screen Time passcode";
        elements.passcodeError.textContent = "";
        clearPasscodeInputs();
        return;
      }

      if (value !== setupPasscode) {
        setupStep = 1;
        setupPasscode = "";
        elements.passcodePrompt.textContent = "Enter new Screen Time passcode";
        elements.passcodeError.textContent = "Passcodes did not match.";
        clearPasscodeInputs();
        return;
      }

      checkingPasscode = true;
      setPasscodeInputsDisabled(true);
      passcode = await createPasscode(value);
      await storage.set({ passcode });
      setupPasscode = "";
      checkingPasscode = false;
      settingsUnlocked = false;
      closePasscodeDialog();
      renderLockState();
      return;
    }

    checkingPasscode = true;
    setPasscodeInputsDisabled(true);
    const matches = await verifyPasscode(value, passcode);
    checkingPasscode = false;
    if (matches) {
      passcode = { ...passcode, failedAttempts: 0, lockedUntil: 0 };
      await storage.set({ passcode });
      settingsUnlocked = true;
      closePasscodeDialog();
      renderLockState();
      return;
    }

    const failedAttempts = passcode.failedAttempts + 1;
    const delay = getPasscodeRetryDelay(failedAttempts);
    passcode = {
      ...passcode,
      failedAttempts,
      lockedUntil: delay ? Date.now() + delay : 0,
    };
    await storage.set({ passcode });
    clearPasscodeInputs();
    showFailedAttempts();
  };

  elements.passcodeInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(-1);
      if (input.value && index < elements.passcodeInputs.length - 1) {
        elements.passcodeInputs[index + 1].focus();
      }
      void submitPasscode();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        elements.passcodeInputs[index - 1].focus();
      }
    });

    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const digits = event.clipboardData?.getData("text").replace(/\D/g, "").slice(0, 4) || "";
      digits.split("").forEach((digit, digitIndex) => {
        elements.passcodeInputs[digitIndex].value = digit;
      });
      elements.passcodeInputs[Math.min(digits.length, 3)].focus();
      void submitPasscode();
    });
  });

  elements.settingsLock.addEventListener("click", openPasscodeDialog);
  elements.passcodeClose.addEventListener("click", closePasscodeDialog);
  elements.passcodeDialog.addEventListener("close", () => {
    window.clearInterval(retryTimer);
    checkingPasscode = false;
    setupPasscode = "";
    elements.passcodeInputs.forEach((input) => {
      input.value = "";
    });
  });

  return { elements, init };
})();

window.addEventListener("DOMContentLoaded", () => {
  const keys: (keyof Schema)[] = [
    "enabled",
    "contextMenu",
    "blocked",
    "resolution",
    "counterShow",
    "counterPeriod",
    "schedule",
    "passcode",
  ];

  storage.get(keys).then((local) => {
    UI.init(local);
    document.body.classList.add("ready");
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    keys.forEach((key) => {
      if (changes[key]) {
        UI.init({ [key]: changes[key].newValue });
      }
    });
  });
});
