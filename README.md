# Video Analytics Assistant

A smart assistant that helps you understand your video performance and manage your video content using AI.

## What This Does

This application gives you two helpful AI assistants:

### 📊 Video Analytics Assistant
- **Understands your video data**: Ask questions about how your videos are performing
- **Finds problems**: Identifies errors and issues with your video streams
- **Creates reports**: Generates spoken summaries of your video analytics
- **Shows trends**: Creates charts and graphs of your video performance
- **Remembers conversations**: Keeps track of what you've discussed before

### 🎬 Media Manager Assistant  
- **Uploads videos**: Helps you add videos to your Mux account
- **Manages content**: Organizes and tracks your video library
- **Weather integration**: Provides weather information and recommendations
- **Secure playback**: Creates safe links for your videos

## What You Need

Before you can use this application, you'll need:

1. **A Mux account** - This is where your videos are stored and streamed
2. **An Anthropic API key** - This powers the AI assistant
3. **Node.js installed** on your computer (version 24 or newer)

## Getting Started

### Step 1: Download and Install
```bash
git clone <your-repo>
cd mux-mastra-agent
npm run install:all
```

### Step 2: Set Up Your Keys
1. Copy the example settings file:
   ```bash
   cp env.example .env
   ```

2. Open the `.env` file and add your keys:
   ```
   ANTHROPIC_API_KEY=your_key_here
   MUX_TOKEN_ID=your_token_id_here
   MUX_TOKEN_SECRET=your_token_secret_here
   ```

### Step 3: Start the Application
```bash
npm run dev
```

Once started, you can access:
- **Main application**: http://localhost:3000
- **Backend services**: http://localhost:3001

## How to Use

### Talking to the Video Analytics Assistant

You can ask questions like:

**Basic Analytics:**
- "Show me my recent video analytics"
- "What are my top performing videos?"
- "How many views did I get this week?"
- "Show me video metrics for the last 30 days"

**Error Analysis:**
- "What errors happened in the last 24 hours?"
- "Show me failed video uploads"
- "Are there any streaming issues with my videos?"
- "What playback errors occurred today?"

**Performance Reports:**
- "Create an audio report of my video performance"
- "Generate a summary of my video analytics"
- "Tell me about my video engagement rates"
- "What's the overall health of my video content?"

**Visual Data:**
- "Make a chart showing my video views over time"
- "Create a graph of my video engagement"
- "Show me a chart of video errors by day"
- "Generate a visualization of my video performance"

**Specific Video Analysis:**
- "Analyze the performance of video ID [your-video-id]"
- "Show me details about my most recent upload"
- "What's the quality score of my videos?"
- "How long do people watch my videos on average?"

### Talking to the Media Manager Assistant

You can ask things like:
- "Upload this video file"
- "What's the weather like today?"
- "Create a video from this web link"

## Key Features

- **🔒 Secure**: Your videos are protected with secure links
- **🎙️ Audio Reports**: Get spoken summaries of your analytics
- **📊 Visual Charts**: See your data in easy-to-understand graphs
- **💬 Natural Conversation**: Talk to the assistants like you would a person
- **🧠 Memory**: The assistants remember your previous conversations

## If Something Goes Wrong

### Common Problems and Solutions

**"Can't find the assistant"**
- Make sure you're using the right assistant name: `mux-analytics` or `media-vault`
- Check that the application is running properly

**"Can't connect to Mux"**
- Double-check your Mux credentials in the `.env` file
- Make sure your Mux account is active

**"Port is already in use"**
- The application might already be running
- Try stopping other applications or changing the port numbers in your `.env` file

## Getting Help

If you need more detailed information, check these files:
- `AGENT_MCP_CONFIGURATION.md` - How to configure the assistants
- `CHANGES_SUMMARY.md` - Recent updates and fixes
- `env.example` - Complete list of settings you can change

## What Powers This

This application uses:
- **Mastra** - The AI framework that makes the assistants work
- **Claude AI** - The artificial intelligence that understands your questions
- **Mux** - The video platform that stores and streams your content
- **React** - The technology that creates the user interface

---

Built with ❤️ using [Mastra](https://mastra.ai) and [Mux](https://mux.com)
