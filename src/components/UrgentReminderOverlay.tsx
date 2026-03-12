import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface UrgentReminder {
  id: string;
  taskName: string;
  triggeredAt: Date;
}

export const UrgentReminderOverlay = () => {
  const [reminder, setReminder] = useState<UrgentReminder | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dismissThreshold = 0.85; // 85% scroll to dismiss

  // Listen for urgent reminder events
  useEffect(() => {
    const handleUrgentReminder = (e: CustomEvent<UrgentReminder>) => {
      setReminder(e.detail);
      setScrollProgress(0);
      // Haptic burst for urgent attention
      triggerUrgentHaptics();
    };

    window.addEventListener('urgentReminderTriggered', handleUrgentReminder as EventListener);
    return () => window.removeEventListener('urgentReminderTriggered', handleUrgentReminder as EventListener);
  }, []);

  const triggerUrgentHaptics = async () => {
    try {
      for (let i = 0; i < 3; i++) {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await new Promise(r => setTimeout(r, 100));
      }
    } catch {}
  };

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    const progress = el.scrollTop / maxScroll;
    setScrollProgress(progress);

    if (progress >= dismissThreshold) {
      // Dismiss with haptic
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
      setReminder(null);
    }
  }, []);

  if (!reminder) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black"
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Main content - takes full viewport */}
          <div className="min-h-[100vh] flex flex-col items-center justify-center px-6 relative">
            {/* Pulsing background ring */}
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute w-64 h-64 rounded-full bg-destructive"
            />
            <motion.div
              animate={{ scale: [1.1, 1.5, 1.1], opacity: [0.08, 0.15, 0.08] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              className="absolute w-80 h-80 rounded-full bg-destructive"
            />

            {/* Alert icon */}
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="relative z-10 mb-8"
            >
              <div className="w-24 h-24 rounded-full bg-destructive flex items-center justify-center shadow-2xl shadow-destructive/50">
                <AlertTriangle className="w-12 h-12 text-destructive-foreground" />
              </div>
            </motion.div>

            {/* Label */}
            <motion.p
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="relative z-10 text-destructive font-bold text-lg tracking-widest uppercase mb-4"
            >
              URGENT REMINDER
            </motion.p>

            {/* Task name */}
            <h1 className="relative z-10 text-white text-3xl font-bold text-center max-w-sm leading-tight mb-12">
              {reminder.taskName}
            </h1>

            {/* Scroll instruction */}
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="relative z-10 flex flex-col items-center gap-2 text-white/50"
            >
              <p className="text-sm">Scroll down to dismiss</p>
              <ChevronDown className="w-6 h-6" />
              <ChevronDown className="w-6 h-6 -mt-4" />
            </motion.div>
          </div>

          {/* Extra scroll space for dismissal */}
          <div className="h-[80vh] flex items-center justify-center">
            <motion.div
              style={{ opacity: scrollProgress }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-16 h-16 rounded-full border-2 border-white/30 flex items-center justify-center">
                <ChevronDown className="w-8 h-8 text-white/50" />
              </div>
              <p className="text-white/40 text-sm">
                {scrollProgress >= dismissThreshold ? 'Releasing...' : 'Keep scrolling...'}
              </p>
            </motion.div>
          </div>
        </div>

        {/* Progress bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <motion.div
            className="h-full bg-destructive"
            style={{ width: `${Math.min(scrollProgress / dismissThreshold, 1) * 100}%` }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
