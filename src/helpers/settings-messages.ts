import type {
  PasscodeLockState,
  ProtectedSettingKey,
} from "./protected-settings";
import type { Schema } from "../storage";

export type SettingsMessage =
  | { type: "GET_LOCK_STATE" }
  | { type: "SET_PASSCODE", passcode: string }
  | { type: "UNLOCK_SETTINGS", passcode: string }
  | {
    type: "SET_PROTECTED_SETTING"
    key: ProtectedSettingKey
    value: Schema[ProtectedSettingKey]
  };

export type SettingsMessageResponse = {
  success: boolean
  lockState: PasscodeLockState
};

export const sendSettingsMessage = (message: SettingsMessage) => (
  chrome.runtime.sendMessage(message) as Promise<SettingsMessageResponse>
);
