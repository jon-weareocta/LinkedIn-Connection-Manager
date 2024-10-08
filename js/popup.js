// popup.js

// This script handles the user interface interactions in the extension's popup

document.addEventListener('DOMContentLoaded', function() {
    // Load saved settings
    loadAllSettings();
    loadMessageTemplate();

    // Update profile links
    updateProfileLinks();

    // Add event listeners
    addEventListenerSafely('saveMessage', 'click', handleSaveMessageButtonClick);
    addEventListenerSafely('addLinks', 'click', handleAddButtonClick);
    addEventListenerSafely('collectLinks', 'click', handleCollectButtonClick);
    addEventListenerSafely('clearData', 'click', handleClearButtonClick);
    addEventListenerSafely('downloadCSV', 'click', handleDownloadCSVButtonClick);
    addEventListenerSafely('modalSendMessages', 'click', handleSendMessages);
    addEventListenerSafely('modalCollectMore', 'click', handleCollectButtonClick);
    addEventListenerSafely('modalClose', 'click', closeModal);
    addEventListenerSafely('templateSelect', 'change', handleTemplateSelection);
    addEventListenerSafely('pauseButton', 'click', handlePauseButtonClick);
    addEventListenerSafely('continueButton', 'click', handleContinueButtonClick);
    addEventListenerSafely('stopButton', 'click', handleStopButtonClick);
    addEventListenerSafely('saveSettings', 'click', saveSettings);

    // Initialize template selection
    initializeTemplateSelection();

    // Listen for progress updates
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.type === "progress-update") {
            updateProgress(request.progress, request.status);
        } else if (request.type === "collection-complete") {
            showCollectionCompleteModal(request.count);
        }
    });
});

function addEventListenerSafely(id, event, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.warn(`Element with id '${id}' not found`);
    }
}

// Update the profile list from storage
function updateProfileLinks() {
  chrome.storage.local.get(['userProfileLinks'], result => {
    const profileList = document.querySelector("#profile-list");
    profileList.innerHTML = ""; // Clear existing list
    const profileLinks = result.userProfileLinks || [];
    profileLinks.forEach(profile => {
      const liItem = document.createElement("li");
      const linkElement = document.createElement("a");
      linkElement.href = profile;
      linkElement.textContent = profile;
      linkElement.target = "_blank"; // Open link in new tab
      liItem.appendChild(linkElement);
      profileList.appendChild(liItem);
    });
    
    // Update the count of added profiles
    const profileCount = document.querySelector("#profile-count");
    if (profileCount) {
      profileCount.textContent = `${profileLinks.length} profile(s) added`;
    }
  });
}

// Load the message template from storage
async function loadMessageTemplate() {
    const { selectedTemplate, messageTemplates } = await chrome.storage.local.get(['selectedTemplate', 'messageTemplates']);
    const messageTextarea = document.querySelector("#messageTemplate");
    const templateSelect = document.getElementById('templateSelect');
    
    if (selectedTemplate) {
        templateSelect.value = selectedTemplate;
        if (selectedTemplate === 'custom') {
            messageTextarea.value = messageTemplates?.custom || "";
        } else {
            messageTextarea.value = messageTemplates?.[selectedTemplate] || getTemplateContent(selectedTemplate);
        }
    } else {
        messageTextarea.value = messageTemplates?.["Message 1"] || getTemplateContent("Message 1");
    }
}

// Load all settings from storage
async function loadAllSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings) {
        document.getElementById('maxLinks').value = settings.maxLinks || 2;
        document.getElementById('retryAttempts').value = settings.retryAttempts || 3;
        document.getElementById('collectionInterval').value = settings.collectionInterval || 30;
        document.getElementById('collectionBatchSize').value = settings.collectionBatchSize || 10;
        document.getElementById('collectionPauseTime').value = settings.collectionPauseTime || 5;
        document.getElementById('messagingInterval').value = settings.messagingInterval || 60;
        document.getElementById('messagingBatchSize').value = settings.messagingBatchSize || 5;
        document.getElementById('messagingPauseTime').value = settings.messagingPauseTime || 15;
        document.getElementById('dailyCollectionLimit').value = settings.dailyCollectionLimit || 100;
        document.getElementById('dailyMessageLimit').value = settings.dailyMessageLimit || 50;
    }
}

// Save all settings to storage
async function saveSettings() {
    const settings = {
        maxLinks: parseInt(document.getElementById('maxLinks').value),
        retryAttempts: parseInt(document.getElementById('retryAttempts').value),
        collectionInterval: parseInt(document.getElementById('collectionInterval').value),
        collectionBatchSize: parseInt(document.getElementById('collectionBatchSize').value),
        collectionPauseTime: parseInt(document.getElementById('collectionPauseTime').value),
        messagingInterval: parseInt(document.getElementById('messagingInterval').value),
        messagingBatchSize: parseInt(document.getElementById('messagingBatchSize').value),
        messagingPauseTime: parseInt(document.getElementById('messagingPauseTime').value),
        dailyCollectionLimit: parseInt(document.getElementById('dailyCollectionLimit').value),
        dailyMessageLimit: parseInt(document.getElementById('dailyMessageLimit').value)
    };

    await chrome.storage.local.set({ settings });
    updateStatus("All settings saved successfully.");
    logStatus("Updated extension settings.");
}

// Handle the add button click event
async function handleAddButtonClick(evt) {
  evt.preventDefault(); // Prevent default form submission
  const inputLinksElement = document.querySelector("#inputLinks");
  const inputLinks = inputLinksElement.value.trim();
  if (inputLinks) {
    const newLinks = inputLinks.split(',').map(link => link.trim()).filter(link => link);
    chrome.storage.local.get(['userProfileLinks'], result => {
      const existingLinks = result.userProfileLinks || [];
      const updatedLinks = [...new Set([...existingLinks, ...newLinks])]; // Remove duplicates
      chrome.storage.local.set({ userProfileLinks: updatedLinks }, () => {
        // Clear the input field
        inputLinksElement.value = "";
        // Update the profile list
        updateProfileLinks();
        // Update the status message
        updateStatus(`Added ${newLinks.length} new link(s).`);
        logStatus(`Added links: ${newLinks.join(', ')}`);
      });
    });
  }
}

// Handle the collect button click event
async function handleCollectButtonClick(evt) {
    evt.preventDefault();
    chrome.storage.local.get(['settings', 'userProfileLinks'], async (result) => {
        const settings = result.settings || {};
        const maxLinks = settings.maxLinks || 2;
        const retryAttempts = settings.retryAttempts || 3;
        const profileLinks = result.userProfileLinks || [];
        
        if (profileLinks.length === 0) {
            updateStatus("No profile links added. Please add links before collecting.");
            return;
        }

        updateStatus("Starting collection process...");
        chrome.runtime.sendMessage({
            type: "collect-links",
            profileLinks: profileLinks,
            maxLinks: maxLinks,
            retryAttempts: retryAttempts
        });
    });
}

// Handle the clear button click event
async function handleClearButtonClick(evt) {
  evt.preventDefault(); // Prevent default form submission
  const { sentMessages } = await chrome.storage.local.get(["sentMessages"]);

  // Clear all data in the Chrome storage except sentMessages
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ sentMessages });

  // Clear UI elements
  updateProfileLinks();
  updateStatus("All settings cleared except sent messages.");
  logStatus("Cleared all settings except sent messages.");
}

// Handle the save message button click event
async function handleSaveMessageButtonClick(evt) {
    evt.preventDefault();
    const messageTemplate = document.querySelector("#messageTemplate").value;
    const templateSelect = document.getElementById('templateSelect');
    const selectedTemplate = templateSelect.value;

    let templates = await chrome.storage.local.get('messageTemplates');
    templates = templates.messageTemplates || {};

    if (selectedTemplate === 'custom') {
        templates.custom = messageTemplate;
    } else {
        templates[selectedTemplate] = messageTemplate;
    }

    await chrome.storage.local.set({ 
        messageTemplates: templates,
        selectedTemplate: selectedTemplate
    });

    updateStatus("Message template saved.");
    logStatus(`Saved message template: ${selectedTemplate}`);
}

// Handle the stop button click event
async function handleStopButtonClick(evt) {
  evt.preventDefault(); // Prevent default form submission
  await chrome.storage.local.clear();
  updateProfileLinks();
  updateStatus("All operations stopped.");
  logStatus("Stopped all operations.");
}

// Handle the pause button click event
async function handlePauseButtonClick(evt) {
  evt.preventDefault(); // Prevent default form submission
  await chrome.runtime.sendMessage({ type: "pause" });
  updateStatus("Operations paused.");
  logStatus("Paused operations.");
}

// Handle the continue button click event
async function handleContinueButtonClick(evt) {
  evt.preventDefault();
  const startIndex = (await chrome.storage.local.get(["startIndex"])).startIndex || 0;
  const targetIndex = (await chrome.storage.local.get(["targetIndex"])).targetIndex || 0;
  const maxLinks = document.querySelector("#maxLinks").value;
  chrome.runtime.sendMessage({
    type: "continue",
    startIndex: startIndex,
    targetIndex: targetIndex,
    maxLinks: parseInt(maxLinks),
    skipError: true
  });
  updateStatus("Continuing operations.");
  logStatus("Continued operations.");
}

// Handle the download CSV button click event
async function handleDownloadCSVButtonClick(evt) {
    evt.preventDefault();
    updateStatus("Preparing CSV download...");
    logStatus("Initiating CSV download.");

    try {
        const { targetProfiles } = await chrome.storage.local.get('targetProfiles');
        
        if (!targetProfiles || targetProfiles.length === 0) {
            updateStatus("No data to download.");
            logStatus("CSV download failed: No data available.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Name,LinkedIn URL,Company,Job Title,Origin Connection,Origin URL\n";

        targetProfiles.forEach(profile => {
            const row = [
                profile.connection.name,
                profile.connection.url,
                profile.companyName,
                profile.jobTitle,
                profile.origin,
                profile.originUrl
            ].map(field => `"${field}"`).join(',');
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "linkedin_connections.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        updateStatus("CSV downloaded successfully.");
        logStatus("CSV file generated and downloaded.");
    } catch (error) {
        console.error("Error generating CSV:", error);
        updateStatus("Error generating CSV. Please try again.");
        logStatus("CSV download failed: " + error.message);
    }
}

// Handle send messages button click
async function handleSendMessages() {
    closeModal();
    updateStatus("Preparing to send messages...");
    logStatus("User opted to send messages.");

    chrome.storage.local.get(['settings', 'messageTemplates'], async (result) => {
        const settings = result.settings || {};
        const messageTemplates = result.messageTemplates || getDefaultTemplates();

        chrome.runtime.sendMessage({
            type: "send-messages",
            messageTemplates: messageTemplates,
            messagingInterval: settings.messagingInterval,
            messagingBatchSize: settings.messagingBatchSize,
            messagingPauseTime: settings.messagingPauseTime,
            dailyMessageLimit: settings.dailyMessageLimit
        });
    });
}

// Open modal dialog
function openModal() {
  const modal = document.getElementById("actionModal");
  modal.style.display = "block";
}

// Close modal dialog
function closeModal() {
  const modal = document.getElementById("actionModal");
  modal.style.display = "none";
}

// Fire a worker event
const fireWorkerEvent = (eventData) => {
  chrome.runtime.sendMessage(eventData).then(response => {
    updateStatus(response);
    logStatus(response);
  });
};

// Update the status message
const updateStatus = (message) => {
  const statusElement = document.querySelector("#status");
  statusElement.textContent = message;
};

// Log status messages to the status log
const logStatus = (message) => {
  const statusLog = document.querySelector("#statusLog");
  const timeStamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement("p");
  logEntry.textContent = `[${timeStamp}] ${message}`;
  statusLog.appendChild(logEntry);
  statusLog.scrollTop = statusLog.scrollHeight; // Auto-scroll to bottom
};

async function getMessageTemplate() {
  const result = await chrome.storage.local.get(["messageTemplate"]);
  return result.messageTemplate || "Hi {profileName}, I found your profile interesting!"; // Default message
}

function loadRetryAttemptsSetting() {
    chrome.storage.local.get(['retryAttempts'], result => {
        const retryAttemptsInput = document.querySelector("#retryAttempts");
        if (retryAttemptsInput) {
            retryAttemptsInput.value = result.retryAttempts || 3;
        } else {
            console.warn("Element with id 'retryAttempts' not found");
        }
    });
}

function handleSaveRetryAttemptsButtonClick(evt) {
    evt.preventDefault();
    const retryAttempts = document.querySelector("#retryAttempts").value;
    chrome.storage.local.set({ retryAttempts: parseInt(retryAttempts) });
    updateStatus("Retry attempts setting saved.");
    logStatus(`Retry attempts setting saved: ${retryAttempts}`);
}

function updateProgress(progress, status) {
    const progressBar = document.getElementById('progress');
    const statusDiv = document.getElementById('status');
    progressBar.style.width = progress + "%";
    statusDiv.textContent = status;
}

// Initialize template selection
function initializeTemplateSelection() {
    const templateSelect = document.getElementById('templateSelect');
    loadMessageTemplate();
    
    // Set the initial template selection based on saved value
    chrome.storage.local.get(['selectedTemplate'], result => {
        if (result.selectedTemplate) {
            templateSelect.value = result.selectedTemplate;
        }
    });
}

// Handle template selection change
async function handleTemplateSelection(event) {
    const selectedTemplate = event.target.value;
    const messageTextarea = document.getElementById('messageTemplate');

    let templates = await chrome.storage.local.get('messageTemplates');
    templates = templates.messageTemplates || {};

    if (selectedTemplate === 'custom') {
        messageTextarea.value = templates.custom || '';
    } else {
        messageTextarea.value = templates[selectedTemplate] || getTemplateContent(selectedTemplate);
    }

    // Save the selected template
    chrome.storage.local.set({ selectedTemplate: selectedTemplate });
}

// Get template content based on selection
function getTemplateContent(templateName) {
    const templates = {
        "Message 1": `Hey {profileName},

I hope all's well. I noticed you're connected with {originConnectionName} ({originLinkedInUrl}) and wondered if you could help me out. We just closed a round with Sanabil and 500 Global for OCTA. Our platform helps companies like Careem speed up collections, access financing, and recover debt—bringing down collection times by 35%.

Would you be open to an intro? I think we'd be a great fit.

Thanks a ton,
[Your Name]`,

        "Message 2": `Hi {profileName},

Hope you're doing great. I saw your connection with {originConnectionName} ({originLinkedInUrl}) and thought you might be able to assist. We've recently secured funding from Sanabil and 500 Global for OCTA, our platform that's helping businesses like Careem streamline their accounts receivable, get financing, and improve debt recovery—reducing collection times by 35%.

Would you mind introducing us? I believe we could add significant value.

Really appreciate your help,
[Your Name]`,

        "Message 3": `Hello {profileName},

Trust this finds you well. I noticed you're linked with {originConnectionName} ({originLinkedInUrl}) and was hoping for a quick favor. OCTA, our company, just raised a round from Sanabil and 500 Global. We're focused on helping companies such as Careem optimize their collections, secure financing, and manage debt recovery—we've seen collection times drop by 35%.

Any chance you'd be willing to make an introduction? I think there's a great potential fit here.

Thanks in advance,
[Your Name]`,

        "Message 4": `Hey there {profileName},

I hope you're having a good day. I couldn't help but notice your connection with {originConnectionName} ({originLinkedInUrl}) and wanted to reach out for a small request. We've recently closed funding with Sanabil and 500 Global for our company, OCTA. Our solution is helping businesses like Careem accelerate their collections, access needed financing, and improve debt recovery—we're seeing collection times reduced by 35%.

Would you be open to connecting us? I believe we could provide substantial value.

Many thanks for considering,
[Your Name]`,

        "Message 5": `Hi {profileName},

I hope this message finds you well. I saw that you're connected to {originConnectionName} ({originLinkedInUrl}) and was wondering if I could ask for your assistance. We've just secured funding from Sanabil and 500 Global for OCTA, our platform that's revolutionizing how companies like Careem handle their accounts receivable, obtain financing, and recover debt—we're proud to say we're cutting collection times by 35%.

Would you be willing to make an introduction? I think there could be a great opportunity for collaboration.

Thank you so much for your time,
[Your Name]`
    };

    return templates[templateName] || '';
}

// Add this function to show the modal
function showCollectionCompleteModal(count) {
    const modal = document.getElementById('actionModal');
    const countElement = document.getElementById('collectedLinksCount');
    if (countElement) {
        countElement.textContent = `Collected ${count} links.`;
    }
    if (modal) {
        modal.style.display = 'block';
    } else {
        console.error("Modal element not found");
    }
}

// Add this helper function to get default templates
function getDefaultTemplates() {
    return {
        "Message 1": getTemplateContent("Message 1"),
        "Message 2": getTemplateContent("Message 2"),
        "Message 3": getTemplateContent("Message 3"),
        "Message 4": getTemplateContent("Message 4"),
        "Message 5": getTemplateContent("Message 5")
    };
}

function handlePauseButtonClick() {
  chrome.runtime.sendMessage({ type: "pause" }, (response) => {
    if (response === "Done") {
      updateStatus("Process paused.");
      logStatus("Collection process paused.");
    }
  });
}

function handleContinueButtonClick() {
  chrome.runtime.sendMessage({ type: "continue" }, (response) => {
    if (response === "Done") {
      updateStatus("Process resumed.");
      logStatus("Collection process resumed.");
    }
  });
}

function handleStopButtonClick() {
  chrome.runtime.sendMessage({ type: "stop" }, (response) => {
    if (response === "Done") {
      updateStatus("Process stopped.");
      logStatus("Collection process stopped.");
    }
  });
}