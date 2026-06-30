# CadLab 🧪🔌

CadLab is a web-based, git-centric collaboration, visualization, and version control platform designed specifically for hardware engineering and Printed Circuit Board (PCB) design. Think of it as **GitHub for CAD files**, enabling teams of electrical and hardware engineers to visually diff schematic and layout files, comment directly on specific coordinates and layers, collaborate in real-time, and run AI-assisted design audits.

---

## 🌟 Key Features

### 1. Multi-Format CAD Parsing & Visualization
*   **KiCad Support**: Native parsers for KiCad schematic (`.kicad_sch`) and layout (`.kicad_pcb`) s-expression formats.
*   **Autodesk Eagle Support**: Parser for Eagle XML-based schematic (`.sch`) and layout (`.brd`) formats.
*   **Interactive Hardware Canvas**: High-performance vector-based rendering of PCBs and schematics directly in the browser, supporting layer visibility toggling, zooming, and panning.

### 2. Visual PCB & Schematic Diffing
*   **Side-by-Side & Overlay Views**: Easily identify changes between revisions, commits, or branches.
*   **Logical & Physical Diffs**: Visual highlight of added, modified, or deleted components, tracks, vias, and copper zones.
*   **Diff Statistics**: Comprehensive summary statistics of additions and deletions per layer.

### 3. Spatial Annotations & Discussion Threads
*   **Layer-Specific Pinning**: Drop comment pins directly on coordinates (`x`, `y`) of specific PCB layers.
*   **Threaded Replies**: Discuss design decisions with team members directly on the board.
*   **Annotation Resolution**: Mark comments as resolved once design changes are addressed.

### 4. Real-Time Collaboration
*   **Yjs Integration**: Shared editing sessions, mouse pointer presence, and real-time state synchronization using CRDTs.
*   **WebRTC & WebSocket Fallbacks**: Robust connectivity modes for remote teamwork.

### 5. AI-Powered Assistant (Gemini)
*   **Design Auditing**: AI reviews schematics and layouts for common design rule errors or optimization opportunities.
*   **Usage Tracking**: Token usage tracking and limits integrated into user profiles.

### 6. Fully Integrated Git Engine
*   **Git Over HTTPS**: Powered by `isomorphic-git` for managing local workspace checkouts, diffs, history, and commits.
*   **GitHub Integration**: Seamless synchronization, authentication, and push/pull flows.

---

## 🛠️ Tech Stack

*   **Frontend Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions, React 19)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
*   **Database ORM**: [Prisma](https://www.prisma.io/)
*   **Database**: SQLite / LibSQL (Turso compatible)
*   **Real-Time Sync**: [Yjs](https://yjs.dev/) with `y-websocket` and `y-webrtc`
*   **Authentication**: [Clerk](https://clerk.com/)
*   **Storage**: S3-compatible object storage (Cloudflare R2 / AWS S3)
*   **AI Integration**: Google Gemini API via `@google/generative-ai`

---

## 📂 Repository Structure

```
CadLab/
├── prisma/                 # Database schema definitions and migrations
├── public/                 # Static assets (icons, images)
├── collab-server/          # Yjs-based WebSocket server for real-time collaboration
├── worker/                 # Background worker or auxiliary processing service
├── src/
│   ├── app/                # Next.js App Router (pages, APIs, layout)
│   │   ├── api/            # API endpoints (auth, files, upload, project)
│   │   ├── compare/        # Visual diffing interface page
│   │   ├── project/        # Repository and project view pages
│   │   └── page.tsx        # Homepage / Dashboard
│   ├── components/         # Reusable UI components
│   │   ├── diff-canvas.tsx         # PCB visual comparison canvas
│   │   ├── hardware-canvas.tsx     # Vector hardware renderer
│   │   └── side-by-side-canvas.tsx  # Side-by-side visual diff layout
│   ├── contexts/           # React context providers
│   ├── hooks/              # Custom React hooks (usePreview, etc.)
│   ├── lib/                # Core business logic
│   │   ├── ai/             # Gemini API integrations
│   │   ├── auth/           # Clerk authentication utilities
│   │   ├── canvas/         # Canvas rendering utilities
│   │   ├── collab/         # Yjs real-time setup
│   │   ├── diff/           # Core diff algorithms
│   │   ├── git/            # Local Git command layer
│   │   ├── github/         # GitHub API wrapper
│   │   ├── parsers/        # KiCad and Eagle file parsers
│   │   └── sourcing/       # Component sourcing integrations (DigiKey, etc.)
│   ├── utils/              # General helper functions (github, diff, fileUtils)
│   └── middleware.ts       # Clerk authentication middleware
```

---

## 🗄️ Database Schema

Prisma manages the SQLite database schema (`prisma/schema.prisma`), representing:
*   **User**: Profiles, Clerk/GitHub credentials, subscription level, and Gemini API token quotas.
*   **Repository**: Repositories managed by users, including git references, storage paths, and collaboration IDs.
*   **RepositoryMember**: Roles and access control permissions (`ADMIN`, `DEVELOPER`, `COMMENTER`, `VIEWER`).
*   **Commit**: Database cache of Git commit hashes, messages, authors, and timestamps.
*   **File**: Stored CAD files linked to repositories with storage provider tracking.
*   **Annotation**: Comment pins containing coordinates (`x`, `y`), layer details, content, resolution state, and parent/reply relations.
*   **Snapshot**: Rendered visual snapshots (`png`, `svg`, `pdf`) of CAD files for fast preview.
*   **Subscription**: Subscription tier tracking.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18.x or later)
*   [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
*   [Git](https://git-scm.com/)

### 2. Clone the Repository
```bash
git clone https://github.com/realruneett/Cadlab.git
cd Cadlab
```

### 3. Environment Variables Setup
Create a `.env` file in the root directory and configure the following variables:
```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_pub_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Database
DATABASE_URL="file:./dev.db"

# Cloud Storage (S3 / R2)
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=cadlab-storage

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key

# GitHub OAuth App Credentials (for git sync)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

### 4. Database Setup & Migrations
Initialize the SQLite database and run the Prisma migrations:
```bash
npx prisma migrate dev --name init
```

### 5. Running the Application
Start the Next.js development server:
```bash
npm run dev
```

For real-time collaboration features, make sure the collaboration WebSocket server is running:
```bash
cd collab-server
npm install
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## 🤝 Contributing

We welcome contributions from the community! If you'd like to contribute, please:
1. Fork the repository.
2. Create a new feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
