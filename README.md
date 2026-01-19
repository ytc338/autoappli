# AutoAppli

> **Smart Job Application Assistant powered by Google Gemini**

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8.svg?logo=tailwindcss)

**AutoAppli** is a Chrome extension designed to streamline your job application process. By leveraging the power of **Google Gemini**, it intelligently scans job postings and generates tailored, authentic responses to common application questions, helping you stand out with less effort.

## ✨ Key Features

- **📄 Intelligent Page Scanning**: Automatically detects company names, job descriptions, and key requirements from the active browser tab.
- **🤖 AI-Powered Generation**: Uses Google's Gemini models to draft personalized answers for questions like "Why do you want to work here?" or "Describe a challenge you faced."
- **🎯 Context Aware**: Generates responses that reference specific company values and product details found on the page.
- **⚡️ Instant Access**: seamlessly integrated into your browser toolbar for quick access during applications.
- **🔒 Privacy Focused**: Your API key is stored locally in your browser.

## 🛠️ How It Works

1.  **Navigate** to a job application page.
2.  **Open** the AutoAppli extension from your Chrome toolbar.
3.  **Click Generate**. The extension scans the page context and drafts a response.
4.  **Copy & Edit**. Review the generated text, make any personal tweaks, and paste it into the application form.

## 🚀 Getting Started

### Prerequisites

-   **Node.js** (v18 or higher recommended)
-   **Google Gemini API Key**: You can get one for free at [Google AI Studio](https://aistudio.google.com/).

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/AutoAppli.git
    cd AutoAppli
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Build the extension**
    ```bash
    npm run build
    ```

4.  **Load into Chrome**
    -   Open Chrome and navigate to `chrome://extensions/`.
    -   Toggle **Developer mode** in the top right corner.
    -   Click **Load unpacked**.
    -   Select the `dist` folder created in your project directory.

## ⚙️ Configuration

Once installed, click on the AutoAppli icon in your toolbar. You will be prompted to enter your **Google Gemini API Key**. This key is saved locally in your browser's storage and is used for all future requests.

## 💻 Development Workflow

If you want to contribute or modify the extension:

-   **Start Dev Server**:
    Runs the build in watch mode for hot-reloading (HMR).
    ```bash
    npm run dev
    ```

-   **Build for Production**:
    Type-checks and builds the optimized assets into the `dist` folder.
    ```bash
    npm run build
    ```

-   **Lint Code**:
    Runs ESLint to ensure code quality.
    ```bash
    npm run lint
    ```

## 🏗️ Technology Stack

-   **Frontend Framework**: [React 19](https://react.dev/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Bundler**: [Vite](https://vitejs.dev/)
-   **Extension Tooling**: [CRXJS Vite Plugin](https://crxjs.dev/vite-plugin)
-   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
-   **AI Integration**: [Google Generative AI SDK](https://www.npmjs.com/package/@google/generative-ai)

## 📂 Project Structure

```text
AutoAppli/
├── src/
│   ├── background/    # Service worker for background tasks
│   ├── content/       # Content scripts for page scanning
│   ├── components/    # Reusable React components
│   ├── popup/         # Main extension UI (App.tsx)
│   ├── utils/         # Helper functions (Gemini API, etc.)
│   └── main.tsx       # Entry point
├── dist/              # Production build output
├── manifest.json      # Chrome extension manifest
└── README.md          # Project documentation
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.
