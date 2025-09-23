# ScreenGuide AI

**ScreenGuide AI** is an intelligent tool that transforms a series of screenshots into clear, step-by-step instructional guides. Powered by the Google Gemini API, it analyzes your images, generates descriptive text for each step, and formats it all into a professional document that you can edit, save, and export as a DOCX or PDF.

---

## ✨ Key Features

-   **🤖 AI-Powered Guide Generation:** Automatically creates titles and instructions from your screenshots using the Gemini API (`gemini-2.5-flash`).
-   **🌐 Multi-Language Support:** Generate guides in 6 languages: English, Dutch, Spanish, French, German, and Limburgish.
-   **✍️ Rich Text & Image Editing:**
    -   Click any text step to edit it directly.
    -   Use AI-powered tools to regenerate steps with different tones (shorter, longer, simpler, professional).
    -   Add, delete, merge, or reorder steps with a simple drag-and-drop interface.
-   **🎨 Built-in Image Annotator:** A powerful editor to enhance your screenshots with:
    -   Shapes (Rectangles, Circles)
    -   Arrows & Freehand Pencil
    -   Text & Numbered Steps
    -   Blur/Obfuscation for sensitive information
-   **🗂️ Local Session Management:**
    -   Save your work securely in your browser using IndexedDB.
    -   Load, delete, duplicate, and manage multiple guides without a backend.
-   **💾 Auto-Save & Recovery:** Never lose your progress. The app automatically saves your current session and prompts you to restore it on your next visit.
-   **📤 Multiple Export Options:**
    -   Download your guide as an editable **Microsoft Word (.docx)** file.
    -   Export a print-ready **PDF** document.
    -   Import/Export entire sessions as **JSON** files to share or back up your work.
-   **🌓 Light & Dark Mode:** A sleek, modern interface that's easy on the eyes.

---

## 🚀 Getting Started

To use the application, you need a Google Gemini API key.

### 1. Get a Gemini API Key

1.  Visit the **[Google AI Studio](https://aistudio.google.com/)**.
2.  Sign in with your Google account.
3.  Click the **"Get API key"** button.
4.  Select **"Create API key in new project"**.
5.  Copy the generated key to your clipboard.

### 2. Set Up the Application

1.  Open the ScreenGuide AI application.
2.  You will be prompted with a "Settings" modal.
3.  Paste your Gemini API key into the input field and click **"Save Key"**.

That's it! Your key is saved locally in your browser's storage, and you can now start generating guides.

---

## 🛠️ How to Use

1.  **Upload:** Drag and drop your screenshots into the upload area, paste them from your clipboard (Ctrl+V), or use the file selector.
2.  **Order:** Drag the screenshot thumbnails to arrange them in the correct sequence. The numbers on the thumbnails indicate the order.
3.  **Generate:** Select your desired output language from the dropdown and click the **"Generate"** button.
4.  **Refine & Edit:**
    -   Click on any generated text to modify it.
    -   Click the pencil icon on a text step to open the AI regeneration tools.
    -   Hover over a screenshot in the guide and click **"Annotate"** to open the image editor.
5.  **Save:** Click the **"Save"** button to store the session in the sidebar. This allows you to close the app and continue later.
6.  **Export:** When your guide is complete, use the **"DOCX"** or **"PDF"** buttons at the top to download your final document.

---

## 🏃 Run Locally

**Prerequisites:** [Node.js](https://nodejs.org/)

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Run the app:**
    ```bash
    npm run dev
    ```

---

## 🪟 Electron Shell (Windows)

Use the bundled Electron shell when you prefer a native desktop wrapper around the ScreenGuide AI web experience.

### Develop with the Electron shell

The command below starts both the Vite dev server and an Electron window that loads it:

```bash
npm run electron:dev
```

### Build a Windows installer

After a production Vite build is generated, Electron Builder packages the app into an `.exe` installer under `release/`:

```bash
npm run electron:build
```

> **Note:** Building Windows installers on non-Windows hosts may require [additional system dependencies](https://www.electron.build/multi-platform-build).

### Automatic click recording (Electron only)

When the app runs inside the Electron shell you can toggle **Automatic recording** in the uploader panel. While active, every click inside the window triggers a fresh screenshot that is queued alongside your manually added images, so you can walk through a flow without stopping to capture files yourself.

---

## 💻 Tech Stack

-   **Frontend:** React, TypeScript, Tailwind CSS
-   **AI Model:** Google Gemini API (`gemini-2.5-flash`) via `@google/genai` SDK
-   **Local Storage:** IndexedDB for robust client-side session storage.
-   **File Exporting:** `jspdf`, `html2canvas`, `docx`, `file-saver`

This project is built as a single-page application with no backend, running entirely in the browser.
## Native mouse hook (Windows)

If you want automatic recording to pick up clicks outside of the Electron window on Windows, build the helper once:

```bash
dotnet publish native/MouseHook/MouseHook.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true
```
Captures taken through the helper include a highlight around the cursor.

