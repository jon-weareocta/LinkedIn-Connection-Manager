// content-script.js

// Constants for DOM selectors and timeouts
const SELECTORS = {
  CONNECTIONS_BUTTON: ".artdeco-button.artdeco-button--2.artdeco-button--primary.ember-view.pvs-profile-actions__action",
  CONNECTIONS_LINK: 'a[href^="https://www.linkedin.com/search/results/people/?facetNetwork"]',
  PROFILE_NAME: 'a[href*="/overlay/about-this-profile/"]>h1',
  SEARCH_FEEDBACK_CARD: 'div[data-view-name^="search-feedback-card"]',
  PAGINATION_INDICATOR: ".artdeco-pagination__indicator.artdeco-pagination__indicator--number.ember-view>button>span",
  CONNECTION_LINK: 'span.entity-result__title-text>a[href^="https://www.linkedin.com/in/"]',
  MESSAGE_PANEL: ".msg-form__contenteditable",
  SEND_BUTTON: ".msg-form__send-button",
  CLOSE_BUTTON: "button > svg > use[href='#close-small']",
  CONVERSATION_CONTAINER: '.msg-conversations-container__conversations-list',
  LAST_MESSAGE_TIMESTAMP: '.msg-s-message-list__time-heading',
  MESSAGE_BUTTON: "button[aria-label^='Message']",
  MESSAGE_INPUT: ".msg-form__contenteditable[contenteditable='true']",
  MESSAGE_BUBBLE: '.msg-s-event-listitem__message-bubble',
  EDITOR_CONTAINER: ".msg-form__msg-content-container"
};

const TIMEOUTS = {
  ELEMENT_WAIT: 10000,
  SEND_MESSAGE: 2000,
  CLOSE_MESSAGE: 4000
};

// Helper functions for interacting with the DOM
const waitForElm = (selector, timeout = TIMEOUTS.ELEMENT_WAIT) => {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        resolve(document.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
};

const waitForElmWithContent = (selector, content) => {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element && element.textContent === content) return resolve(element);

    const observer = new MutationObserver(() => {
      const elementFound = document.querySelector(selector);
      if (elementFound && elementFound.textContent === content) {
        observer.disconnect();
        resolve(elementFound);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
};

const waitForElementDisappear = (selector, timeout = TIMEOUTS.ELEMENT_WAIT) => {
  return new Promise((resolve) => {
    if ([...document.querySelectorAll(selector)].length === 0) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if ([...document.querySelectorAll(selector)].length === 0) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
};

// Functions for extracting data from LinkedIn pages
const getCompanyName = () => {
  const buttons = document.querySelectorAll("button");
  for (const button of buttons) {
    const ariaLabel = button.getAttribute("aria-label");
    if (ariaLabel?.startsWith("Current company:")) {
      let companyName = ariaLabel.replace("Current company:", "").trim();
      const index = companyName.indexOf(". Click to skip to experience card");
      return index !== -1 ? companyName.slice(0, index).trim() : companyName;
    }
  }
  return "";
};

const getConnectionsUrlProfileNameAndCompany = async () => {
  await waitForElm(SELECTORS.CONNECTIONS_BUTTON);
  const anchor = document.querySelector(SELECTORS.CONNECTIONS_LINK);
  const profileName = document.querySelector(SELECTORS.PROFILE_NAME)?.textContent;
  const companyName = getCompanyName();
  return { profileName, companyName, connectionsLink: anchor?.href };
};

const loadConnections = async () => {
  await waitForElm(SELECTORS.SEARCH_FEEDBACK_CARD);
  const pages = [...document.querySelectorAll(SELECTORS.PAGINATION_INDICATOR)];
  const lastPage = pages.length > 0 ? Number(pages[pages.length - 1].textContent) : 1;
  const connections = document.querySelectorAll(SELECTORS.CONNECTION_LINK);
  const connectionsWithName = [...connections].map((connection) => ({
    name: connection.querySelector("span[aria-hidden='true']").textContent,
    url: connection.href,
  }));
  return { pages: lastPage, connections: connectionsWithName };
};

const loadConnectionsAjax = async (pageNumber) => {
  const nextButton = document.querySelector(".artdeco-pagination__button--next");
  nextButton?.click();
  await waitForElmWithContent(
    ".artdeco-pagination__indicator.artdeco-pagination__indicator--number.active.selected.ember-view>button>span",
    `${pageNumber}`
  );
  const connections = document.querySelectorAll(SELECTORS.CONNECTION_LINK);
  return {
    connections: [...connections].map((connection) => ({
      name: connection.querySelector("span[aria-hidden='true']").textContent,
      url: connection.href,
    })),
  };
};

// Helper function for logging to the background script
function logToBackground(message, data = null) {
    const logMessage = `[Content Script] ${message}`;
    chrome.runtime.sendMessage({ 
        type: "log", 
        message: logMessage,
        data: data ? JSON.stringify(data) : null
    });
}

// Add this parseLinkedInDate function before the wasMessageRecentlySent function
const parseLinkedInDate = (dateString) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  if (dateString.toLowerCase().includes('today')) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (dateString.toLowerCase().includes('yesterday')) {
    return new Date(now.setDate(now.getDate() - 1));
  } else if (weekdays.some(day => dateString.includes(day))) {
    const dayIndex = weekdays.findIndex(day => dateString.includes(day));
    const today = now.getDay();
    const daysAgo = (today + 7 - dayIndex) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  } else if (dateString.includes(':')) {
    const [hours, minutes] = dateString.split(':').map(Number);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  } else {
    const parts = dateString.split(' ');
    const month = months.indexOf(parts[0]);
    const day = parseInt(parts[1]);
    const year = parts[2] ? parseInt(parts[2]) : currentYear;
    return new Date(year, month, day);
  }
};

// Update the existing wasMessageRecentlySent function
const wasMessageRecentlySent = async () => {
    logToBackground('Checking for recent messages');
    
    const timeHeadings = document.querySelectorAll(SELECTORS.LAST_MESSAGE_TIMESTAMP);
    
    if (timeHeadings.length > 0) {
        const mostRecentTimeHeading = timeHeadings[timeHeadings.length - 1];
        const relativeTime = mostRecentTimeHeading.textContent.trim();
        logToBackground(`Most recent time heading: ${relativeTime}`);
        
        const lastMessageDate = parseLinkedInDate(relativeTime);
        
        if (lastMessageDate && !isNaN(lastMessageDate.getTime())) {
            const currentDate = new Date();
            const timeDifference = currentDate - lastMessageDate;
            const daysDifference = timeDifference / (1000 * 60 * 60 * 24);
            
            logToBackground(`Last message date: ${lastMessageDate.toDateString()}`);
            logToBackground(`Days since last message: ${daysDifference.toFixed(2)}`);
            
            if (daysDifference < 90) {
                logToBackground('A message was sent within the last 90 days');
                return true;
            }
        } else {
            logToBackground(`Unable to parse date: ${relativeTime}`);
        }
    }
    
    logToBackground('No messages found within the last 90 days');
    return false;
};

// Updated closeAllMessagePanels function
const closeAllMessagePanels = async () => {
    logToBackground('Attempting to close all message panels');
    const messagePanels = document.querySelectorAll('.msg-overlay-conversation-bubble');
    logToBackground(`Found ${messagePanels.length} message panels`);
    
    for (const panel of messagePanels) {
        logToBackground('Searching for close button in panel');
        const svgUse = panel.querySelector(SELECTORS.CLOSE_BUTTON);
        if (svgUse) {
            const closeButton = svgUse.closest('button');
            if (closeButton) {
                logToBackground('Close button found. Clicking it.');
                closeButton.click();
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second after each click
            } else {
                logToBackground('Close button not found');
            }
        } else {
            logToBackground('SVG use element not found');
        }
    }
    
    // Wait for panels to disappear
    await waitForElementDisappear('.msg-overlay-conversation-bubble', 15000);
    
    // Final check
    const finalCheck = document.querySelectorAll('.msg-overlay-conversation-bubble');
    logToBackground(`Final check: ${finalCheck.length} panels remaining.`);
};

// Update the sendMessage function to use the updated wasMessageRecentlySent
const sendMessage = async (data) => {
    logToBackground('Starting sendMessage function');

    // First, try to find and click the "Message" button
    const messageButton = await waitForElm(SELECTORS.MESSAGE_BUTTON, 10000);
    if (messageButton) {
        logToBackground('Message button found, clicking it');
        messageButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for panel to open
    } else {
        logToBackground('Message button not found');
        return "Failed";
    }

    // Check if a message was sent recently after opening the panel
    if (await wasMessageRecentlySent()) {
        logToBackground('A message was sent within the last 90 days. Skipping this contact.');
        await closeMessagePanel();
        return "Skipped";
    }

    // Now look for the message input
    const inputElement = await waitForElm(SELECTORS.MESSAGE_INPUT, 10000);
    if (!inputElement) {
        logToBackground('Message panel not found');
        return "Failed";
    }
    logToBackground('Message panel found');

    // Focus and click the editor
    inputElement.focus();
    inputElement.click();
    logToBackground('Focused and clicked the editor');

    // Wait a bit to ensure the editor is ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the editor is active
    if (document.activeElement !== inputElement) {
        logToBackground('Editor is not the active element. Attempting to focus again.');
        inputElement.focus();
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Clear existing content
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    logToBackground('Cleared existing content');

    // Prepare message content
    const messageContent = data.messageTemplate
        .replace('{originConnectionName}', data.originFullName)
        .replace('{originLinkedInUrl}', data.originLinkedInUrl || ' ')
        .replace('{profileName}', data.firstName)
        .replace('{fullName}', data.fullName)
        .replace('{companyName}', data.companyName)
        .replace('{jobTitle}', data.jobTitle)
        .replace('{connectionLinkedInUrl}', data.connectionLinkedInUrl);

    // Simulate typing
    for (let i = 0; i < messageContent.length; i++) {
        document.execCommand('insertText', false, messageContent[i]);
        
        // Create and dispatch input event
        const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: messageContent[i]
        });
        inputElement.dispatchEvent(inputEvent);
        
        // Small delay between "keystrokes"
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    logToBackground('Message content inserted');

    // Dispatch a final input event
    const finalInputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
    });
    inputElement.dispatchEvent(finalInputEvent);

    // Wait for the send button to become enabled
    let sendButton;
    for (let i = 0; i < 40; i++) {  // Try for about 20 seconds
        sendButton = document.querySelector(SELECTORS.SEND_BUTTON);
        if (sendButton && !sendButton.disabled) {
            logToBackground('Send button is enabled.');
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!sendButton || sendButton.disabled) {
        logToBackground('Send button did not become enabled within the timeout period');
        await closeMessagePanel();
        return "Failed";
    }

    logToBackground('Clicking send button');
    sendButton.click();

    // Wait a bit for the message to be sent
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (wasMessageRecentlySent()) {
        logToBackground(`Message sent to ${data.firstName}`);
        chrome.runtime.sendMessage({ 
            type: "message-sent", 
            recipient: data.firstName,
            date: new Date().toLocaleDateString()
        });
        await closeMessagePanel();
        return "Done";
    } else {
        logToBackground("Message not found after sending");
        await closeMessagePanel();
        return "Failed";
    }
};

// Function to verify if a message was sent successfully
const verifyMessageSent = () => {
    if (wasMessageRecentlySent()) {
        const sentMessages = document.querySelectorAll(SELECTORS.MESSAGE_BUBBLE);
        if (sentMessages.length > 0) {
            const lastSentMessage = sentMessages[sentMessages.length - 1];
            return { success: true, content: lastSentMessage.textContent };
        }
    }
    return { success: false, reason: "Sent message not found in conversation" };
};

// Message listener for handling requests from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logToBackground(`Received message: ${JSON.stringify(request)}`);
    (async () => {
        try {
            switch (request.type) {
                case "get-connections-url":
                    sendResponse(await getConnectionsUrlProfileNameAndCompany());
                    break;
                case "load-connections":
                    sendResponse(await loadConnections());
                    break;
                case "load-connections-ajax":
                    sendResponse(await loadConnectionsAjax(request.pageNumber));
                    break;
                case "send-message":
                    const result = await sendMessage(request.data);
                    sendResponse({ result });
                    break;
                case "verify-message-sent":
                    logToBackground("Handling verify-message-sent request");
                    sendResponse(verifyMessageSent());
                    break;
                default:
                    sendResponse({ error: "Unknown request type" });
            }
        } catch (error) {
            logToBackground(`Error in message listener: ${error.message}`);
            sendResponse({ error: error.message, stack: error.stack });
        }
    })();
    return true;
});

// Log message indicating successful initialization
logToBackground("Content script loaded and initialized");

// Add this function to periodically clean up message panels
const periodicCleanup = async () => {
    await closeAllMessagePanels();
    setTimeout(periodicCleanup, 60000); // Run every minute
};

// Start the periodic cleanup
periodicCleanup();

// Updated closeMessagePanel function
const closeMessagePanel = async () => {
    const panel = document.querySelector('.msg-overlay-conversation-bubble');
    if (panel) {
        logToBackground('Searching for close button in panel');
        const svgUse = panel.querySelector(SELECTORS.CLOSE_BUTTON);
        if (svgUse) {
            const closeButton = svgUse.closest('button');
            if (closeButton) {
                logToBackground('Close button found. Clicking it.');
                closeButton.click();
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for panel to close
            } else {
                logToBackground('Close button not found');
            }
        } else {
            logToBackground('SVG use element not found');
        }
    } else {
        logToBackground('No message panel found');
    }
};