import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { migrateLocalStorageToIndexedDB, getSetting } from "./utils/settingsStorage";
import { migrateNotesToIndexedDB } from "./utils/noteStorage";
import { initializeProtectionSettings } from "./utils/noteProtection";
import { configureStatusBar } from "./utils/statusBar";
import { initializeTaskOrder } from "./utils/taskOrderStorage";

// No loading screen - render nothing during suspense for instant feel
const EmptyFallback = () => null;

// Schedule non-critical work after first paint
const scheduleDeferred = (fn: () => void) => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn, { timeout: 3000 });
  } else {
    setTimeout(fn, 100);
  }
};

// Render immediately — no blocking initializations
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<EmptyFallback />}>
      <App />
    </Suspense>
  </React.StrictMode>
);

// Defer ALL non-critical initialization until after first paint
scheduleDeferred(async () => {
  try {
    const [
      { startBackgroundScheduler },
      { initializeReminders },
      { initializeStreakNotifications },
      { initializeSmartNotifications },
    ] = await Promise.all([
      import("./utils/backgroundScheduler"),
      import("./utils/reminderScheduler"),
      import("./utils/streakNotifications"),
      import("./utils/smartNotifications"),
    ]);

    // Run migrations in parallel
    await Promise.all([
      migrateLocalStorageToIndexedDB(),
      migrateNotesToIndexedDB(),
      initializeTaskOrder(),
      initializeProtectionSettings(),
    ]);

    // Start background scheduler
    startBackgroundScheduler();

    // Fire-and-forget notification initializations
    initializeReminders().catch(console.warn);
    initializeStreakNotifications().catch(console.warn);
    initializeSmartNotifications().catch(console.warn);

    // Configure status bar
    const theme = await getSetting<string>('theme', 'light');
    await configureStatusBar(theme !== 'light');
  } catch (error) {
    console.error('Deferred initialization error:', error);
  }
});
