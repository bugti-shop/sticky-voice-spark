import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

interface UrgentReminder {
  id: string;
  taskName: string;
  reminderTime: Date;
}

export const FullScreenReminderOverlay = () => {
  const { t } = useTranslation();
  const [activeReminder, setActiveReminder] = useState<UrgentReminder | null>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(true);

  // Listen for urgent reminder events
  useEffect(() => {
    const handleUrgentReminder = (e: CustomEvent<UrgentReminder>) => {
      setActiveReminder(e.detail);
      setShowSwipeHint(true);
      // Vibrate aggressively
      try {
        Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
        // Multiple vibrations for urgency
        const interval = setInterval(() => {
          Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
        }, 1000);
        setTimeout(() => clearInterval(interval), 5000);
      } catch {}
    };

    window.addEventListener('urgentReminder', handleUrgentReminder as EventListener);
    return () => window.removeEventListener('urgentReminder', handleUrgentReminder as EventListener);
  }, []);

  // Check localStorage for pending urgent reminders on mount
  useEffect(() => {
    const checkPending = () => {
      try {
        const pending = localStorage.getItem('pendingUrgentReminder');
        if (pending) {
          const data = JSON.parse(pending);
          setActiveReminder(data);
          localStorage.removeItem('pendingUrgentReminder');
        }
      } catch {}
    };
    checkPending();
    // Also check periodically
    const interval = setInterval(checkPending, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSkip = useCallback(() => {
    setActiveReminder(null);
  }, []);

  if (!activeReminder) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="urgent-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex flex-col bg-destructive overflow-y-auto"
      >
        {/* Skip button at top */}
        <div className="flex justify-end p-4 pt-[env(safe-area-inset-top,16px)]">
          <button
            onClick={handleSkip}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Main content - centered */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 min-h-[60vh]">
          {/* Pulsing alert icon */}
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="mb-8"
          >
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
              <AlertTriangle className="h-14 w-14 text-white" />
            </div>
          </motion.div>

          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-extrabold text-white text-center mb-4 tracking-tight"
          >
            ⚡ {t('urgent.reminderTitle', 'URGENT REMINDER')}
          </motion.h1>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-sm bg-white/15 backdrop-blur-sm rounded-2xl p-6 mb-8"
          >
            <p className="text-2xl font-bold text-white text-center leading-relaxed">
              {activeReminder.taskName}
            </p>
          </motion.div>

          {/* Time */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-white/70 text-sm mb-12"
          >
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </motion.p>
        </div>

        {/* Scroll down to skip section */}
        <div className="flex flex-col items-center pb-12 px-8 min-h-[40vh] justify-end">
          {showSwipeHint && (
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex flex-col items-center gap-2 mb-8"
            >
              <ChevronDown className="h-6 w-6 text-white/50" />
              <p className="text-white/50 text-sm">
                {t('urgent.scrollToSkip', 'Scroll down to skip')}
              </p>
              <ChevronDown className="h-6 w-6 text-white/50" />
            </motion.div>
          )}

          <Button
            onClick={handleSkip}
            variant="outline"
            size="lg"
            className="w-full max-w-sm bg-white/20 border-white/30 text-white hover:bg-white/30 hover:text-white text-lg py-6 rounded-xl font-semibold"
          >
            {t('urgent.skipReminder', 'Skip Reminder')}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Helper to trigger an urgent reminder from anywhere
export const triggerUrgentReminder = (taskId: string, taskName: string) => {
  const event = new CustomEvent('urgentReminder', {
    detail: {
      id: taskId,
      taskName,
      reminderTime: new Date(),
    },
  });
  window.dispatchEvent(event);
};

// Store for when app is reopened
export const storePendingUrgentReminder = (taskId: string, taskName: string) => {
  try {
    localStorage.setItem('pendingUrgentReminder', JSON.stringify({
      id: taskId,
      taskName,
      reminderTime: new Date().toISOString(),
    }));
  } catch {}
};
