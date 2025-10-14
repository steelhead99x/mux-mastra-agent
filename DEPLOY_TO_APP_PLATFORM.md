# 🚀 Quick Start: Deploy to DigitalOcean App Platform

**Easiest way to deploy your Mux Mastra Agent in production!**

## 📋 Before You Start

Make sure you have:

✅ DigitalOcean account ([Sign up](https://www.digitalocean.com/))  
✅ Your code pushed to GitHub/GitLab  
✅ Your API keys ready (see below)  

### Required API Keys

- **Anthropic API Key** - Get from [Anthropic Console](https://console.anthropic.com/)
- **Mux Credentials** - Get from [Mux Dashboard](https://dashboard.mux.com/settings)
  - Token ID
  - Token Secret  
  - Signing Key ID
  - Signing Key Secret
- **Cartesia API Key** - Get from [Cartesia](https://cartesia.ai/)
- **Deepgram API Key** - Get from [Deepgram Console](https://console.deepgram.com/)

---

## 🎯 Quick Deploy (3 Steps)

### Step 1: Update Configuration

Edit `.do/app.yaml` and update your GitHub repo:

```yaml
github:
  repo: YOUR_GITHUB_USERNAME/mux-mastra-agent  # Change this!
  branch: main
```

### Step 2: Create App

**Option A: Use the Helper Script (Easiest)**

```bash
./.do/deploy.sh
# Choose option 1: Create new app
```

**Option B: Use Web Console**

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Connect GitHub and select this repo
4. Follow the wizard

### Step 3: Add Your API Keys

In the App Platform console:

1. Go to your app → web service → "Edit"
2. Scroll to "Environment Variables"
3. Add these secrets:

```bash
ANTHROPIC_API_KEY=your_key          # Mark as SECRET
MUX_TOKEN_ID=your_id                # Mark as SECRET
MUX_TOKEN_SECRET=your_secret        # Mark as SECRET
MUX_SIGNING_KEY_ID=your_id          # Mark as SECRET
MUX_SIGNING_KEY_SECRET=your_secret  # Mark as SECRET
CARTESIA_API_KEY=your_key           # Mark as SECRET
DEEPGRAM_API_KEY=your_key           # Mark as SECRET
```

4. Click "Save" → App will redeploy automatically

**That's it! Your app will be live in ~10 minutes.**

---

## 🔍 After Deployment

### 1. Get Your App URL

Your app will be at: `https://mux-mastra-agent-xxxxx.ondigitalocean.app`

### 2. Update CORS

Add your app URL to environment variables:

```bash
CORS_ORIGINS=https://mux-mastra-agent-xxxxx.ondigitalocean.app
VITE_MASTRA_API_HOST=https://mux-mastra-agent-xxxxx.ondigitalocean.app
```

### 3. Test Your App

Visit your URL and try:
- Upload a video
- Ask analytics questions
- Generate reports

---

## 💰 Cost

**Minimum recommended:** Professional-XS ($24/month)
- 1 vCPU, 2GB RAM
- Free SSL certificate
- 1TB bandwidth included
- Automatic scaling available

**Why Professional-XS?**  
This app needs at least 2GB RAM for:
- Canvas chart generation
- FFmpeg audio processing
- AI model operations

---

## 🛠️ Common Tasks

### View Logs

```bash
# In terminal
doctl apps logs YOUR_APP_ID --type run --follow

# Or use the helper script
./.do/deploy.sh
# Choose option 5: View logs
```

### Redeploy

```bash
# Automatic: just push to main
git push origin main

# Manual: use helper script
./.do/deploy.sh
# Choose option 6: Create deployment
```

### Add Custom Domain

1. App Platform → Your App → Settings → Domains
2. Add your domain
3. Update DNS:
   ```
   Type: CNAME
   Host: @
   Value: your-app.ondigitalocean.app
   ```
4. SSL will be auto-configured

---

## 📚 Full Documentation

For detailed instructions, troubleshooting, and advanced configuration:

- **App Platform Guide**: [docs/APP_PLATFORM_DEPLOYMENT.md](./docs/APP_PLATFORM_DEPLOYMENT.md)
- **General Deployment**: [docs/DIGITALOCEAN_DEPLOYMENT.md](./docs/DIGITALOCEAN_DEPLOYMENT.md)

---

## 🆘 Need Help?

**Common Issues:**

1. **Build fails** → Check Node version in Dockerfile (needs 24+)
2. **App crashes** → Check environment variables are set
3. **Out of memory** → Upgrade to Professional-S instance
4. **CORS errors** → Update `CORS_ORIGINS` with your app URL

**Get Support:**
- [DigitalOcean Community](https://www.digitalocean.com/community)
- [DigitalOcean Docs](https://docs.digitalocean.com/products/app-platform/)

---

## ✅ Deployment Checklist

- [ ] Updated `.do/app.yaml` with GitHub repo
- [ ] Pushed code to GitHub
- [ ] Created app in App Platform
- [ ] Added all API keys as secrets
- [ ] First deployment completed
- [ ] Updated CORS_ORIGINS with app URL
- [ ] Tested application works
- [ ] Configured alerts
- [ ] Added custom domain (optional)
- [ ] Setup monitoring

---

**Ready to deploy? Run `./.do/deploy.sh` to get started!** 🎉

