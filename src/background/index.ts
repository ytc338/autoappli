import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ScannedData } from '../content/scanner';

console.log('Background script initialized');

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

async function generateAnswer(apiKey: string, resume: string, data: ScannedData): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `
Context: You are a helpful assistant for a job applicant. The user is applying for a job at "${data.companyName}" for the position of "${data.jobTitle}".

Job Description Snippet:
"${data.description.substring(0, 5000)}"

User Resume:
"${resume}"

Task: Write a genuine, professional, and enthusiastic answer to the question "Why do you want to join us?" or "What interests you about this position?".

Requirements:
- Make a direct reference to the company's products, culture, or specific requirements mentioned in the job description.
- Connect these details to the user's experience/skills in the resume.
- Keep the tone personal and human, avoiding overused AI buzzwords (like "delve", "foster", "testament").
- Keep it concise (around 100-150 words).
- Output ONLY the answer text, no preamble or quotes.
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text().trim();
  if (!text) throw new Error("Gemini returned empty response.");
  return text;
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
        await setJob({ status: 'generating', url });

        const answer = await generateAnswer(apiKey, resume, scannedData);

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
