'use client';

import { motion } from 'framer-motion';
import type { FollowUpOption } from '../../lib/structuredResponse';

interface Props {
  question: string;
  options: FollowUpOption[];
  onSelect: (description: string) => void;
  disabled?: boolean;
}

export default function FollowUpChips({ question, options, onSelect, disabled }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="my-3"
      style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.55 : 1 }}
    >
      <div
        className="mb-2 leading-snug"
        style={{ color: 'var(--studio-text)', fontSize: 12.5, fontWeight: 600 }}
      >
        {question}
      </div>
      <motion.div
        className="flex flex-wrap gap-2"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
        }}
      >
        {options.map((opt, i) => (
          <motion.button
            key={`${opt.label}-${i}`}
            type="button"
            title={opt.description}
            onClick={() => onSelect(opt.description)}
            disabled={disabled}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0 },
            }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-full px-2.5 py-1 transition-colors"
            style={{
              background: 'var(--studio-elevated)',
              border: '1px solid var(--studio-border)',
              color: 'var(--studio-text)',
              fontSize: 11,
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              if (disabled) return;
              const el = e.currentTarget;
              el.style.background = 'color-mix(in srgb, var(--studio-accent) 13%, transparent)';
              el.style.borderColor = 'var(--studio-accent)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.background = 'var(--studio-elevated)';
              el.style.borderColor = 'var(--studio-border)';
            }}
          >
            {opt.label}
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}
