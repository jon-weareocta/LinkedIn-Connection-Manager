# LinkedIn Connection Manager

## Overview

LinkedIn Connection Manager is a powerful Chrome extension designed to streamline and automate the process of managing LinkedIn connections, collecting contact information, and sending personalized messages. This tool is perfect for professionals, recruiters, and networkers looking to expand their LinkedIn network efficiently.

## Features

- **Profile Link Collection**: Easily add and manage LinkedIn profile URLs.
- **Automated Connection Harvesting**: Collect connections from specified profiles with customizable limits.
- **Customizable Message Templates**: Create and save up to five message templates for various networking scenarios.
- **Bulk Messaging**: Send personalized messages to collected connections automatically with random template selection.
- **CSV Export**: Download collected connection data for external use or analysis.
- **Process Control**: Pause, resume, or stop the collection and messaging processes at any time.
- **Retry Mechanism**: Configurable retry attempts for failed operations.
- **Status Logging**: Real-time status updates and detailed logging for all operations.
- **Configurable Settings**: Fine-tune collection and messaging parameters to optimize performance and avoid detection.

## Installation

1. Clone this repository or download the source code.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the directory containing the extension files.

## Usage

### Adding Profile Links

1. Open the extension popup.
2. In the "Profile Management" section, enter LinkedIn profile URLs separated by commas.
3. Click the "Add" button to save the profiles.

### Collecting Connections

1. Configure the collection settings in the Settings section.
2. Click the "Collect Links" button to start the process.
3. Monitor the Status Log for progress updates.

### Creating Message Templates

1. Select a template (Message 1-5) from the dropdown.
2. Edit the message in the text area, using available placeholders for personalization.
3. Click "Save Message" to store your template.

### Sending Messages

1. After collecting connections, use the modal dialog to initiate the messaging process.
2. Choose "Send Messages" to start sending personalized messages to collected connections.
3. The extension will randomly select from your saved templates for each message.

### Exporting Data

1. Click the "Download CSV" button to export collected connection data.

### Process Control

- Use the "Stop", "Pause", and "Force Continue" buttons to manage ongoing processes.

## Placeholders for Message Templates

- `{originConnectionName}`: The full name of your direct connection (the person you're asking for an introduction)
- `{originLinkedInUrl}`: The LinkedIn profile URL of your direct connection
- `{profileName}`: The first name of the mutual connection you're trying to reach
- `{fullName}`: The full name of the mutual connection you're trying to reach
- `{companyName}`: The current company name of the mutual connection
- `{jobTitle}`: The current job title of the mutual connection
- `{connectionLinkedInUrl}`: The LinkedIn profile URL of the mutual connection you're trying to reach

## Configuration

Adjust the following settings in the extension popup:

- Max links to collect per profile
- Number of retry attempts
- Collection interval (seconds)
- Collection batch size
- Collection pause time (minutes)
- Messaging interval (seconds)
- Messaging batch size
- Messaging pause time (minutes)
- Daily collection limit
- Daily message limit

These settings allow you to fine-tune the extension's behavior to match your networking strategy and to help avoid detection by LinkedIn's systems.

## Detailed Implementation Logic

### Message Sending Process

1. **Initiating Contact**:
   - Locate the "Message" button using the selector: `button[aria-label^='Message']`
   - Click the button and wait 2000ms for the message panel to open

2. **Timestamp Check**:
   - After panel opens, find all elements with class `.msg-s-message-list__time-heading`
   - Extract text from the last (most recent) timestamp element
   - Parse the timestamp using the following priority:
     a. If contains "today" or "yesterday", use current date or previous day
     b. If matches a weekday, calculate the date based on the current day
     c. If contains ":", treat as time and use current date
     d. Otherwise, parse as "MMM DD, YYYY" format
   - Calculate days difference between parsed date and current date
   - If difference is less than 90 days, log "A message was sent within the last 90 days" and skip the contact

3. **Message Insertion**:
   - Locate the message input area using `.msg-form__contenteditable[contenteditable='true']`
   - Focus on the input area and clear any existing content
   - Insert message character by character with a 50ms delay between each to simulate typing
   - After insertion, dispatch a final 'input' event to ensure LinkedIn registers the message

4. **Sending the Message**:
   - Locate the send button using `.msg-form__send-button`
   - Check if the button is enabled every 500ms, for up to 20 seconds
   - Once enabled, click the send button
   - Wait 2000ms for the message to be sent

5. **Verification**:
   - Check if the sent message appears in the conversation
   - If found, log "Message sent to [FirstName]" and mark as successful
   - If not found, log "Message not found after sending" and mark as failed

6. **Closing the Panel**:
   - Locate the close button using `button > svg > use[href='#close-small']`
   - Click the close button
   - Wait 1000ms for the panel to close

### Retry Mechanism

- For each operation (collecting connections, sending messages):
  - Set a configurable number of retry attempts (default in settings)
  - If an operation fails, wait for a short delay (e.g., 5000ms)
  - Retry the operation up to the configured number of times
  - Log each retry attempt and its outcome

### Periodic Cleanup

- Every 60000ms (1 minute):
  - Scan for any open message panels
  - For each open panel:
    - Attempt to locate and click the close button
    - If unsuccessful, log the failure for debugging

### Error Handling

- For each key operation (button clicks, element searches, message sending):
  - Implement try-catch blocks to capture and log specific errors
  - If an error occurs, log detailed information including:
    - The specific operation that failed
    - Any relevant element selectors
    - The full error message and stack trace

### Logging

- Implement a `logToBackground` function that sends log messages to the background script
- Log key events with timestamps, including:
  - Start and end of each major operation
  - Successful message sends
  - Skipped contacts due to recent messages
  - Any errors or unexpected behaviors

## Privacy and Compliance

This extension is designed for personal use and should be used responsibly and in compliance with LinkedIn's terms of service. Always respect privacy settings and use the tool ethically.

## Troubleshooting

- If the extension isn't working as expected, check the browser console for error messages.
- Ensure you're logged into LinkedIn before using the extension.
- Clear the extension's storage and reload if you encounter persistent issues.

## Contributing

Contributions to improve LinkedIn Connection Manager are welcome. Please fork the repository and submit a pull request with your changes.

## License

[Specify your license here, e.g., MIT License]

## Disclaimer

This extension is not affiliated with, authorized, maintained, sponsored, or endorsed by LinkedIn or any of its affiliates or subsidiaries. Use at your own risk.