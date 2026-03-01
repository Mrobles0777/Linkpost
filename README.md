<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c8ea1c4e-1ed0-4536-b529-fa85c9b9fef8

## Run Locally

**Prerequisites:** Node.js

1.  **Clone the repository.**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment**:
    - Create a `.env` file in the root directory.
    - Copy the contents from `.env.example`.
    - Set the `GEMINI_API_KEY` for AI features.
    - Set the `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` for LinkedIn integration.
4.  **Run the app**:
    ```bash
    npm run dev
    ```

## Features

- **LinkedIn Integration**: Connect and post directly to your profile.
- **AI Content Generation**: Powered by Google Gemini to create specialized data center and IA content.
- **Vite + React**: Modern frontend for a smooth user experience.
