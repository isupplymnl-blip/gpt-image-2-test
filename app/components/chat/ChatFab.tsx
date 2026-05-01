'use client';

import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

interface Props {
  onClick: () => void;
  hasUnread?: boolean;
}

export default function ChatFab({ onClick, hasUnread }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Open chat"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-teal-500 text-white shadow-lg shadow-violet-500/30 ring-1 ring-white/10 transition"
    >
      <MessageSquare size={24} strokeWidth={2} />
      {hasUnread && (
        <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
      )}
    </motion.button>
  );
}
