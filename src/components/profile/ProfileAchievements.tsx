import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Eye, Sparkles, Trophy, Award, Share2, Edit3, Check, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALL_ACHIEVEMENTS, loadAchievementsData } from '@/utils/gamificationStorage';
import { loadTodoItems } from '@/utils/todoItemsStorage';
import { loadNotesFromDB } from '@/utils/noteStorage';
import { loadStreakData } from '@/utils/streakStorage';
import { getJourneyBadges, loadJourneyData, JourneyBadge, RARITY_CONFIG, ALL_JOURNEYS } from '@/utils/virtualJourneyStorage';
import { MedalBadge } from '@/components/MedalBadge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { lazyHtml2canvas } from '@/utils/lazyHtml2canvas';
import { shareImageBlob } from '@/utils/shareImage';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';

const QRCodeSVG = lazy(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })));

interface CertMilestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

type SelectedItem = {
  icon: string;
  name: string;
  description: string;
  rarity?: string;
  earnedAt?: string;
  type: 'achievement' | 'journey' | 'certificate';
  journeyBadge?: JourneyBadge;
};

export const ProfileAchievements = ({ onViewCertificate }: { onViewCertificate?: () => void }) => {
  const { t } = useTranslation();
  const { profile, updateProfile } = useUserProfile();
  const [unlockedAchievements, setUnlockedAchievements] = useState<typeof ALL_ACHIEVEMENTS>([]);
  const [journeyBadges, setJourneyBadges] = useState<JourneyBadge[]>([]);
  const [journeyCompletionBadges, setJourneyCompletionBadges] = useState<JourneyBadge[]>([]);
  const [unlockedCerts, setUnlockedCerts] = useState<CertMilestone[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [badgeName, setBadgeName] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [customImage, setCustomImage] = useState<string>('');
  const cardRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBadgeName(profile.name || '');
    setCustomImage(profile.avatarUrl || '');
  }, [profile.name, profile.avatarUrl]);

  useEffect(() => {
    const load = async () => {
      const [achievements, tasks, notes, streak] = await Promise.all([
        loadAchievementsData(),
        loadTodoItems(),
        loadNotesFromDB(),
        loadStreakData('flowist_streak'),
      ]);

      const unlocked = ALL_ACHIEVEMENTS.filter(a => achievements.unlockedAchievements.includes(a.id));
      setUnlockedAchievements(unlocked);

      const jData = loadJourneyData();
      const jBadges = getJourneyBadges(jData);
      setJourneyBadges(jBadges.filter(b => b.type === 'milestone'));
      setJourneyCompletionBadges(jBadges.filter(b => b.type === 'journey_complete'));

      const completed = tasks.filter((t: any) => t.completed).length;
      const allCerts: CertMilestone[] = [
        { id: 'beginner', title: t('cert.beginner', 'Beginner'), description: t('cert.beginnerDesc', 'Complete 10 tasks & create 5 notes'), icon: '🌱', unlocked: completed >= 10 && notes.length >= 5 },
        { id: 'intermediate', title: t('cert.intermediate', 'Intermediate'), description: t('cert.intermediateDesc', 'Complete 50 tasks & 7-day streak'), icon: '⭐', unlocked: completed >= 50 && streak.longestStreak >= 7 },
        { id: 'advanced', title: t('cert.advanced', 'Advanced'), description: t('cert.advancedDesc', 'Complete 200 tasks & 30-day streak'), icon: '🏆', unlocked: completed >= 200 && streak.longestStreak >= 30 },
        { id: 'master', title: t('cert.master', 'Master'), description: t('cert.masterDesc', 'Complete 500 tasks & 100-day streak'), icon: '👑', unlocked: completed >= 500 && streak.longestStreak >= 100 },
      ];
      setUnlockedCerts(allCerts.filter(c => c.unlocked));
    };
    load();
  }, []);

  const hasAchievements = unlockedAchievements.length > 0;
  const hasJourneyBadges = journeyBadges.length > 0;
  const hasCerts = unlockedCerts.length > 0 || journeyCompletionBadges.length > 0;
  const hasAnything = hasAchievements || hasJourneyBadges || hasCerts;

  const handleShare = useCallback(async () => {
    if (!cardRef.current || !selectedItem) return;
    setIsSharing(true);
    try {
      const noExportEls = cardRef.current.querySelectorAll('[data-no-export="true"]');
      noExportEls.forEach(el => (el as HTMLElement).style.display = 'none');
      const canvas = await lazyHtml2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 3,
        useCORS: true,
      });
      noExportEls.forEach(el => (el as HTMLElement).style.display = '');
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Failed')), 'image/png');
      });
      await shareImageBlob({
        blob,
        fileName: `${selectedItem.type}-${selectedItem.name}.png`,
        title: selectedItem.name,
        text: `I earned "${selectedItem.name}" on Flowist! 🏅`,
        dialogTitle: 'Share',
      });
    } catch (err) {
      if ((err as Error)?.message !== 'Share canceled') {
        toast.error('Failed to share');
      }
    } finally {
      setIsSharing(false);
    }
  }, [selectedItem]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setCustomImage(url);
      updateProfile({ avatarUrl: url });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!hasAnything) {
    return (
      <div className="text-center py-8">
        <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{t('profile.noAchievementsYet', 'Complete tasks to earn badges & certificates!')}</p>
      </div>
    );
  }

  const jData = loadJourneyData();

  return (
    <>
      {/* Achievements Section */}
      {hasAchievements && (
        <>
          <h3 className="text-lg font-bold text-foreground mb-3">{t('profile.achievementsTitle', 'Achievements')}</h3>
          <div className="overflow-x-auto -mx-5 px-5 pb-2 scrollbar-hide">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {unlockedAchievements.map((badge, i) => (
                <motion.button
                  key={badge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setSelectedItem({ icon: badge.icon, name: badge.name, description: badge.description, type: 'achievement' })}
                  className="flex flex-col items-center p-3 rounded-2xl border bg-card border-warning/30 transition-all relative overflow-hidden w-[90px] shrink-0"
                >
                  <motion.div className="absolute inset-0 bg-gradient-to-b from-warning/10 to-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }} />
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl relative bg-gradient-to-br from-warning/25 to-warning/10">
                    {badge.icon}
                    <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-warning" />
                  </div>
                  <p className="text-[10px] font-semibold mt-1.5 text-center leading-tight line-clamp-2 text-foreground">{badge.name}</p>
                  <div className="w-full mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.6, delay: i * 0.05 }} className="h-full rounded-full bg-gradient-to-r from-success to-success/70" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Journey Badges Section */}
      {hasJourneyBadges && (
        <>
          <h3 className="text-lg font-bold text-foreground mt-6 mb-3">{t('profile.journeyBadges', 'Journey Badges')}</h3>
          <div className="overflow-x-auto -mx-5 px-5 pb-2 scrollbar-hide">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {journeyBadges.map((badge, i) => {
                const rarityConf = RARITY_CONFIG[badge.rarity];
                return (
                  <motion.button
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => setSelectedItem({ icon: badge.icon, name: badge.label, description: badge.description, rarity: rarityConf.label, earnedAt: badge.earnedAt, type: 'journey', journeyBadge: badge })}
                    className={cn(
                      "flex flex-col items-center p-3 rounded-2xl border bg-card transition-all relative overflow-hidden w-[100px] shrink-0",
                      "border-primary/30"
                    )}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-b from-primary/8 to-transparent"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
                    />
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl relative bg-gradient-to-br from-primary/20 to-primary/5">
                      {badge.icon}
                    </div>
                    <p className="text-[10px] font-semibold mt-1.5 text-center leading-tight line-clamp-2 text-foreground relative z-10">{badge.label}</p>
                    <p className={cn("text-[8px] font-medium mt-0.5 relative z-10", rarityConf.color)}>{rarityConf.label}</p>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Certificates Section */}
      {hasCerts && (
        <>
          <h3 className="text-lg font-bold text-foreground mt-6 mb-3">{t('profile.certificatesTitle', 'Certificates')}</h3>
          <div className="overflow-x-auto -mx-5 px-5 pb-2 scrollbar-hide">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {unlockedCerts.map((cert, i) => (
                <motion.div
                  key={cert.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => setSelectedItem({ icon: cert.icon, name: cert.title, description: cert.description, type: 'certificate' })}
                  className="flex flex-col items-center p-3 rounded-2xl border bg-card border-primary/20 cursor-pointer relative overflow-hidden w-[110px] shrink-0"
                >
                  <motion.div className="absolute inset-0 bg-gradient-to-b from-primary/8 to-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 relative z-10 bg-primary/10">
                    {cert.icon}
                  </div>
                  <p className="text-[11px] font-semibold mt-2 text-center relative z-10 text-foreground">{cert.title}</p>
                  <div className="mt-1 relative z-10">
                    <Eye className="h-3.5 w-3.5 text-primary mx-auto" />
                  </div>
                </motion.div>
              ))}
              {journeyCompletionBadges.map((badge, i) => {
                const rarityConf = RARITY_CONFIG[badge.rarity];
                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (unlockedCerts.length + i) * 0.06 }}
                    onClick={() => setSelectedItem({ icon: badge.icon, name: badge.label, description: badge.description, rarity: rarityConf.label, earnedAt: badge.earnedAt, type: 'journey', journeyBadge: badge })}
                    className="flex flex-col items-center p-3 rounded-2xl border bg-card border-warning/30 cursor-pointer relative overflow-hidden w-[110px] shrink-0"
                  >
                    <motion.div className="absolute inset-0 bg-gradient-to-b from-warning/10 to-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 relative z-10 bg-gradient-to-br from-warning/25 to-warning/10">
                      {badge.icon}
                      <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-warning" />
                    </div>
                    <p className="text-[11px] font-semibold mt-2 text-center relative z-10 text-foreground">{badge.label}</p>
                    <p className={cn("text-[8px] font-medium mt-0.5 relative z-10", rarityConf.color)}>{rarityConf.label}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Full Preview Detail Modal with Share */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => { setSelectedItem(null); setEditingName(false); }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 30 }}
              transition={{ type: 'spring', damping: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm"
            >
              {/* Shareable card */}
              <div
                ref={cardRef}
                className="rounded-2xl p-6 border shadow-lg text-center relative overflow-hidden bg-card"
                style={{ background: 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--card)) 60%, hsl(var(--muted)) 100%)' }}
              >
                {/* Decorative corner accents */}
                <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-warning/20 rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-warning/20 rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-warning/20 rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-warning/20 rounded-br-2xl" />

                {/* Close button */}
                <button
                  data-no-export="true"
                  onClick={() => { setSelectedItem(null); setEditingName(false); }}
                  className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-muted/60 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Custom user image */}
                <div className="flex justify-center mb-3">
                  <div className="relative">
                    {customImage ? (
                      <img src={customImage} alt="User" className="w-16 h-16 rounded-full object-cover border-2 border-warning/30" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center border-2 border-primary/20">
                        <span className="text-2xl font-bold text-primary">
                          {(badgeName || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <button
                      data-no-export="true"
                      onClick={() => imageInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow border border-background"
                    >
                      <ImagePlus className="h-3 w-3" />
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>

                {/* Badge/Icon display */}
                {selectedItem.journeyBadge ? (
                  <div className="flex justify-center mb-4">
                    <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.5, repeat: Infinity, repeatType: 'reverse' }}>
                      <MedalBadge badge={selectedItem.journeyBadge} size="lg" userName={badgeName || undefined} />
                    </motion.div>
                  </div>
                ) : (
                  <motion.div
                    className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-4 relative bg-gradient-to-br from-warning/25 to-warning/10 shadow-lg"
                  >
                    <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', delay: 0.2 }}>
                      {selectedItem.icon}
                    </motion.span>
                    {[...Array(6)].map((_, pi) => (
                      <motion.div
                        key={pi} className="absolute w-2 h-2 rounded-full bg-warning"
                        initial={{ opacity: 1, scale: 1 }}
                        animate={{ opacity: 0, scale: 0, x: Math.cos((pi * 60 * Math.PI) / 180) * 50, y: Math.sin((pi * 60 * Math.PI) / 180) * 50 }}
                        transition={{ duration: 0.8, delay: 0.3 + pi * 0.05 }}
                      />
                    ))}
                  </motion.div>
                )}

                <h3 className="text-xl font-bold text-foreground">{selectedItem.name}</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{selectedItem.description}</p>

                {selectedItem.rarity && (
                  <p className="text-xs font-semibold text-warning mt-2">{selectedItem.rarity}</p>
                )}

                {/* Journey badge stats */}
                {selectedItem.journeyBadge && (() => {
                  const progress = jData.journeyProgress[selectedItem.journeyBadge.journeyId];
                  if (!progress) return null;
                  const journey = ALL_JOURNEYS.find(j => j.id === selectedItem.journeyBadge!.journeyId);
                  const milestone = journey?.milestones.find(m => m.id === selectedItem.journeyBadge!.id);
                  const tasksForBadge = milestone?.tasksRequired ?? progress.tasksCompleted;
                  const earnedDate = selectedItem.earnedAt ? new Date(selectedItem.earnedAt) : new Date();
                  const days = Math.max(1, differenceInDays(earnedDate, new Date(progress.startedAt)));
                  return (
                    <div className="mt-3 flex items-center justify-center gap-4">
                      <div className="text-center">
                        <p className="text-lg font-black text-foreground">{tasksForBadge}</p>
                        <p className="text-[9px] text-muted-foreground">Tasks Done</p>
                      </div>
                      <div className="w-px h-8 bg-border" />
                      <div className="text-center">
                        <p className="text-lg font-black text-foreground">{days}</p>
                        <p className="text-[9px] text-muted-foreground">Days</p>
                      </div>
                    </div>
                  );
                })()}

                {selectedItem.earnedAt && (
                  <p className="text-[10px] text-muted-foreground/50 mt-3">
                    Earned {format(new Date(selectedItem.earnedAt), 'MMMM d, yyyy')}
                  </p>
                )}

                {/* Custom name section */}
                <div className="mt-3 pt-3 border-t border-border/40">
                  {editingName ? (
                    <div className="flex items-center gap-2 justify-center">
                      <input
                        type="text"
                        value={badgeName}
                        onChange={(e) => setBadgeName(e.target.value)}
                        placeholder="Enter your name"
                        className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground text-center w-44 outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                        maxLength={30}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingName(false);
                            updateProfile({ name: badgeName });
                          }
                        }}
                      />
                      <button onClick={() => { setEditingName(false); updateProfile({ name: badgeName }); }} className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {badgeName ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold text-sm text-foreground">{badgeName}</span>
                          <div className="w-16 h-0.5 rounded-full bg-primary/40" />
                          <button data-no-export="true" onClick={() => setEditingName(true)} className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                            <Edit3 className="h-2.5 w-2.5" /> Edit
                          </button>
                        </div>
                      ) : (
                        <button data-no-export="true" onClick={() => setEditingName(true)} className="flex items-center gap-1.5 mx-auto text-sm text-foreground/80 hover:text-foreground transition-colors">
                          <span className="font-semibold">Add your name</span>
                          <Edit3 className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Unlocked badge */}
                <div className="mt-3 inline-block px-4 py-1.5 rounded-full text-xs font-semibold bg-success/20 text-success">
                  ✅ {t('profile.badgeUnlocked', 'Unlocked')}
                </div>

                {/* QR Code + Branding */}
                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-center gap-3">
                  <div className="bg-white rounded-md p-1 flex items-center justify-center">
                    <Suspense fallback={<div className="w-16 h-16" />}>
                      <QRCodeSVG
                        value="https://play.google.com/store/apps/details?id=nota.npd.com"
                        size={48}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#000000"
                      />
                    </Suspense>
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-semibold text-foreground">Flowist</p>
                    <p className="text-[8px] text-muted-foreground/45">Scan to download the app</p>
                  </div>
                </div>
              </div>

              {/* Action buttons outside card */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleShare}
                  disabled={isSharing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  {isSharing ? 'Sharing...' : 'Share'}
                </button>
                <button
                  onClick={() => { setSelectedItem(null); setEditingName(false); }}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold text-foreground"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
