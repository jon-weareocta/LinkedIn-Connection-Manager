// background.js

// This script runs in the background and manages the core functionality of the extension

// Constants for default values and storage keys
const DEFAULT_MAX_LINKS = 2;
const LINKEDIN_404_URL = "https://www.linkedin.com/404/";
const STORAGE_KEYS = {
  USER_PROFILE_LINKS: "userProfileLinks",
  TARGET_PROFILES: "targetProfiles",
  MESSAGE_TEMPLATE: "messageTemplate"
};

// Helper functions for URL validation, tab management, and storage operations
const isValidUrl = (urlString) => {
  try {
    return Boolean(new URL(urlString));
  } catch (e) {
    return false;
  }
};

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

const tabExists = async (tabId) => {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (error) {
    return false;
  }
};

const safelyRemoveTab = async (tabId) => {
  if (await tabExists(tabId)) {
    await chrome.tabs.remove(tabId);
  }
};

// Storage functions for managing profile links and targets
const getFromStorage = async (key) => {
  const result = await chrome.storage.local.get([key]);
  return result[key];
};

const setInStorage = async (key, value) => {
  await chrome.storage.local.set({ [key]: value });
};

// Functions for managing user profiles and target profiles
const getProfiles = async () => {
  return await getFromStorage(STORAGE_KEYS.USER_PROFILE_LINKS) || [];
};

const saveProfiles = async (profileLinks) => {
  await setInStorage(STORAGE_KEYS.USER_PROFILE_LINKS, profileLinks);
};

const getTargets = async () => {
  return [...new Set(await getFromStorage(STORAGE_KEYS.TARGET_PROFILES) || [])];
};

const saveTarget = async (target) => {
  let existingTargets = await getTargets();
  if (!existingTargets.find(t => t.connection.url === target.connection.url)) {
    await setInStorage(STORAGE_KEYS.TARGET_PROFILES, [...existingTargets, target]);
  }
};

const removeTarget = async (targetUrl) => {
  let existingTargets = await getTargets();
  existingTargets = existingTargets.filter(target => target.connection.url !== targetUrl);
  await setInStorage(STORAGE_KEYS.TARGET_PROFILES, existingTargets);
};

// Main functionality for collecting connections and sending messages
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
      
      // Add the origin profile URL to each connection
      allConnections = allConnections.map(connection => ({
        ...connection,
        originUrl: originProfileUrl
      }));
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
        originUrl: profile, // This is the LinkedIn URL of the original connection
        connection: {
          name: connection.name,
          url: connection.url
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

// Message handlers for various extension operations
const collectLinksHandler = async (message) => {
  isRunning = true;
  console.log("Starting collectLinksHandler");
  const profiles = await getProfiles();
  const maxLinks = message.maxLinks || DEFAULT_MAX_LINKS;
  console.log(`Collected ${profiles.length} profiles, max links per profile: ${maxLinks}`);
  
  let collectedLinksCount = 0;

  for (let profile of profiles) {
    if (!isRunning) break;
    while (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log(`Processing profile ${profiles.indexOf(profile) + 1} of ${profiles.length}: ${profile}`);
    await getConnectionsLinks(profile, maxLinks);
    collectedLinksCount += maxLinks; // This is an estimate, adjust if necessary
  }

  console.log("Collection completed");
  chrome.runtime.sendMessage({ type: "links-collected" });
  chrome.runtime.sendMessage({ type: "collection-complete", count: collectedLinksCount });
};

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

const sendMessagesHandler = async (messageTemplates) => {
  isRunning = true;
  log("Starting sendMessagesHandler");
  let targets = await getTargets();
  log(`Found ${targets.length} targets to message`, targets);

  for (let target of targets) {
    if (!isRunning) break;
    while (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    log(`Processing target ${targets.indexOf(target) + 1} of ${targets.length}:`, target);

    if (!target.connection || !target.connection.url || !target.connection.name) {
      log(`Skipping target due to missing data:`, target);
      continue;
    }

    // Choose a random message template
    const templateKeys = Object.keys(messageTemplates);
    const randomTemplate = messageTemplates[templateKeys[Math.floor(Math.random() * templateKeys.length)]];

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
        firstName: target.connection.name.split(' ')[0],
        fullName: target.connection.name,
        originFullName: target.origin,
        originLinkedInUrl: target.originUrl,
        companyName: target.companyName,
        jobTitle: target.jobTitle,
        connectionLinkedInUrl: target.connection.url,
        messageTemplate: randomTemplate
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

// Enhanced logging function
function log(message, data = null) {
  const logMessage = `[${new Date().toISOString()}] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// State variables
let isPaused = false;
let isRunning = false;

// Message listener for handling various message types
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
          await sendMessagesHandler(message.messageTemplates);
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
        case "stop":
          isRunning = false;
          isPaused = false;
          // Reset any other necessary state variables
          sendResponse("Done");
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