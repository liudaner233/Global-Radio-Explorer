import type { ReactNode } from 'react';
import { PanelLeftClose, PanelRightClose } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';

interface SidePanelProps {
  side: 'left' | 'right';
  children: ReactNode;
  hasPlayer?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  hideMobileToggle?: boolean;
}

export default function SidePanel({
  side,
  children,
  hasPlayer = false,
  collapsed,
  onToggle,
  hideMobileToggle,
}: SidePanelProps) {
  const reduced = useReducedMotion();
  const left = side === 'left';
  const Icon = left ? PanelLeftClose : PanelRightClose;
  const label = `${collapsed ? 'Expand' : 'Collapse'} ${side} sidebar`;
  const offset = left ? 'calc(-100% - 1rem)' : 'calc(100% + 1rem)';

  return (
    <div
      className={cn(
        'absolute top-0 z-40 pointer-events-none',
        hasPlayer ? 'bottom-[calc(var(--player-height,88px)+1rem)]' : 'bottom-6',
        left ? 'left-4' : 'right-4'
      )}
    >
      <motion.div
        animate={{ x: collapsed ? offset : '0%' }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 30 }}
        className="relative h-full"
      >
        <div
          inert={collapsed}
          aria-hidden={collapsed}
          className={cn('h-full', collapsed ? 'pointer-events-none' : 'pointer-events-auto')}
        >
          {children}
        </div>
        <button
          onClick={onToggle}
          aria-label={label}
          title={label}
          className={cn(
            'pointer-events-auto absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-white/10 bg-[#10141b]/85 text-white/60 shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:text-white',
            left ? '-right-11 hover:border-blue-400/40' : '-left-11 hover:border-rose-400/40',
            hideMobileToggle && 'max-md:invisible'
          )}
        >
          <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <Icon className="h-4 w-4" />
          </motion.div>
        </button>
      </motion.div>
    </div>
  );
}
