# LinkedIn Connection Manager

## Overview

LinkedIn Connection Manager is a powerful Chrome extension designed to streamline and automate the process of managing LinkedIn connections, collecting contact information, and sending personalized messages. This tool is perfect for professionals, recruiters, and networkers looking to expand their LinkedIn network efficiently.

## Features

- **Profile Link Collection**: Easily add and manage LinkedIn profile URLs.
- **Automated Connection Harvesting**: Collect connections from specified profiles with customizable limits.
- **Customizable Message Templates**: Create and save message templates for various networking scenarios.
- **Bulk Messaging**: Send personalized messages to collected connections automatically.
- **CSV Export**: Download collected connection data for external use or analysis.
- **Process Control**: Pause, resume, or stop the collection and messaging processes at any time.
- **Retry Mechanism**: Configurable retry attempts for failed operations.
- **Status Logging**: Real-time status updates and detailed logging for all operations.

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

1. Set the "Max links to collect per profile" in the Settings section.
2. Click the "Collect Links" button to start the process.
3. Monitor the Status Log for progress updates.

### Creating Message Templates

1. Select a predefined template or choose "Custom Template" from the dropdown.
2. Edit the message in the text area, using available placeholders for personalization.
3. Click "Save Message" to store your template.

### Sending Messages

1. After collecting connections, use the modal dialog to initiate the messaging process.
2. Choose "Send Messages" to start sending personalized messages to collected connections.

### Exporting Data

1. Click the "Download CSV" button to export collected connection data.

### Process Control

- Use the "Stop", "Pause", and "Force Continue" buttons to manage ongoing processes.

## Placeholders for Message Templates

- `{originConnectionName}`: The full name of the connection you want an intro to.
- `{profileName}`: The first name of the mutual connection you're messaging.
- `{fullName}`: The full name of the mutual connection you're messaging.
- `{companyName}`: The company name of the connection you want an intro to.
- `{jobTitle}`: The job title of the connection you want an intro to.
- `{connectionLinkedInUrl}`: The LinkedIn profile URL of the connection you want an intro to.

## Configuration

- Adjust the "Max links to collect per profile" and "Number of retry attempts" in the Settings section to customize the extension's behavior.

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