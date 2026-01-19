import { useEffect, useState } from 'react';
import { storage } from './utils/storage';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [resume, setResume] = useState('');
  const [activeTab, setActiveTab] = useState<'generate' | 'settings'>('generate');
  const [status, setStatus] = useState<string>('');
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');

  useEffect(() => {
    storage.get(['geminiApiKey', 'userResume']).then((data) => {
      if (data.geminiApiKey) setApiKey(data.geminiApiKey);
      if (data.userResume) setResume(data.userResume);
    });
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

    setStatus('Scanning page...');
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      
      if (!activeTab?.id) {
        setStatus('Error: No active tab found.');
        return;
      }

      if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('edge://')) {
          setStatus('Cannot scan browser settings pages.');
          return;
      }
      
      if (activeTab.url?.startsWith('https://chrome.google.com/webstore')) {
          setStatus('Cannot scan Chrome Web Store.');
          return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: 'scan_page' }, async (response: any) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          // If we can't connect, it often means the script isn't injected (invalidated context or restricted page)
          setStatus('Error: Could not connect. Try reloading the page.');
          return;
        }

        if (response && response.success) {
           setStatus('Generating answer with Gemini...');
           try {
             const { generateAnswer } = await import('./utils/gemini');
             const answer = await generateAnswer(apiKey, resume, response.data);
             setGeneratedAnswer(answer);
             setStatus('Done! Answer generated.');
           } catch (err: any) {
             setStatus('Error: ' + (err.message || String(err)));
           }
        } else {
           setStatus('Error scanning page: ' + (response?.error || 'Unknown error'));
        }
      });
    } catch (e: any) {
      setStatus('Dev mode / Error: ' + (e.message || String(e)));
      // For dev testing outside connection
      setTimeout(async () => {
         const { generateAnswer } = await import('./utils/gemini');
         // Mock data for dev
         const mockData = {
           companyName: "Google", 
           jobTitle: "Software Engineer", 
           description: "Build cool stuff.",
           url: "https://google.com"
         };
         try {
            const answer = await generateAnswer(apiKey, resume, mockData);
            setGeneratedAnswer(answer);
            setStatus('Dev Mode: Done!');
         } catch(err: any) {
             setStatus('Error: ' + (err.message || String(err)));
         }
      }, 1000);
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
             <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
                <p className="text-xs text-slate-500 mb-2">Instructions: Navigate to a job application page, then click Generate.</p>
                <button 
                  onClick={handleGenerate}
                  className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-medium text-sm flex justify-center items-center gap-2"
                >
                  <span>✨</span> Generate Answer
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

      {status && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-3 rounded-full opacity-90 shadow-lg">
          {status}
        </div>
      )}
    </div>
  );
}

export default App;
