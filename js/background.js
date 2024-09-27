// background.js

// This script runs in the background and manages the core functionality of the extension

// Constants
const DEFAULT_MAX_LINKS = 2;
const LINKEDIN_404_URL = "https://www.linkedin.com/404/";
const STORAGE_KEYS = {
  USER_PROFILE_LINKS: "userProfileLinks",
  TARGET_PROFILES: "targetProfiles",
  MESSAGE_TEMPLATE: "messageTemplate"
};

// Helper functions

// Validates if a given string is a valid URL
const isValidUrl = (urlString) => {
  try {
    return Boolean(new URL(urlString));
  } catch (e) {
    return false;
  }
};

// Waits for a specific tab to finish loading
const waitForTabToLoad = (targetTabId) => new Promise((resolve, reject) => {
  const handleTabUpdate = (tabId, changeInfo, tab) => {
    if (tabId === targetTabId && changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      resolve(tab.url);
    }
  };
  chrome.tabs.onUpdated.addListener(handleTabUpdate);
  
  // Add a timeout to prevent infinite waiting
  setTimeout(() => {
    chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    reject(new Error(`Timeout waiting for tab ${targetTabId} to load`));
  }, 30000); // 30 seconds timeout
});

// Check if a tab exists
const tabExists = async (tabId) => {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (error) {
    return false;
  }
};

// Safely remove a tab
const safelyRemoveTab = async (tabId) => {
  if (await tabExists(tabId)) {
    await chrome.tabs.remove(tabId);
  }
};

// Storage functions

// Retrieves a value from Chrome storage
const getFromStorage = async (key) => {
  const result = await chrome.storage.local.get([key]);
  return result[key];
};

// Saves a value to Chrome storage
const setInStorage = async (key, value) => {
  await chrome.storage.local.set({ [key]: value });
};

// Gets the list of user profile links
const getProfiles = async () => {
  return await getFromStorage(STORAGE_KEYS.USER_PROFILE_LINKS) || [];
};

// Saves the list of user profile links
const saveProfiles = async (profileLinks) => {
  await setInStorage(STORAGE_KEYS.USER_PROFILE_LINKS, profileLinks);
};

// Gets the list of target profiles
const getTargets = async () => {
  return [...new Set(await getFromStorage(STORAGE_KEYS.TARGET_PROFILES) || [])];
};

// Saves a target profile
const saveTarget = async (target) => {
  let existingTargets = await getTargets();
  if (!existingTargets.find(t => t.connection.url === target.connection.url)) {
    await setInStorage(STORAGE_KEYS.TARGET_PROFILES, [...existingTargets, target]);
  }
};

// Removes a target profile
const removeTarget = async (targetUrl) => {
  let existingTargets = await getTargets();
  existingTargets = existingTargets.filter(target => target.connection.url !== targetUrl);
  await setInStorage(STORAGE_KEYS.TARGET_PROFILES, existingTargets);
};

// Main functionality

// Collects connections from a given URL
const collectConnections = async (connectionsUrl, maxLinks, originProfileUrl) => {
  let allConnections = [];
  let connectionsTab;

  try {
    connectionsTab = await chrome.tabs.create({ url: connectionsUrl });
    let url = await waitForTabToLoad(connectionsTab.id);
    console.log("GOT URL:", url);
    if (!url.includes(LINKEDIN_404_URL)) {
      const connections = await chrome.tabs.sendMessage(connectionsTab.id, { type: "load-connections" });
      allConnections = connections.connections.slice(0, maxLinks);
      allConnections = [...new Set(allConnections.map(connection => connection.url))]
        .map(url => allConnections.find(connection => connection.url === url));
    } else {
      console.log("Profile not found. Skipping to the next profile.");
    }
  } catch (error) {
    console.error("Error collecting connections:", error);
  } finally {
    if (connectionsTab) {
      await safelyRemoveTab(connectionsTab.id);
    }
  }
  
  return allConnections;
};

// Gets connection links for a given profile
const getConnectionsLinks = async (profile, maxLinks) => {
  let tab;
  
  try {
    tab = await chrome.tabs.create({ url: profile });
    await waitForTabToLoad(tab.id);
    
    if (!await tabExists(tab.id)) {
      console.log("Tab no longer exists. Skipping this profile.");
      return;
    }

    const currentUrl = await chrome.tabs.get(tab.id).then(tab => tab.url);
    
    if (currentUrl === LINKEDIN_404_URL) {
      console.log("Profile not found. Skipping to the next profile.");
      return;
    }

    const connectionsMeta = await chrome.tabs.sendMessage(tab.id, { type: "get-connections-url" });
    console.log(connectionsMeta);
    
    if (connectionsMeta?.connectionsLink) {
      const profileConnections = await collectConnections(connectionsMeta.connectionsLink, maxLinks, profile);
      const targets = profileConnections.map(connection => ({
        origin: connectionsMeta.profileName,
        connection: {
          name: connection.name,
          url: connection.url,
          originUrl: profile
        },
        companyName: connectionsMeta.companyName,
        status: 'Pending'
      }));
      
      for (let target of targets) {
        await saveTarget(target);
      }
    }
  } catch (error) {
    console.error("Error getting connections links:", error);
  } finally {
    if (tab) {
      await safelyRemoveTab(tab.id);
    }
  }
};

// Message handlers

// Handles the collection of links
const collectLinksHandler = async (message) => {
  console.log("Starting collectLinksHandler");
  const profiles = await getProfiles();
  const maxLinks = message.maxLinks || DEFAULT_MAX_LINKS;
  console.log(`Collected ${profiles.length} profiles, max links per profile: ${maxLinks}`);
  
  let collectedLinksCount = 0;

  for (let i = message.startIndex || 0; i < profiles.length; i++) {
    if (isPaused) {
      console.log("Collection paused");
      break;
    }
    console.log(`Processing profile ${i + 1} of ${profiles.length}: ${profiles[i]}`);
    await getConnectionsLinks(profiles[i], maxLinks);
    collectedLinksCount += maxLinks; // This is an estimate, adjust if necessary
  }

  console.log("Collection completed");
  chrome.runtime.sendMessage({ type: "links-collected" });
  chrome.runtime.sendMessage({ type: "collection-complete", count: collectedLinksCount });
};

// Handles adding new links
const addLinkHandler = async (message) => {
  console.log("Starting addLinkHandler");
  const profiles = await getProfiles();
  const newLinks = message.links.split(",").filter(isValidUrl);
  console.log(`Adding ${newLinks.length} new links`);
  const updatedProfiles = [...new Set([...profiles, ...newLinks])];
  await saveProfiles(updatedProfiles);
  console.log(`Total profiles after addition: ${updatedProfiles.length}`);
  return "Done";
};

// Enhanced logging function
function log(message, data = null) {
  const logMessage = `[${new Date().toISOString()}] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Handles sending messages to collected connections
const sendMessagesHandler = async (messageTemplate) => {
  log("Starting sendMessagesHandler");
  let targets = await getTargets();
  log(`Found ${targets.length} targets to message`, targets);

  for (let i = 0; i < targets.length; i++) {
    if (isPaused) {
      log("Messaging paused");
      break;
    }
    let target = targets[i];
    log(`Processing target ${i + 1} of ${targets.length}:`, target);

    if (!target.connection || !target.connection.url || !target.connection.name) {
      log(`Skipping target due to missing data:`, target);
      continue;
    }

    log(`Opening tab for ${target.connection.url}`);
    let targetTab;
    
    try {
      targetTab = await chrome.tabs.create({ url: target.connection.url });
      log(`Waiting for tab ${targetTab.id} to load`);
      await waitForTabToLoad(targetTab.id);

      if (!await tabExists(targetTab.id)) {
        log(`Tab ${targetTab.id} no longer exists. Skipping this target.`);
        continue;
      }

      const messageData = {
        originFullName: target.origin,
        firstName: target.connection.name.split(' ')[0],
        fullName: target.connection.name,
        companyName: target.companyName || "Unknown",
        jobTitle: target.jobTitle || "Professional",
        connectionLinkedInUrl: target.connection.url,
        messageTemplate: messageTemplate
      };

      log(`Sending message to content script for ${target.connection.name}`, messageData);

      let msg = await chrome.tabs.sendMessage(targetTab.id, {
        type: "send-message",
        data: messageData
      });

      log(`Message sending result for ${target.connection.name}: ${msg}`);
      
      if (msg === "Done") {
        target.status = "Sent";
        log(`Message successfully sent to ${target.connection.name}`);
      } else if (msg === "Skipped") {
        target.status = "Skipped";
        log(`Message skipped for ${target.connection.name} (recent message)`);
      } else {
        target.status = "Failed";
        log(`Message sending failed for ${target.connection.name}`);
      }

      await saveTarget(target);
      if (msg === "Done" || msg === "Skipped") {
        await removeTarget(target.connection.url);
      }
    } catch (error) {
      log(`Error sending message to ${target.connection.name}:`, error);
      target.status = "Failed (Error)";
      await saveTarget(target);
    } finally {
      if (targetTab) {
        log(`Closing tab for ${target.connection.name}`);
        await safelyRemoveTab(targetTab.id);
      }
    }
  }
  
  log("Message sending completed, clearing local storage");
  await chrome.storage.local.clear();
};

// State variables
let isPaused = false;

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("Received message:", message);
  (async () => {
    try {
      switch (message.type) {
        case "opened-profile":
          console.log(`Opened: ${message.tabId}`);
          sendResponse("Done");
          break;
        case "add-links":
          sendResponse(await addLinkHandler(message));
          break;
        case "collect-links":
          await collectLinksHandler(message);
          sendResponse("Done");
          break;
        case "send-messages":
          await sendMessagesHandler(message.messageTemplate);
          sendResponse("Messages sent");
          break;
        case "pause":
          isPaused = true;
          sendResponse("Done");
          break;
        case "continue":
          isPaused = false;
          await collectLinksHandler(message);
          sendResponse("Done");
          break;
        case "skip-error":
          console.log("Skipping error and moving to the next connection");
          await collectLinksHandler(message);
          sendResponse("Done");
          break;
        case "message-sent":
          console.log(`Message sent to ${message.recipient} on ${message.date}`);
          sendResponse("Message sent");
          break;
        case "message-skipped":
          console.log(`Message skipped for ${message.reason}. Last message sent on ${message.lastMessageDate}`);
          sendResponse("Message skipped");
          break;
        case "log":
          log("Content script log:", message.message);
          break;
        default:
          log("Unknown message type:", message.type);
          sendResponse("Unknown message type");
      }
    } catch (error) {
      log("Error in message listener:", error);
      sendResponse("Error");
    }
  })();
  return true;
});

// Initialize extension
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: 'page.html' });
});