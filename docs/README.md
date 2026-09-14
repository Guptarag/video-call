# Private 1-to-1 Video Calling Application: Technical Documentation

Welcome to the engineering documentation for the private 1-to-1 WebRTC video calling application.

This repository implements a confidential, direct peer-to-peer audio and video communication platform using Next.js, Node.js WebSocket signaling, and native browser WebRTC APIs.

---

## 📚 Documentation Index

| Document | Description |
| :--- | :--- |
| [architecture.md](file:///Users/amaravathi.guptha/Desktop/myspace/project-vc/p-v-c/docs/architecture.md) | High-level system architecture, plane separation (Signaling vs. Media), NAT traversal, and scalability topology. |
| [monorepo-structure.md](file:///Users/amaravathi.guptha/Desktop/myspace/project-vc/p-v-c/docs/monorepo-structure.md) | pnpm workspace directory layout, package boundaries, Turborepo configuration, and development commands. |
| [signaling-protocol.md](file:///Users/amaravathi.guptha/Desktop/myspace/project-vc/p-v-c/docs/signaling-protocol.md) | WebSocket protocol specification, message envelopes, JSON schemas, 1-to-1 room capacity enforcement, and error codes. |
| [webrtc-lifecycle.md](file:///Users/amaravathi.guptha/Desktop/myspace/project-vc/p-v-c/docs/webrtc-lifecycle.md) | Media capture, the W3C Perfect Negotiation pattern, glare handling, trickle ICE candidate queuing, and graceful teardown. |
| [security.md](file:///Users/amaravathi.guptha/Desktop/myspace/project-vc/p-v-c/docs/security.md) | DTLS-SRTP end-to-end encryption model, signaling security (WSS/CSWSH), ephemeral data policies, and browser permissions. |
| [implementation-plan.md](file:///Users/amaravathi.guptha/Desktop/myspace/project-vc/p-v-c/docs/implementation-plan.md) | Phased implementation roadmap with milestones, checklists, and acceptance criteria across 5 phases. |
| [deployment-guide.md](file:///Users/amaravathi.guptha/Desktop/myspace/project-vc/p-v-c/docs/deployment-guide.md) | Step-by-step free deployment guide using Vercel (Frontend), Render (Signaling WSS), and Google STUN. |

---

## 🛠 Technology Stack

- **Client**: [Next.js](https://nextjs.org/) (App Router, TypeScript, Tailwind CSS)
- **Signaling**: [Node.js](https://nodejs.org/) + [`ws`](https://github.com/websockets/ws) (WebSocket Server, TypeScript, `tsup`)
- **Transport**: Native WebRTC (`RTCPeerConnection`, `getUserMedia`, DTLS-SRTP, STUN)
- **Validation & Types**: [Zod](https://zod.dev/) + TypeScript
- **Monorepo**: [pnpm](https://pnpm.io/) workspaces + [Turborepo](https://turbo.build/repo)
