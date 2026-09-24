import initStorage from "./storage/init";
import storage from "./storage";
import recreateContextMenu from "./helpers/recreate-context-menu";
import blockSite from "./helpers/block-site";
import { compileRules, type CompiledRule } from "./helpers/find-rule";
import { parseSchedule, type ScheduleRule } from "./helpers/is-schedule-active";

let __enabled = false;
let __contextMenu = false;
let __blocked: string[] = [];
let __rules: CompiledRule[] = [];
let __schedule: ScheduleRule[] = [];

initStorage().then(() => {
  storage.get(["enabled", "contextMenu", "blocked", "schedule"]).then(({
    enabled, contextMenu, blocked, schedule,
  }) => {
    __enabled = enabled;
    __contextMenu = contextMenu;
    __blocked = blocked;
    __rules = compileRules(blocked);
    __schedule = parseSchedule(schedule);

    recreateContextMenu(__enabled && __contextMenu);
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes["enabled"]) {
      __enabled = changes["enabled"].newValue as boolean;
    }

    if (changes["contextMenu"]) {
      __contextMenu = changes["contextMenu"].newValue as boolean;
    }

    if (changes["enabled"] || changes["contextMenu"]) {
      recreateContextMenu(__enabled && __contextMenu);
    }

    if (changes["blocked"]) {
      __blocked = changes["blocked"].newValue as string[];
      __rules = compileRules(__blocked);
    }

    if (changes["schedule"]) {
      __schedule = parseSchedule(changes["schedule"].newValue as string);
    }
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!__enabled || !__blocked.length) {
    return;
  }

  const { tabId, url, frameId } = details;
  if (!url || !url.startsWith("http") || frameId !== 0) {
    return;
  }

  blockSite({ blocked: __blocked, rules: __rules, schedule: __schedule, tabId, url });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!tabId || !__enabled || !__blocked.length) {
    return;
  }

  const { url } = changeInfo;
  if (!url || !url.startsWith("http")) {
    return;
  }

  blockSite({ blocked: __blocked, rules: __rules, schedule: __schedule, tabId, url });
});
