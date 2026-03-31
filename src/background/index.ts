import { generateAnswer } from '../utils/gemini';
import type { ScannedData } from '../content/scanner';

console.log('Background script initialized');

const GENERATION_TIMEOUT_MS = 60_000;

interface GenerationJob {
  status: 'scanning' | 'generating' | 'done' | 'error';
  answer?: string;
  error?: string;
  url?: string;
  timestamp?: number;
}

async function setJob(job: GenerationJob) {
  await chrome.storage.local.set({ generationJob: job });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Generation timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'start_generation') {
    const { tabId, apiKey, resume, url, scannedData: preScanned } = request;

    // Run the async work
    (async () => {
      try {
        let scannedData: ScannedData;

        if (preScanned) {
          // Popup already scanned and user confirmed/edited the data
          scannedData = preScanned;
        } else {
          // Fallback: scan via content script
          await setJob({ status: 'scanning', url });
          const response = await chrome.tabs.sendMessage(tabId, { action: 'scan_page' });
          if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to scan page');
          }
          scannedData = response.data;
        }

        // Generate answer with Gemini
        await setJob({ status: 'generating', url, timestamp: Date.now() });

        const answer = await withTimeout(
          generateAnswer(apiKey, resume, scannedData),
          GENERATION_TIMEOUT_MS
        );

        if (!answer) {
          throw new Error("Received empty answer from AI");
        }

        // Step 3: Save answer and mark done
        const data = await chrome.storage.local.get(['savedAnswers']);
        const answers = (data.savedAnswers || {}) as Record<string, { text: string; timestamp: number }>;
        answers[url] = { text: answer, timestamp: Date.now() };
        await chrome.storage.local.set({ savedAnswers: answers });

        await setJob({ status: 'done', answer, url, timestamp: Date.now() });
      } catch (err: any) {
        await setJob({
          status: 'error',
          error: err.message || String(err),
          url,
        });
      }
    })();

    // Acknowledge receipt immediately
    sendResponse({ started: true });
    return true;
  }
});
