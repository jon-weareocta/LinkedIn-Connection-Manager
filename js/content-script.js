// content-script.js

// This script runs in the context of LinkedIn web pages and interacts with the page content

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
  CLOSE_BUTTON: 'use[href="#close-small"]',
  CONVERSATION_CONTAINER: '.msg-conversations-container__conversations-list',
  LAST_MESSAGE_TIMESTAMP: '.msg-s-message-list__time-heading'
};

const TIMEOUTS = {
  ELEMENT_WAIT: 10000,
  SEND_MESSAGE: 2000,
  CLOSE_MESSAGE: 4000
};

// Helper functions for interacting with the DOM
const waitForElm = (selector, timeout = TIMEOUTS.ELEMENT_WAIT) => {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) return resolve(element);

    const observer = new MutationObserver((mutations) => {
      const elementFound = document.querySelector(selector);
      if (elementFound) {
        observer.disconnect();
        resolve(elementFound);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
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

// Functions for parsing dates and checking recent messages
function parseLinkedInDate(dateString) {
    const now = new Date();
    const year = now.getFullYear();

    if (dateString === 'Today') {
        return now;
    }

    if (dateString.startsWith('Yesterday')) {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return yesterday;
    }

    // Handle "Jul 2" format
    const monthMatch = dateString.match(/(\w{3})\s(\d{1,2})/);
    if (monthMatch) {
        const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(monthMatch[1]);
        const day = parseInt(monthMatch[2], 10);
        return new Date(year, month, day);
    }

    logToBackground(`Unable to parse date: ${dateString}`);
    return null;
}

function wasMessageRecentlySent() {
    logToBackground('Checking for recent messages');
    
    const timeHeadings = document.querySelectorAll(SELECTORS.LAST_MESSAGE_TIMESTAMP);
    if (timeHeadings.length > 0) {
        const mostRecentTimeHeading = timeHeadings[timeHeadings.length - 1];
        const relativeTime = mostRecentTimeHeading.textContent.trim();
        logToBackground(`Most recent time heading: ${relativeTime}`);
        
        const lastMessageDate = parseLinkedInDate(relativeTime);
        
        if (lastMessageDate) {
            const daysSinceLastMessage = (Date.now() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24);
            logToBackground(`Days since last message: ${daysSinceLastMessage}`);
            return daysSinceLastMessage < 30; // Consider messages sent within the last 30 days as recent
        }
    }
    
    logToBackground('No recent messages found');
    return false;
}

// Updated closeAllMessagePanels function
const closeAllMessagePanels = async () => {
    logToBackground('Attempting to close all message panels');
    const messagePanels = document.querySelectorAll('.msg-overlay-conversation-bubble');
    logToBackground(`Found ${messagePanels.length} message panels`);
    
    for (const panel of messagePanels) {
        logToBackground('Searching for close button in panel');
        const svgUse = panel.querySelector("button > svg > use[href='#close-small']");
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

// Function for sending messages to connections
const sendMessage = async (data) => {
    logToBackground(`Starting sendMessage function for ${data.firstName}`, data);

    // Close any existing message panels before starting
    await closeAllMessagePanels();

    logToBackground('Looking for send message button');
    const sendButton = await waitForElm(SELECTORS.CONNECTIONS_BUTTON);
    if (sendButton) {
        logToBackground('Send message button found. Clicking it.');
        sendButton.click();
    } else {
        logToBackground('Send message button not found');
        chrome.runtime.sendMessage({ type: "skip-error", reason: "Send message button not found" });
        return "Next";
    }

    logToBackground('Waiting for message panel to appear');
    const inputElement = await waitForElm(SELECTORS.MESSAGE_PANEL, 5000);
    if (!inputElement) {
        logToBackground("Message panel not found. Skipping to the next profile.");
        chrome.runtime.sendMessage({ type: "skip-error", reason: "Message panel not found" });
        return "Next";
    }
    logToBackground('Message panel found');

    logToBackground('Checking for existing conversation');
    if (wasMessageRecentlySent()) {
        logToBackground(`A message was sent to ${data.firstName} within the last 30 days. Skipping.`);
        chrome.runtime.sendMessage({ 
            type: "message-skipped", 
            reason: "Recent message",
            lastMessageDate: new Date().toLocaleDateString()
        });
        await closeAllMessagePanels();
        return "Skipped";
    }

    logToBackground('Preparing to send message');
    document.querySelector(".msg-form__placeholder")?.remove();
    inputElement.focus();
    const messageContent = data.messageTemplate
        .replace('{originConnectionName}', data.originFullName)
        .replace('{profileName}', data.firstName)
        .replace('{fullName}', data.fullName)
        .replace('{companyName}', data.companyName)
        .replace('{jobTitle}', data.jobTitle)
        .replace('{connectionLinkedInUrl}', data.connectionLinkedInUrl);

    logToBackground(`Message content: ${messageContent}`);
    inputElement.textContent = messageContent;
    logToBackground('Message content inserted');

    return new Promise((resolve) => {
        setTimeout(async () => {
            logToBackground('Clicking send button');
            const sendButton = document.querySelector(SELECTORS.SEND_BUTTON);
            if (sendButton) {
                sendButton.click();
                logToBackground('Send button clicked');
                
                if (wasMessageRecentlySent()) {
                    logToBackground(`Message sent to ${data.firstName}`);
                    chrome.runtime.sendMessage({ 
                        type: "message-sent", 
                        recipient: data.firstName,
                        date: new Date().toLocaleDateString()
                    });
                    await closeAllMessagePanels();
                    resolve("Done");
                } else {
                    logToBackground("Message not found after sending. Logging current DOM:");
                    logToBackground(document.body.innerHTML);
                    await closeAllMessagePanels();
                    resolve("Failed");
                }
            } else {
                logToBackground("Send button not found");
                resolve("Failed");
            }
            // Close panels after sending or if failed
            await closeAllMessagePanels();
        }, TIMEOUTS.SEND_MESSAGE);
    });
};

// Function to verify if a message was sent successfully
const verifyMessageSent = () => {
    if (wasMessageRecentlySent()) {
        const sentMessages = document.querySelectorAll('.msg-s-event-listitem__message-bubble');
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
                    logToBackground("Handling send-message request");
                    const result = await sendMessage(request.data);
                    logToBackground(`Send message result: ${result}`);
                    sendResponse(result);
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