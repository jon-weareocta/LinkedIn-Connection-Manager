// popup.js

// This script handles the user interface interactions in the extension's popup

document.addEventListener('DOMContentLoaded', function() {
    // Load saved settings
    loadMaxLinksSetting();
    loadMessageTemplate();
    loadRetryAttemptsSetting();

    // Update profile links
    updateProfileLinks();

    // Add event listeners
    addEventListenerSafely('saveMaxLinks', 'click', handleSaveMaxLinksButtonClick);
    addEventListenerSafely('saveMessage', 'click', handleSaveMessageButtonClick);
    addEventListenerSafely('saveRetryAttempts', 'click', handleSaveRetryAttemptsButtonClick);
    addEventListenerSafely('addLinks', 'click', handleAddButtonClick);
    addEventListenerSafely('collectLinks', 'click', handleCollectButtonClick);
    addEventListenerSafely('clearData', 'click', handleClearButtonClick);
    addEventListenerSafely('downloadCSV', 'click', handleDownloadCSVButtonClick);
    addEventListenerSafely('modalSendMessages', 'click', handleSendMessages);
    addEventListenerSafely('modalCollectMore', 'click', handleCollectButtonClick);
    addEventListenerSafely('modalClose', 'click', closeModal);
    addEventListenerSafely('templateSelect', 'change', handleTemplateSelection);

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
function loadMessageTemplate() {
    chrome.storage.local.get(['selectedTemplate', 'customTemplate', 'messageTemplate'], result => {
        const messageTextarea = document.querySelector("#messageTemplate");
        const templateSelect = document.getElementById('templateSelect');
        
        if (result.selectedTemplate) {
            templateSelect.value = result.selectedTemplate;
            if (result.selectedTemplate === 'custom') {
                messageTextarea.value = result.customTemplate || result.messageTemplate || "";
            } else {
                messageTextarea.value = getTemplateContent(result.selectedTemplate);
            }
        } else {
            messageTextarea.value = result.messageTemplate || "";
        }
    });
}

// Load the max links setting from storage
function loadMaxLinksSetting() {
  chrome.storage.local.get(['maxLinks'], result => {
    const maxLinksInput = document.querySelector("#maxLinks");
    if (maxLinksInput) {
        maxLinksInput.value = result.maxLinks || 2;
    } else {
        console.warn("Element with id 'maxLinks' not found");
    }
  });
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
  evt.preventDefault(); // Prevent default form submission
  const maxLinks = document.querySelector("#maxLinks").value;
  fireWorkerEvent({
    type: "collect-links",
    maxLinks: parseInt(maxLinks)
  });
  updateStatus("Collecting links...");
  logStatus("Started collecting links.");
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

    await chrome.storage.local.set({ 
        messageTemplate: messageTemplate,
        selectedTemplate: selectedTemplate,
        customTemplate: selectedTemplate === 'custom' ? messageTemplate : null
    });

    updateStatus("Message template saved.");
    logStatus("Message template saved.");
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

// Handle the save max links button click event
async function handleSaveMaxLinksButtonClick(evt) {
  evt.preventDefault(); // Prevent default form submission
  const maxLinks = document.querySelector("#maxLinks").value;
  await chrome.storage.local.set({ maxLinks: parseInt(maxLinks) });
  updateStatus("Max links setting saved.");
  logStatus(`Max links setting saved: ${maxLinks}`);
}

// Handle the download CSV button click event
async function handleDownloadCSVButtonClick(evt) {
  evt.preventDefault();
  chrome.storage.local.get(["targetProfiles"], result => {
    const targets = result.targetProfiles || [];
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Profile Name,Profile LinkedIn URL,Connection Name,Connection LinkedIn URL,Company Name,Status\n";

    targets.forEach(target => {
      const profileName = target.origin || "Unknown";
      const profileUrl = target.connection.originUrl || "Unknown";
      const connectionName = target.connection.name || "Unknown";
      const connectionUrl = target.connection.url || "Unknown";
      const companyName = target.companyName || "Unknown";
      const status = target.status || "Pending";
      csvContent += `${profileName},${profileUrl},${connectionName},${connectionUrl},${companyName},${status}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "linkedin_connections.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    updateStatus("CSV file downloaded.");
    logStatus("Downloaded CSV file.");
  });
}

// Handle send messages button click
async function handleSendMessages() {
  closeModal();
  updateStatus("Preparing to send messages...");
  logStatus("User opted to send messages.");

  // Fetch the message template
  const messageTemplate = await getMessageTemplate();

  // Send message request with the template
  chrome.runtime.sendMessage({
    type: "send-messages",
    messageTemplate: messageTemplate
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
function handleTemplateSelection(event) {
    const selectedTemplate = event.target.value;
    const messageTextarea = document.getElementById('messageTemplate');

    if (selectedTemplate === 'custom') {
        // Load custom template if it exists
        chrome.storage.local.get(['customTemplate'], result => {
            messageTextarea.value = result.customTemplate || '';
        });
    } else {
        // Load predefined template
        messageTextarea.value = getTemplateContent(selectedTemplate);
    }

    // Save the selected template
    chrome.storage.local.set({ selectedTemplate: selectedTemplate });
}

// Get template content based on selection
function getTemplateContent(templateName) {
    const templates = {
        networking: `Hi {profileName},

I hope this message finds you well. I noticed we're both connected to {originConnectionName}, and I'm reaching out because their experience at {companyName} caught my attention.

I'm particularly interested in learning more about [specific area of interest]. Would you be open to introducing me to {originConnectionName}? I'd love to have a brief conversation about their insights in this field.

Looking forward to your response,
[Your Name]`,
        jobInquiry: `Dear {fullName},

I hope you're having a great day. I came across {originConnectionName}'s profile, who is currently working as {jobTitle} at {companyName}, and I'm really impressed by their role.

I'm currently exploring new opportunities in [specific industry/role], and I'd be grateful if you could introduce me to {originConnectionName}. I'd love to gain some insights about [specific aspect of the job or company].

Would you be open to making an introduction?

Thank you for your time,
[Your Name]`,
        collaboration: `Hello {profileName},

I hope this message finds you well. I've been following {originConnectionName}'s contributions at {companyName} with great interest.

I'm reaching out because I believe there might be an opportunity for collaboration between our organizations in [specific area]. I'd love to discuss this further with {originConnectionName} and explore how we might be able to work together.

Would you be willing to introduce me to {originConnectionName}?

Best regards,
[Your Name]`,
        eventFollowUp: `Hi {profileName},

I hope you're doing well. I recently noticed that {originConnectionName} from {companyName} attended [Event Name], and while I didn't get a chance to connect with them personally, I'm fascinated by the work they're doing.

I'm particularly intrigued by [specific aspect of their work or a topic from the event]. I'd love to hear their thoughts on this and perhaps discuss how it relates to current trends in our industry.

Would you be open to introducing me to {originConnectionName} for a short conversation to share insights?

Best wishes,
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
