/**
 * Fresh Reminder Scheduler
 * Clean implementation using @capacitor/local-notifications
 * Handles scheduling/cancelling reminders for tasks and notes
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

// Track scheduled urgent reminders for resume-check
const pendingUrgentReminders = new Map<string, { taskText: string; reminderTime: Date }>();

// Generate a stable numeric ID from a string ID
const hashStringToId = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
};

// In-app urgent reminder timers (fires overlay directly, no notification tap needed)
const urgentTimers = new Map<string, ReturnType<typeof setTimeout>>();

const scheduleUrgentInAppTimer = (taskId: string, taskText: string, reminderTime: Date) => {
  // Clear any existing timer for this task
  cancelUrgentInAppTimer(taskId);
  
  const delay = reminderTime.getTime() - Date.now();
  if (delay <= 0) return;
  
  const timer = setTimeout(() => {
    urgentTimers.delete(taskId);
    console.log('[Reminder] Urgent in-app timer fired for:', taskText);
    window.dispatchEvent(new CustomEvent('urgentReminderTriggered', {
      detail: {
        id: taskId,
        taskName: taskText,
        triggeredAt: new Date(),
        reminderTime: reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    }));
  }, delay);
  
  urgentTimers.set(taskId, timer);
  console.log('[Reminder] Urgent in-app timer set for', taskText, 'in', Math.round(delay / 1000), 'seconds');
};

const cancelUrgentInAppTimer = (taskId: string) => {
  const existing = urgentTimers.get(taskId);
  if (existing) {
    clearTimeout(existing);
    urgentTimers.delete(taskId);
  }
};

/**
 * Request notification permission (call once on app start)
 */
export const requestReminderPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch (e) {
    console.warn('[Reminder] Permission request failed:', e);
    return false;
  }
};

/**
 * Schedule a task reminder
 */
export const scheduleTaskReminder = async (
  taskId: string,
  taskText: string,
  reminderTime: Date,
  isUrgent?: boolean
): Promise<void> => {
  const now = new Date();
  if (reminderTime <= now) {
    console.log('[Reminder] Skipping past reminder for task:', taskText);
    return;
  }

  // For urgent reminders, ALWAYS set an in-app timer so it shows full-screen automatically
  if (isUrgent) {
    scheduleUrgentInAppTimer(taskId, taskText, reminderTime);
  }

  if (!Capacitor.isNativePlatform()) {
    console.log('[Reminder] Web: would schedule task reminder for', taskText, 'at', reminderTime, isUrgent ? '(URGENT)' : '');
    return;
  }

  const notifId = hashStringToId(`task-${taskId}`);

  try {
    await cancelTaskReminder(taskId);
    // Re-set the in-app timer since cancelTaskReminder clears it
    if (isUrgent) {
      scheduleUrgentInAppTimer(taskId, taskText, reminderTime);
    }

    // Track for resume-check
    if (isUrgent) {
      pendingUrgentReminders.set(taskId, { taskText, reminderTime });
    }

    const notificationConfig: any = {
      id: notifId,
      title: isUrgent ? '🚨 URGENT Task Reminder' : '📋 Task Reminder',
      body: taskText,
      schedule: { at: reminderTime, allowWhileIdle: true },
      channelId: isUrgent ? 'urgent-task-reminders' : 'task-reminders',
      extra: { type: 'task', taskId, isUrgent: isUrgent ? 'true' : 'false' },
    };

    // Android: fullScreenIntent wakes screen & shows app even from background
    if (Capacitor.getPlatform() === 'android' && isUrgent) {
      notificationConfig.fullScreenIntent = true;
    }

    await LocalNotifications.schedule({ notifications: [notificationConfig] });

    console.log('[Reminder] Scheduled task reminder:', taskText, 'at', reminderTime.toLocaleString(), isUrgent ? '(URGENT)' : '');
  } catch (e) {
    console.error('[Reminder] Failed to schedule task reminder:', e);
  }
};

/**
 * Cancel a task reminder
 */
export const cancelTaskReminder = async (taskId: string): Promise<void> => {
  // Always cancel the in-app urgent timer
  cancelUrgentInAppTimer(taskId);

  if (!Capacitor.isNativePlatform()) return;

  const notifId = hashStringToId(`task-${taskId}`);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
  } catch (e) {
    console.warn('[Reminder] Cancel task reminder failed:', e);
  }
};

/**
 * Schedule a note reminder
 */
export const scheduleNoteReminder = async (
  noteId: string,
  noteTitle: string,
  reminderTime: Date
): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    console.log('[Reminder] Web: would schedule note reminder for', noteTitle, 'at', reminderTime);
    return;
  }

  const now = new Date();
  if (reminderTime <= now) {
    console.log('[Reminder] Skipping past reminder for note:', noteTitle);
    return;
  }

  const notifId = hashStringToId(`note-${noteId}`);

  try {
    await cancelNoteReminder(noteId);

    await LocalNotifications.schedule({
      notifications: [{
        id: notifId,
        title: '📝 Note Reminder',
        body: noteTitle || 'You have a note reminder',
        schedule: { at: reminderTime, allowWhileIdle: true },
        channelId: 'note-reminders',
        extra: { type: 'note', noteId },
      }],
    });

    console.log('[Reminder] Scheduled note reminder:', noteTitle, 'at', reminderTime.toLocaleString());
  } catch (e) {
    console.error('[Reminder] Failed to schedule note reminder:', e);
  }
};

/**
 * Cancel a note reminder
 */
export const cancelNoteReminder = async (noteId: string): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  const notifId = hashStringToId(`note-${noteId}`);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
  } catch (e) {
    console.warn('[Reminder] Cancel note reminder failed:', e);
  }
};

/**
 * Create notification channels (call once on app init, Android only)
 */
export const createReminderChannels = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    await LocalNotifications.createChannel({
      id: 'task-reminders',
      name: 'Task Reminders',
      description: 'Reminders for your tasks',
      importance: 4, // HIGH
      visibility: 1, // PUBLIC
      vibration: true,
      sound: 'default',
    });

    await LocalNotifications.createChannel({
      id: 'urgent-task-reminders',
      name: 'Urgent Task Reminders',
      description: 'Urgent full-screen reminders for critical tasks',
      importance: 5, // MAX
      visibility: 1, // PUBLIC
      vibration: true,
      sound: 'default',
    });

    await LocalNotifications.createChannel({
      id: 'note-reminders',
      name: 'Note Reminders',
      description: 'Reminders for your notes',
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });

    console.log('[Reminder] Notification channels created');
  } catch (e) {
    console.warn('[Reminder] Channel creation failed:', e);
  }
};

/**
 * Initialize the reminder system (call once on app start)
 */
export const initializeReminders = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  await createReminderChannels();
  
  // Listen for notification received events to trigger urgent overlay IMMEDIATELY (full-screen)
  LocalNotifications.addListener('localNotificationReceived', (notification) => {
    if (notification.extra?.isUrgent === 'true') {
      window.dispatchEvent(new CustomEvent('urgentReminderTriggered', {
        detail: {
          id: notification.extra.taskId,
          taskName: notification.body || 'Urgent Task',
          triggeredAt: new Date(),
        }
      }));
    }
  });

  // Also listen for notification action (when user taps the notification)
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    if (action.notification.extra?.isUrgent === 'true') {
      window.dispatchEvent(new CustomEvent('urgentReminderTriggered', {
        detail: {
          id: action.notification.extra.taskId,
          taskName: action.notification.body || 'Urgent Task',
          triggeredAt: new Date(),
        }
      }));
    }
  });

  // Request permission after a short delay
  setTimeout(async () => {
    await requestReminderPermission();
  }, 1500);
};
