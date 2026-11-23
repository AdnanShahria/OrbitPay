# ORBIT Payment Hub — Developer Onboarding & Project Handover Guide

> **Part of ORBIT Context Directory** | [Back to Master Context](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/context.md)

Welcome to **ORBIT Payment Hub**! This document is designed for any engineer, contractor, or team member joining the project or receiving a codebase handover.

---

## ⚡ 60-Second Architecture TL;DR

ORBIT Payment Hub automates bKash, Nagad, Rocket, Upay, and Cellfin payment verification across your multi-storefront e-commerce ecosystem without merchant trade licenses:

```
[Party 1: Buyer]  ──(1. Send Money & Enter TrxID)──►  [Party 2A: Storefront e.g. aurelia.shop]
       │                                                               ▲
       │ (SMS arrives on Merchant Phone)                               │ (3. Signed Webhook Callback)
       ▼                                                               │    POST /payment/v1
[Party 2B: Merchant Companion App] ──(2. Ingest SMS)──► [Party 3: payment.orbitsaas.cloud]
```

1. **Party 1 (Customer):** Sends money to the merchant's MFS number and inputs `TrxID` on the checkout modal.
2. **Party 2B (Companion Phone):** Sideloaded Kotlin daemon intercepts the telecom SMS or app push alert, extracts `TrxID` + `amount`, and syncs it to `payment.orbitsaas.cloud`.
3. **Party 3 (Central Hub):** Hono + Cloudflare D1 reconciles the checkout order with the SMS ledger.
4. **Party 2A (Client Storefronts):** If matched, an HMAC-SHA256 signed webhook triggers the specific client store's third-party API endpoint (e.g., `POST https://aurelia.shop/payment/v1` or `POST https://newznbd.shop/payment/v1`) to mark the order `PAID` and email the invoice to the customer.
5. If the merchant phone was offline, the order is queued for up to 60 minutes and auto-verified as soon as the companion phone reconnects.

---

## 🧭 Repository Navigation

```
Orbit Payment/
├── backend/                     <-- Hono API routes, D1 database schemas, reconciler engine
├── frontend/                    <-- React 19 Merchant Portal, BoardUI tokens, Checkout Widget
├── functions/api/               <-- Cloudflare Pages Functions entrypoint ([[route]].ts)
├── app/                         <-- Native Kotlin Companion APK (Room DB, WorkManager, SmsReceiver)
├── context/                     <-- Complete engineering context & specs
│   ├── context.md               <-- Master index and project overview
│   ├── architecture.md          <-- Sequence diagrams & third-party webhook API topology
│   ├── component.md             <-- BoardUI & Android Compose components
│   ├── ui tickets.md            <-- Sprint task backlog & issue tracker
│   ├── database.md              <-- Drizzle D1 schemas & Room DB models
│   ├── utils.feature edition.md <-- Multi-provider regex engines, Web Crypto HMAC, tiers
│   ├── activity_log.md          <-- Chronological prompts, edits & actions taken
│   └── handoff.md               <-- Handover & onboarding guide (this file)
├── requirement.md               <-- System Requirements Specification (SRS)
├── Startting.md                 <-- Implementation kickoff specs
├── .agents/skills/context/      <-- The /context slash command skill definition
├── AGENTS.md                    <-- Workspace rules enforcing /context intelligence
└── GEMINI.md                    <-- Project guidelines & context directives
```

---

## 🚀 How to Interact with the AI using `/context`

As a developer, you don't need to manually hunt through documentation or re-explain the system architecture in your prompts. Simply use the `/context` command:

- **Get an instant overview:**
  > `/context`
- **Query specific context:**
  > `/context what is our D1 schema for the SMS ledger?`  
  > `/context show me the sequence diagram for delayed SMS reconciliation`
- **Update context when you change something:**
  > `/context update: added a new refund API endpoint in backend/src/routes/refund.ts`  
  > `/context add ticket: create dark mode toggle for mobile dashboard`
- **Review recent activity:**
  > `/context history` or `/context activity`

The AI will intelligently parse what you want, pull from or update the corresponding files in `context/`, and record the date, prompt, and action taken in `context/activity_log.md`.
