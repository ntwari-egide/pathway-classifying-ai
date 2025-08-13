 # AI Pathway Classification System

A sophisticated web application that uses artificial intelligence to automatically classify and reassign biological pathway classes. Built with modern web technologies and designed for researchers, bioinformaticians, and anyone working with biological pathway data.

🌐 **Live Demo**: [https://pathway-classifying-ai.vercel.app/](https://pathway-classifying-ai.vercel.app/)

## 🧬 What This Project Does

This application takes biological pathway data in TSV (Tab-Separated Values) format and uses AI to:

- **Analyze pathway descriptions** using advanced machine learning
- **Automatically assign pathway classes** based on biological context
- **Generate pathway subclasses** for more detailed categorization
- **Provide downloadable results** with all original data plus AI classifications
- **Sort results intelligently** by AI-assigned classifications for easy analysis

### Input Data Format
Your TSV file should contain these columns:
- **Pathway** - The pathway name/description
- **Pathway Class** - Original pathway class
- **Subclass** - Original subclass
- **Species** - The biological species
- **Source** - Database source
- **URL** - Link to the pathway
- **UniProt IDS** - UniProt identifiers (hidden in UI, included in downloads)

### Output Features
- **AI Class Assigned** - New pathway class determined by AI
- **AI Subclass Assigned** - New subclass determined by AI
- **Automatic sorting** by AI classifications (both in table and downloaded file)
- **Downloadable TSV** with all data including UniProt IDS, sorted by AI classifications
- **Search and filter** capabilities across all fields
- **Expandable rows** showing original pathway classifications for comparison

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Git installed
- A GitHub account
- A Vercel account (free)

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/pathway-classifying-ai.git
cd pathway-classifying-ai
```

### 2. Install Dependencies
```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Run Locally
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see your application running locally.

## 🚀 Deploy to Vercel (Automatic)

This project is configured for **automatic deployment** to Vercel. Here's how it works:

### 1. Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will automatically detect it's a Next.js project

### 2. Automatic Deployment
- **Every push to main branch** automatically deploys to production
- **Every pull request** gets a preview deployment
- **No manual deployment needed** - it's fully automated!

### 3. Environment Variables (if needed)
If your project needs environment variables:
1. Go to your project settings in Vercel
2. Add them in the "Environment Variables" section
3. Redeploy if needed

### 4. Custom Domain (Optional)
1. In Vercel project settings, go to "Domains"
2. Add your custom domain
3. Follow DNS configuration instructions

## 🏗️ Project Structure

```
pathway-classifying-ai/
├── src/
│   ├── component/          # React components
│   │   └── pathways.tsx   # Main pathways component
│   ├── pages/             # Next.js pages
│   │   ├── api/           # API routes
│   │   │   ├── pathways-assign.ts        # Main API endpoint
│   │   │   └── pathways-assign-stream.ts # Streaming API endpoint
│   │   └── index.tsx      # Home page
│   ├── lib/               # Utility functions
│   ├── styles/            # CSS and styling
│   └── types/             # TypeScript type definitions
├── public/                 # Static assets
├── vercel.json            # Vercel configuration
└── package.json           # Dependencies and scripts
```

## 🛠️ Technology Stack

- **Frontend**: Next.js 13, React 18, TypeScript
- **UI Components**: Ant Design, Tailwind CSS
- **AI Processing**: Custom API endpoints with streaming support
- **File Handling**: PapaParse for TSV parsing
- **Deployment**: Vercel (automatic)
- **Code Quality**: ESLint, Prettier, Husky

## 📁 Key Files Explained

### `src/component/pathways.tsx`
The main component that handles:
- File upload and parsing
- Data display in tables (Pathway, Species, Source, URL, AI Class, AI Subclass)
- Expandable rows showing original pathway classifications
- AI classification results
- Download functionality
- Search and filtering

### `src/pages/api/pathways-assign.ts`
Main API endpoint that:
- Receives pathway data
- Processes with AI classification
- Returns results with new classifications

### `src/pages/api/pathways-assign-stream.ts`
Streaming API endpoint for:
- Real-time progress updates
- Large file processing
- Better user experience

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run tests
npm run type-check   # Check TypeScript types
```

### Code Quality
- **ESLint**: Code linting and formatting
- **Prettier**: Consistent code formatting
- **Husky**: Git hooks for pre-commit checks
- **Conventional Commits**: Standardized commit messages

## 📊 How the AI Classification Works

1. **Data Upload**: User uploads TSV file with pathway data
2. **Data Parsing**: System parses and validates the input
3. **AI Processing**: Data is sent to AI classification service
4. **Classification**: AI analyzes pathway descriptions and assigns classes
5. **Results**: New classifications are added to the data
6. **Sorting**: Results are automatically sorted by AI classifications (Class → Subclass)
7. **Display**: Table shows sorted results for easy viewing
8. **Download**: User can download complete results with all data, sorted by AI classifications

## 🌐 API Endpoints

### POST `/api/pathways-assign`
- **Purpose**: Process pathways with AI classification
- **Input**: JSON with pathways array and resetCache option
- **Output**: TSV data with AI classifications

### POST `/api/pathways-assign-stream`
- **Purpose**: Stream processing for large files
- **Input**: Same as above
- **Output**: Server-Sent Events with progress updates

## 🚀 Deployment Workflow

### Automatic Deployment Process
1. **Push to GitHub**: Make changes and push to main branch
2. **Vercel Detection**: Vercel automatically detects the push
3. **Build Process**: Vercel builds your Next.js application
4. **Deployment**: New version is automatically deployed
5. **Live Update**: Your changes are live at your Vercel URL

### Manual Deployment (if needed)
```bash
# Build locally
npm run build

# Deploy to Vercel
vercel --prod
```

## 🔍 Troubleshooting

### Common Issues

**Build Fails on Vercel**
- Check that all dependencies are in `package.json`
- Ensure Node.js version is compatible (18+)
- Check build logs in Vercel dashboard

**Local Development Issues**
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check Node.js version: `node --version`
- Ensure all environment variables are set

**API Errors**
- Check API endpoint URLs
- Verify data format matches expected schema
- Check browser console for error messages

### Getting Help
1. Check the [Vercel documentation](https://vercel.com/docs)
2. Review [Next.js documentation](https://nextjs.org/docs)
3. Check GitHub issues for similar problems
4. Contact the development team

## 📈 Performance Features

- **Streaming API**: Real-time progress updates for large files
- **Lazy Loading**: Components load only when needed
- **Optimized Builds**: Production builds are optimized for performance
- **CDN**: Vercel provides global CDN for fast loading

## 🔒 Security Features

- **File Size Limits**: 20MB maximum file upload
- **Input Validation**: All input data is validated
- **CORS Protection**: Cross-origin requests are properly handled
- **Secure Headers**: Security headers are automatically applied

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Commit using conventional commits: `git commit -m "feat: add new feature"`
5. Push to your branch: `git push origin feature-name`
6. Create a Pull Request

### Commit Convention
This project uses [conventional commits](https://www.conventionalcommits.org/):
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Deployed on [Vercel](https://vercel.com/)
- UI components from [Ant Design](https://ant.design/)
- Styling with [Tailwind CSS](https://tailwindcss.com/)

## 📞 Support

- **Live Demo**: [https://pathway-classifying-ai.vercel.app/](https://pathway-classifying-ai.vercel.app/)
- **Issues**: Report bugs and request features on GitHub
- **Documentation**: Check the code comments and this README

---

**Ready to deploy?** Just push your changes to GitHub and Vercel will automatically deploy your new version! 🚀