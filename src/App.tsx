import { useEffect, useState, useRef } from 'react';
import { storage } from './utils/storage';

interface ScanPreview {
  companyName: string;
  jobTitle: string;
  description: string;
  url: string;
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [resume, setResume] = useState('');
  const [activeTab, setActiveTab] = useState<'generate' | 'settings'>('generate');
  const [status, setStatus] = useState<string>('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Preview state — populated by auto-scan on popup open
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [editCompany, setEditCompany] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  const POLL_TIMEOUT_MS = 90_000;

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const abortGeneration = async (message: string) => {
    setStatus(message);
    setIsGenerating(false);
    stopPolling();
    await chrome.storage.local.remove('generationJob');
  };

  const startPolling = () => {
    stopPolling();
    const pollStart = Date.now();
    pollRef.current = setInterval(async () => {
      // Stop polling if it has been running too long
      if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
        await abortGeneration('Error: Generation timed out — please try again.');
        return;
      }

      const data = await storage.get(['generationJob']);
      const job = data.generationJob;
      if (!job) return;

      // Detect stale jobs left by a crashed background worker
      if (job.timestamp && Date.now() - job.timestamp > POLL_TIMEOUT_MS) {
        await abortGeneration('Error: Generation timed out — please try again.');
        return;
      }

      if (job.status === 'scanning') {
        setStatus('Scanning page...');
      } else if (job.status === 'generating') {
        setStatus('Generating answer with Gemini...');
      } else if (job.status === 'done') {
        setGeneratedAnswer(job.answer || '');
        setStatus('Done! Answer generated.');
        setIsGenerating(false);
        stopPolling();
        await chrome.storage.local.remove('generationJob');
      } else if (job.status === 'error') {
        setStatus('Error: ' + (job.error || 'Unknown error'));
        setIsGenerating(false);
        stopPolling();
        await chrome.storage.local.remove('generationJob');
      }
    }, 500);
  };

  // Persist edits to storage so they survive popup close/reopen
  const saveEditsToStorage = async (url: string, company: string, jobTitle: string, description: string) => {
    const data = await storage.get(['scanPreviewEdits']);
    const edits = data.scanPreviewEdits || {};
    edits[url] = { companyName: company, jobTitle, description, timestamp: Date.now() };
    await storage.set({ scanPreviewEdits: edits });
  };

  // Force a fresh scan, clearing saved edits for this URL
  const rescanPreview = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tabs[0]?.url;
    if (currentUrl) {
      const data = await storage.get(['scanPreviewEdits']);
      const edits = data.scanPreviewEdits || {};
      delete edits[currentUrl];
      await storage.set({ scanPreviewEdits: edits });
    }
    runScanPreview();
  };

  // Apply scan data to state (used by both fresh scan and restore)
  const applyScanData = (data: ScanPreview) => {
    setPreview(data);
    setEditCompany(data.companyName);
    setEditJobTitle(data.jobTitle);
    setEditDescription(data.description);
  };

  // Auto-scan the page when popup opens to populate preview
  const runScanPreview = () => {
    setIsScanning(true);
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab?.id || currentTab.url?.startsWith('chrome://') || currentTab.url?.startsWith('edge://')) {
        setIsScanning(false);
        return;
      }

      const currentUrl = currentTab.url || '';
      const tabId = currentTab.id;

      // Check for saved edits first — restore them if they exist for this URL
      const saved = await storage.get(['scanPreviewEdits']);
      const edits = saved.scanPreviewEdits || {};
      const savedEdit = edits[currentUrl];

      if (savedEdit && savedEdit.timestamp && Date.now() - savedEdit.timestamp < TTL) {
        const restoredData: ScanPreview = {
          companyName: savedEdit.companyName,
          jobTitle: savedEdit.jobTitle,
          description: savedEdit.description,
          url: currentUrl,
        };
        applyScanData(restoredData);
        setIsScanning(false);
        return;
      }

      const handleScanResponse = (response: any) => {
        setIsScanning(false);
        if (chrome.runtime.lastError || !response?.success) return;

        const data = response.data as ScanPreview;
        applyScanData(data);
        saveEditsToStorage(currentUrl, data.companyName, data.jobTitle, data.description);
      };

      // Try messaging the content script; if it's not there, inject it and retry
      chrome.tabs.sendMessage(tabId, { action: 'scan_page' }, (response: any) => {
        if (chrome.runtime.lastError) {
          // Content script not loaded — inject it programmatically, then retry
          const manifest = chrome.runtime.getManifest();
          const contentScriptFiles = manifest.content_scripts?.[0]?.js || [];
          if (contentScriptFiles.length === 0) {
            setIsScanning(false);
            return;
          }
          chrome.scripting.executeScript(
            { target: { tabId }, files: contentScriptFiles },
            () => {
              if (chrome.runtime.lastError) {
                setIsScanning(false);
                return;
              }
              chrome.tabs.sendMessage(tabId, { action: 'scan_page' }, handleScanResponse);
            }
          );
          return;
        }
        handleScanResponse(response);
      });
    });
  };

  useEffect(() => {
    storage.get(['geminiApiKey', 'userResume']).then((data) => {
      if (data.geminiApiKey) setApiKey(data.geminiApiKey);
      if (data.userResume) setResume(data.userResume);
    });

    // Check for in-progress job first
    storage.get(['generationJob']).then((data) => {
      const job = data.generationJob;
      if (job && (job.status === 'scanning' || job.status === 'generating')) {
        // Discard stale jobs from a previous session / crashed worker.
        // Jobs without a timestamp were created by an older version — always stale.
        if (!job.timestamp || Date.now() - job.timestamp > POLL_TIMEOUT_MS) {
          setStatus('Previous generation timed out.');
          chrome.storage.local.remove('generationJob');
          return;
        }
        setIsGenerating(true);
        if (job.status === 'scanning') setStatus('Scanning page...');
        else setStatus('Generating answer with Gemini...');
        startPolling();
      } else if (job && job.status === 'done') {
        setGeneratedAnswer(job.answer || '');
        setStatus('Done! Answer generated.');
        chrome.storage.local.remove('generationJob');
      } else if (job && job.status === 'error') {
        setStatus('Error: ' + (job.error || 'Unknown error'));
        chrome.storage.local.remove('generationJob');
      }
    });

    // Check for saved answer for the current URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const currentUrl = tab?.url;

      if (currentUrl) {
        storage.get(['savedAnswers']).then((data) => {
          const answers = data.savedAnswers || {};
          const saved = answers[currentUrl];

          if (saved && saved.text && saved.timestamp) {
            if (Date.now() - saved.timestamp < TTL) {
              setGeneratedAnswer(saved.text);
            }
          } else if (typeof saved === 'string') {
            setGeneratedAnswer(saved);
          }
        });
      }
    });

    // Auto-scan for preview
    runScanPreview();

    return () => stopPolling();
  }, []);

  const saveSettings = async () => {
    await storage.set({ geminiApiKey: apiKey, userResume: resume });
    setStatus('Settings saved!');
    setTimeout(() => setStatus(''), 2000);
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setStatus('Please set API Key in Settings first.');
      return;
    }
    if (!resume) {
      setStatus('Please save your Resume in Settings first.');
      return;
    }
    if (!preview) {
      setStatus('Could not scan page. Try reloading.');
      return;
    }

    setStatus('Generating answer with Gemini...');
    setIsGenerating(true);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!currentTab?.id) {
        setStatus('Error: No active tab found.');
        setIsGenerating(false);
        return;
      }

      // Use the user-edited values merged with the scan data
      chrome.runtime.sendMessage(
        {
          action: 'start_generation',
          tabId: currentTab.id,
          apiKey,
          resume,
          url: currentTab.url,
          // Pass the user-confirmed/edited scan data so background skips re-scanning
          scannedData: {
            companyName: editCompany || preview.companyName,
            jobTitle: editJobTitle || preview.jobTitle,
            description: editDescription || preview.description,
            url: preview.url,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            setStatus('Error: ' + chrome.runtime.lastError.message);
            setIsGenerating(false);
            return;
          }
          if (response?.started) {
            startPolling();
          }
        }
      );
    } catch (e: any) {
      setStatus('Error: ' + (e.message || String(e)));
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedAnswer);
    setStatus('Copied to clipboard!');
    setTimeout(() => setStatus(''), 2000);
  };

  return (
    <div className="w-[350px] min-h-[400px] p-4 bg-slate-50 text-slate-900 font-sans">
      <header className="mb-4 flex justify-between items-center border-b pb-2 border-slate-200">
        <h1 className="text-xl font-bold text-indigo-600">AutoAppli</h1>
        <div className="space-x-2 text-sm">
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-2 py-1 rounded ${activeTab === 'generate' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Generate
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-2 py-1 rounded ${activeTab === 'settings' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Settings
          </button>
        </div>
      </header>

      <main>
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="Enter your Gemini API Key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Resume (Text)</label>
              <textarea
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                className="w-full h-40 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                placeholder="Paste your resume text here..."
              />
            </div>
            <button
              onClick={saveSettings}
              className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-medium text-sm"
            >
              Save Settings
            </button>
          </div>
        )}

        {activeTab === 'generate' && (
          <div className="space-y-4">
            {/* Scan preview */}
            <div className="p-3 bg-white border border-slate-200 rounded shadow-sm space-y-3">
              {isScanning ? (
                <p className="text-xs text-slate-400 text-center py-2">Scanning page...</p>
              ) : preview ? (
                <>
                  <div className="flex justify-end">
                    <button
                      onClick={rescanPreview}
                      className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Rescan page (discards edits)"
                    >
                      Rescan
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Company</label>
                    <input
                      type="text"
                      value={editCompany}
                      onChange={(e) => {
                        setEditCompany(e.target.value);
                        if (preview) saveEditsToStorage(preview.url, e.target.value, editJobTitle, editDescription);
                      }}
                      className="w-full p-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Position</label>
                    <input
                      type="text"
                      value={editJobTitle}
                      onChange={(e) => {
                        setEditJobTitle(e.target.value);
                        if (preview) saveEditsToStorage(preview.url, editCompany, e.target.value, editDescription);
                      }}
                      className="w-full p-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Description</label>
                    {!editDescription.trim() ? (
                      <div className="p-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-700">
                        No description detected. Paste the job description below for better results.
                      </div>
                    ) : editDescription.trim().length < 100 ? (
                      <div className="p-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-600 mb-1">
                        Description seems short — you can edit it below.
                      </div>
                    ) : null}
                    <textarea
                      value={editDescription}
                      onChange={(e) => {
                        setEditDescription(e.target.value);
                        if (preview) saveEditsToStorage(preview.url, editCompany, editJobTitle, e.target.value);
                      }}
                      className="w-full h-20 p-1.5 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                      placeholder="Paste job description here..."
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">Navigate to a job page and open this popup to scan.</p>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !preview}
                className={`w-full py-2 text-white rounded transition-colors font-medium text-sm flex justify-center items-center gap-2 ${
                  isGenerating || !preview
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    {status || 'Generating...'}
                  </>
                ) : (
                  <>
                    <span>✨</span> Generate Answer
                  </>
                )}
              </button>
            </div>

            {generatedAnswer && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium text-slate-700">Generated Answer:</label>
                  <button onClick={copyToClipboard} className="text-xs text-indigo-600 hover:text-indigo-800">Copy</button>
                </div>
                <textarea
                  readOnly
                  value={generatedAnswer}
                  className="w-full h-48 p-2 border border-slate-300 rounded bg-slate-50 text-xs resize-none focus:outline-none"
                />
              </div>
            )}
          </div>
        )}
      </main>

      {status && !isGenerating && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-3 rounded-full opacity-90 shadow-lg">
          {status}
        </div>
      )}
    </div>
  );
}

export default App;
