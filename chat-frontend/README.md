# Tauri + Angular

This template should help you get started developing with Tauri and Angular.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) + [Angular Language Service](https://marketplace.visualstudio.com/items?itemName=Angular.ng-template).

## Documentation

For implementation guidance based on the Go backend (`chat-backend`), see:

- [`docs/frontend-architecture.md`](docs/frontend-architecture.md) - Complete frontend architecture and implementation guide
- [`docs/api-reference.md`](docs/api-reference.md) - Quick API reference with endpoints, models, and WebSocket protocol
- [`docs/implementation-checklist.md`](docs/implementation-checklist.md) - Phased implementation checklist

## Backend Integration

The frontend communicates with the Go backend at `http://localhost:8080` using:
- REST API for authentication, user management, rooms, and message history
- WebSocket for real-time messaging
- JWT authentication via `Authorization: Bearer <token>` header
