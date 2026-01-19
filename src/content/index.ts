import { scanPage } from './scanner';

console.log('AutoAppli Content Script Loaded');

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'scan_page') {
    try {
      const data = scanPage();
      sendResponse({ success: true, data });
    } catch (error) {
       console.error('Scan failed:', error);
       sendResponse({ success: false, error: (error as Error).message });
    }
  }
  // Return true to indicate we wish to send a response asynchronously (though here we are sync)
  // But good practice if we ever become async
  return true;
});
