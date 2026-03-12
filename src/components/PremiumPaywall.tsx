import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Crown, Unlock, Bell, Check, Shield, Sparkles } from 'lucide-react';
import { useSubscription, ProductType } from '@/contexts/SubscriptionContext';
import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { triggerHaptic } from '@/utils/haptics';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { setSetting } from '@/utils/settingsStorage';

const PLANS = [
  { id: 'weekly' as ProductType, label: 'Weekly', price: '$1.99', period: '/wk', badge: null },
  { id: 'monthly' as ProductType, label: 'Monthly', price: '$5.99', period: '/mo', badge: 'Popular' },
  { id: 'yearly' as ProductType, label: 'Yearly', price: '$39.99', period: '/yr', badge: 'Best Value', savings: 'Save 45%' },
] as const;

export const PremiumPaywall = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showPaywall, closePaywall, unlockPro, purchase } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<ProductType>('monthly');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [adminError, setAdminError] = useState('');

  useHardwareBackButton({
    onBack: () => { closePaywall(); },
    enabled: showPaywall,
    priority: 'sheet',
  });

  if (!showPaywall) return null;

  const currentPlan = PLANS.find(p => p.id === selectedPlan)!;

  const handlePurchase = async () => {
    setIsPurchasing(true);
    setAdminError('');
    try {
      if (Capacitor.isNativePlatform()) {
        const success = await purchase(selectedPlan);
        if (success) {
          closePaywall();
        } else {
          setAdminError('Purchase was cancelled or failed. Please try again.');
          setTimeout(() => setAdminError(''), 4000);
        }
      } else {
        await unlockPro();
      }
    } catch (error: any) {
      if (error.code !== 'PURCHASE_CANCELLED' && !error.userCancelled) {
        console.error('Purchase failed:', error);
        setAdminError(`Purchase failed: ${error.message || 'Please try again.'}`);
        setTimeout(() => setAdminError(''), 5000);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const { customerInfo } = await Purchases.restorePurchases();
        const hasEntitlement = customerInfo.entitlements.active['npd Pro'] !== undefined;
        if (hasEntitlement) {
          await unlockPro();
          closePaywall();
        } else {
          setAdminError('No active purchases found. If you believe this is an error, please contact support.');
          setTimeout(() => setAdminError(''), 4000);
        }
      } else {
        setAdminError('Restore is only available on mobile devices');
        setTimeout(() => setAdminError(''), 3000);
      }
    } catch (error: any) {
      console.error('Restore failed:', error);
      setAdminError(error?.message || 'Restore failed. Please try again.');
      setTimeout(() => setAdminError(''), 4000);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleAccessCode = async () => {
    const validCode = 'BUGTI';
    if (adminCode.trim().toUpperCase() === validCode) {
      await setSetting('flowist_admin_bypass', true);
      await unlockPro();
    } else {
      setAdminError('Invalid access code');
      setAdminCode('');
    }
  };

  const getSubscriptionDescription = () => {
    switch (selectedPlan) {
      case 'weekly':
        return 'Payment of $1.99 will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews every week unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period.';
      case 'monthly':
        return 'Payment of $5.99 will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews every month unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period.';
      case 'yearly':
        return 'Payment of $39.99 will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews every year unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period.';
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
      {/* Close button */}
      <div className="flex justify-end px-4 py-2">
        <button onClick={closePaywall} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        {/* Title */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Crown className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t('onboarding.paywall.upgradeTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">Unlock the full Flowist experience</p>
        </div>
        
        {/* Features */}
        <div className="space-y-4 max-w-sm mx-auto mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Unlock size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{t('onboarding.paywall.unlockAllFeatures')}</p>
              <p className="text-muted-foreground text-xs">{t('onboarding.paywall.unlockAllFeaturesDesc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{t('onboarding.paywall.unlimitedEverything')}</p>
              <p className="text-muted-foreground text-xs">{t('onboarding.paywall.unlimitedEverythingDesc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{t('onboarding.paywall.proMember')}</p>
              <p className="text-muted-foreground text-xs">{t('onboarding.paywall.proMemberDesc')}</p>
            </div>
          </div>
        </div>

        {/* Plan selection */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-3 w-full max-w-sm">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => { setSelectedPlan(plan.id); triggerHaptic('light'); }}
                className={`flex-1 relative rounded-xl p-3 text-center border-2 transition-all ${
                  selectedPlan === plan.id 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border bg-card'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}
                <p className="font-bold text-sm text-foreground">{plan.label}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{plan.price}{plan.period}</p>
                {'savings' in plan && plan.savings && (
                  <p className="text-[10px] text-primary font-semibold mt-0.5">{plan.savings}</p>
                )}
                {selectedPlan === plan.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check size={10} className="text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Purchase button */}
          <button 
            onClick={handlePurchase}
            disabled={isPurchasing}
            className="w-full max-w-sm mt-2 btn-duo disabled:opacity-50"
          >
            {isPurchasing ? t('onboarding.paywall.processing') : `Subscribe — ${currentPlan.price}${currentPlan.period}`}
          </button>

          {/* Restore */}
          <button 
            onClick={handleRestore}
            disabled={isRestoring}
            className="text-primary font-medium text-sm disabled:opacity-50"
          >
            {isRestoring ? t('onboarding.paywall.restoring') : t('onboarding.paywall.restorePurchase')}
          </button>

          {adminError && (
            <p className="text-destructive text-xs">{adminError}</p>
          )}

          {/* Apple-required subscription disclosure */}
          <div className="mt-4 px-2 max-w-sm">
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              {getSubscriptionDescription()}
            </p>
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed mt-2">
              You can manage and cancel your subscription in your device's Settings → Apple ID → Subscriptions. Any unused portion of a free trial period will be forfeited when you purchase a subscription.
            </p>
          </div>

          {/* Terms & Privacy links — Apple required */}
          <div className="flex items-center justify-center gap-4 mt-2">
            <button 
              onClick={() => { closePaywall(); navigate('/terms'); }} 
              className="text-[11px] text-muted-foreground underline"
            >
              Terms of Use
            </button>
            <span className="text-muted-foreground text-[10px]">•</span>
            <button 
              onClick={() => { closePaywall(); navigate('/privacy'); }}
              className="text-[11px] text-muted-foreground underline"
            >
              Privacy Policy
            </button>
          </div>

          {/* Access Code */}
          <div className="mt-4 w-full max-w-sm pb-4">
            {!showAdminInput ? (
              <button 
                onClick={() => setShowAdminInput(true)}
                className="text-muted-foreground text-xs underline mx-auto block"
              >
                {t('onboarding.paywall.accessCode')}
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex gap-2 w-full">
                  <input
                    type="password"
                    value={adminCode}
                    onChange={(e) => {
                      setAdminCode(e.target.value.slice(0, 20));
                      setAdminError('');
                    }}
                    placeholder={t('onboarding.paywall.enterAccessCode')}
                    className="flex-1 px-4 py-2 border border-border rounded-lg text-center text-sm bg-card text-foreground focus:outline-none focus:border-primary"
                    maxLength={20}
                  />
                  <button
                    onClick={handleAccessCode}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                  >
                    {t('onboarding.paywall.apply')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
